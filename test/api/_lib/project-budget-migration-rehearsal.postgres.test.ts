import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { previewProjectBudgetMapping } from "../../../api/_lib/finance-project-budget-foundation.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
import {
  applyProjectBudgetMigrations, approveProjectBudgetDepartmentPackage, projectBudgetFixture as f,
  projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, submitProjectBudgetDepartmentPackage,
  type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase,
} from "./project-budget-test-db.js";

const url = process.env.FINANCE_TEST_POSTGRES_URL;
const name = `helix_pba_migration_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Client | undefined, close: (() => Promise<void>) | undefined, db: ProjectBudgetTestDatabase;
const historyTables = ["budget_items", "purchases", "purchase_lines", "allocations", "documents", "invoice_obligations", "requests", "request_revisions", "request_lines", "request_decisions", "audit_log"] as const;
const before = new Map<string, Record<string, unknown>[]>();

async function rows(table: string) {
  // All names come from the fixed allowlist or pg_catalog in this disposable database.
  return (await db.query<{ row: Record<string, unknown> }>(`select to_jsonb(record) as row from finance."${table}" record order by to_jsonb(record)::text`)).rows.map(record => record.row);
}
async function financeState() {
  const tables = (await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname='finance' order by tablename")).rows;
  return Promise.all(tables.map(async table => [table.tablename, await rows(table.tablename)]));
}

describe.skipIf(!url)("legacy mapping rehearsal through migration074 on PostgreSQL", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) || connection.pathname !== "/postgres") throw new Error("Use the loopback postgres maintenance database.");
    admin = new pg.Client({ connectionString: connection.toString() }); await admin.connect(); await admin.query(`create database ${name}`);
    connection.pathname = `/${name}`;
    const resource = createPostgresTestPool({ connectionString: connection.toString(), max: 4 }); close = resource.close;
    db = { exec: sql => resource.pool.query(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await resource.pool.query(sql, params)).rows as T[] }) };
    await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db);
    const revision = randomUUID(), line = randomUUID(), decision = randomUUID(), voidPurchase = randomUUID(), voidLine = randomUUID();
    await db.query("insert into finance.request_revisions(id,request_id,revision_number,supplier_name,justification,planned_date) values($1::uuid,$2::uuid,1,'Historical supplier','Existing approved commitment','2026-12-01')", [revision, f.request]);
    await db.query("insert into finance.request_lines(id,revision_id,budget_item_id,ordinal,description,estimated_ore,approved_ore) values($1::uuid,$2::uuid,$3::uuid,1,'Committed material',50000,50000)", [line, revision, f.entry]);
    await db.query("insert into finance.request_decisions(id,revision_id,decision,reason,actor_member_id) values($1::uuid,$2::uuid,'approved','Existing legacy decision',$3::uuid)", [decision, revision, f.head]);
    await db.query("update finance.requests set status='approved',submitted_revision_id=$1::uuid,approved_revision_id=$1::uuid where id=$2::uuid", [revision, f.request]);
    const fixture = await resource.pool.connect();
    try { await fixture.query("begin");
    await fixture.query(`insert into finance.purchases(id,season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind,void_reason,voided_at,voided_by_member_id)
      values($1::uuid,$2::uuid,$3::uuid,'2026-0102','voided','Historical buyer','Historical supplier','team_account','2026-09-02','Returned material','receipt','Returned before migration','2026-09-03',$3::uuid)`, [voidPurchase, f.season, f.departmentLead]);
    await fixture.query("insert into finance.purchase_lines(id,purchase_id,public_ref,system_id,budget_item_id,description,quantity,amount_ore) values($1::uuid,$2::uuid,'2026-0102-L1',$3::uuid,$4::uuid,'Returned material',1,7000)", [voidLine, voidPurchase, f.system, f.entry]);
    await fixture.query("insert into finance.allocations(id,line_id,budget_item_id,public_ref,amount_ore) values($1::uuid,$2::uuid,$3::uuid,'2026-0102-L1-A1',7000)", [randomUUID(), voidLine, f.entry]);
    await fixture.query("insert into finance.audit_log(actor_member_id,entity,entity_id,field_name,old_value,new_value,reason) values($1::uuid,'purchase',$2,'voided','registered','voided','Existing historical audit')", [f.departmentLead, voidPurchase]);
    await fixture.query("commit"); } finally { await fixture.query("rollback"); fixture.release(); }
    for (const table of historyTables) before.set(table, await rows(table));
    expect(await applyProjectBudgetMigrations(db)).toContain("074_department_budget_packages.sql");
  }, 30_000);
  afterAll(async () => { try { await close?.(); if (admin) await admin.query(`drop database if exists ${name}`); } finally { await admin?.end(); } });

  it("writes nothing during dry run, then replaces one legacy plan once after both real reviews while retaining all history", async () => {
    const finance = createFinanceServices({ db, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole) });
    const manifest = [{ budgetItemId: f.entry, projectId: f.project, responsibleDepartmentId: f.department }];
    const state = await financeState();
    const valid = await previewProjectBudgetMapping(db, projectBudgetIdentity("head"), "S27", manifest);
    expect(valid).toMatchObject({ valid: true, mappedTotalNok: "10000.00", unmappedTotalNok: "5000.00", rows: [{ publicRef: "BI-S27-001", actualNok: "1200.00" }] });
    const conflict = await previewProjectBudgetMapping(db, projectBudgetIdentity("head"), "S27", [manifest[0], manifest[0]]);
    expect(conflict).toMatchObject({ valid: false, conflicts: [{ code: "duplicate_entry" }] });
    expect(await financeState()).toEqual(state);
    const created = await finance.mutate("lead", { action: "createProjectBudget", requestId: randomUUID(), projectId: f.project, responsibleDepartmentId: f.department });
    let budget = await finance.projectBudget("lead", created.id!);
    await finance.mutate("lead", { action: "adoptProjectBudgetEntries", requestId: randomUUID(), projectBudgetId: budget.id, expectedRevision: budget.revision, entries: [{ budgetItemId: f.entry }] });
    budget = await finance.projectBudget("lead",budget.id);
    const adopted = budget.pendingVersion!.entries[0];
    await finance.mutate("lead", { action: "saveProjectBudgetEntry", requestId: randomUUID(), projectBudgetId: budget.id, expectedRevision: budget.revision, entry: { ...adopted, plannedNok: "12000.00" } });
    budget = await finance.projectBudget("lead",budget.id);
    expect(budget).toMatchObject({ approvedVersionId: null, pendingStage: "draft", pendingTotalNok: "12000.00" });
    expect(budget.decisions.map(row=>row.action)).not.toContain("sendDepartmentBudgetPackage");
    expect((await db.query("select id,source,planned_ore::text from finance.effective_budget_entries where id=$1::uuid",[f.entry])).rows).toEqual([{ id:f.entry,source:"legacy",planned_ore:"1000000" }]);
    await finance.mutate("lead", { action:"submitProjectBudget",requestId:randomUUID(),projectBudgetId:budget.id,expectedRevision:budget.revision });
    budget = await finance.projectBudget("lead",budget.id);
    const sent = await submitProjectBudgetDepartmentPackage(finance,budget); budget = sent.budget;
    const packet = await finance.departmentBudgetPackage("head",sent.packageId);
    expect(packet.snapshot).toMatchObject({ approvedTotalNok:"10000.00",proposedTotalNok:"12000.00",legacyTotalNok:"10000.00",proposedLegacyTotalNok:"0.00" });
    expect((await db.query("select source from finance.effective_budget_entries where id=$1::uuid",[f.entry])).rows).toEqual([{ source:"legacy" }]);
    budget = await approveProjectBudgetDepartmentPackage(finance,budget);
    expect(budget).toMatchObject({ approvedTotalNok:"12000.00",pendingVersionId:null });
    expect(budget.decisions.map(row=>row.action)).toEqual(["createProjectBudget","adoptProjectBudgetEntries","saveProjectBudgetEntry","submitProjectBudget","sendDepartmentBudgetPackage","approveDepartmentBudgetPackage"]);
    expect((await db.query("select id,source,planned_ore::text from finance.effective_budget_entries where id=$1::uuid",[f.entry])).rows).toEqual([{ id:f.entry,source:"project",planned_ore:"1200000" }]);
    expect((await db.query("select count(*)::integer as count,sum(planned_ore)::text as planned from finance.effective_budget_entries")).rows).toEqual([{count:3,planned:"1700000"}]);
    expect((await db.query("select sum(amount_ore)::text as actual from finance.registered_allocation_facts")).rows).toEqual([{actual:"200000"}]);
    for (const table of historyTables) {
      const current = await rows(table);
      for (const original of before.get(table)!) expect(current.find(row=>row.id===original.id),`Preserve ${table} ${original.id}`).toMatchObject(original);
    }
    const remaining = await previewProjectBudgetMapping(db,projectBudgetIdentity("head"),"S27",[]);
    expect(remaining.unmapped.map(row=>row.budgetItemId)).toEqual([f.electronicEntry]);
  });
});
