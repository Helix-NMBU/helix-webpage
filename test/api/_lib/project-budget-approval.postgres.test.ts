import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
const url = process.env.FINANCE_TEST_POSTGRES_URL;
const name = `helix_pba_approval_${process.pid}_${Date.now()}`;
let admin: pg.Client, pool: pg.Pool, close: (() => Promise<void>) | undefined, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const entry = { systemId: f.system, description: "Frame tubes", category: "material", plannedNok: "6000.00", ordinaryPriority: "P1", reuseStatus: "new", status: "planned" };
const mutate = (role: ProjectBudgetFixtureRole, body: Record<string, unknown>) => services.mutate(role, { requestId: randomUUID(), ...body });
async function draft() {
  const project = randomUUID();
  await db.query("insert into project_management.projects values($1::uuid,'S27','Frame approval test',array[$2::uuid],array['Mechanical & Production'],1)", [project, f.lead]);
  const created = await mutate("lead", { action: "createProjectBudget", projectId: project, responsibleDepartmentId: f.department });
  await mutate("lead", { action: "saveProjectBudgetEntry", projectBudgetId: created.id, expectedRevision: created.revision, entry });
  return services.projectBudget("lead", created.id!);
}
describe.skipIf(!url)("project approval transactions on independent PostgreSQL connections", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) || connection.pathname !== "/postgres") throw new Error("Use the loopback postgres maintenance database for project budget tests.");
    admin = new pg.Client({ connectionString: connection.toString() }); await admin.connect(); await admin.query(`create database ${name}`);
    connection.pathname = `/${name}`;
    const resource = createPostgresTestPool({ connectionString: connection.toString(), max: 6 }); pool = resource.pool; close = resource.close;
    db = { exec: sql => pool.query(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params)).rows as T[] }) };
    await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); expect(await applyProjectBudgetMigrations(db)).toContain("068_project_budget_approval.sql");
    services = createFinanceServices({ db, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole) });
  });
  afterAll(async () => { try { await close?.(); if (admin) await admin.query(`drop database if exists ${name}`); } finally { await admin?.end(); } });
  it("publishes once when department and final approval requests race, preserving stable anchors and all legacy actuals", async () => {
    let budget = await draft();
    const entryId = budget.pendingVersion!.entries[0].entryId;
    const write = async (role: ProjectBudgetFixtureRole, action: string, requestId = randomUUID()) => mutate(role, { action, requestId, projectBudgetId: budget.id, expectedRevision: budget.revision });
    await write("lead", "submitProjectBudget"); budget = await services.projectBudget("lead", budget.id);
    await expect(write("head", "approveProjectBudget")).rejects.toMatchObject({ status: 409 });
    const department = await Promise.allSettled([write("departmentLead", "approveDepartmentBudget"), write("departmentLead", "approveDepartmentBudget")]);
    expect(department.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(department.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    budget = await services.projectBudget("lead", budget.id);
    await expect(write("finance", "approveProjectBudget")).rejects.toMatchObject({ status: 403 });
    const final = await Promise.allSettled([write("head", "approveProjectBudget"), write("head", "approveProjectBudget")]);
    expect(final.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(final.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    budget = await services.projectBudget("head", budget.id);
    expect(budget).toMatchObject({ pendingVersion: null, approvedVersion: { status: "approved", entries: [{ entryId, budgetItemId: entryId }] } });
    expect(budget.decisions.filter(d => d.action === "approveDepartmentBudget")).toHaveLength(1);
    expect(budget.decisions.filter(d => d.action === "approveProjectBudget")).toHaveLength(1);
    expect((await db.query<{ planned: string; actual: string }>("select e.planned_ore::text as planned,a.amount_ore::text as actual from finance.effective_budget_entries e join finance.allocations a on a.budget_item_id=e.id where e.id=$1::uuid", [f.entry])).rows).toEqual([{ planned: "1000000", actual: "120000" }]);
  });
  it("replays concurrent identical requests without duplicating the audit or decision", async () => {
    let budget = await draft();
    const body = { action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision, requestId: randomUUID() };
    const values = await Promise.all([mutate("lead", body), mutate("lead", body)]);
    expect(values.map(v => v.revision)).toEqual([budget.revision + 1, budget.revision + 1]);
    expect(values.filter(v => "replayed" in v && v.replayed)).toHaveLength(1);
    budget = await services.projectBudget("lead", budget.id);
    expect(budget.decisions.filter(d => d.action === "submitProjectBudget")).toHaveLength(1);
    await expect(mutate("lead", { ...body, action: "withdrawProjectBudget", reason: "Quote changed" })).rejects.toMatchObject({ status: 409 });
  });
  it("serializes competing final approval and return so only one reviewed outcome is published", async () => {
    let budget = await draft();
    for (const [role, action] of [["lead", "submitProjectBudget"], ["departmentLead", "approveDepartmentBudget"]] as const) {
      await mutate(role, { action, projectBudgetId: budget.id, expectedRevision: budget.revision }); budget = await services.projectBudget("lead", budget.id);
    }
    const results = await Promise.allSettled([
      mutate("head", { action: "approveProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision }),
      mutate("head", { action: "returnProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision, reason: "Clarify supplier quote" }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    budget = await services.projectBudget("lead", budget.id);
    if (budget.approvedVersion) expect(budget.pendingVersion).toBeNull();
    else expect(budget.pendingVersion).toMatchObject({ status: "draft", departmentApprovedBy: null, approvedBy: null });
    expect(budget.decisions.filter(d => ["approveProjectBudget", "returnProjectBudget"].includes(d.action))).toHaveLength(1);
  });
  it("approves two first budgets concurrently without inventing or racing the season ledger", async () => {
    const departmentId = randomUUID();
    await db.query("insert into project_management.departments(id,season,name) values($1::uuid,'S28','Mechanical & Production')", [departmentId]);
    await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,true)", [departmentId, f.departmentLead]);
    const budgets = await Promise.all([1, 2].map(async index => {
      const projectId = randomUUID();
      await db.query("insert into project_management.projects values($1::uuid,'S28',$3,array[$2::uuid],array['Mechanical & Production'],1)", [projectId, f.lead, `Next frame ${index}`]);
      const created = await mutate("lead", { action: "createProjectBudget", projectId, responsibleDepartmentId: departmentId });
      let budget = await services.projectBudget("lead", created.id!);
      for (const [role, action, fields] of [["lead", "saveProjectBudgetEntry", { entry }], ["lead", "submitProjectBudget", {}], ["departmentLead", "approveDepartmentBudget", {}]] as const) {
        await mutate(role, { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields }); budget = await services.projectBudget("lead", budget.id);
      }
      return budget;
    }));
    // Hold the next-reference row so one approval has inserted its new ledger
    // while the other attempts the same absent-ledger insert. This exercises
    // both unique arbiters (season_id and public_ref), rather than lucky timing.
    await db.query("insert into finance.reference_counters(counter_key,configured_next,updated_by_member_id) values('budget_item:S28',1,$1::uuid)", [f.head]);
    const gate = await pool.connect();
    await gate.query("begin");
    await gate.query("select counter_key from finance.reference_counters where counter_key='budget_item:S28' for update");
    const pending = Promise.allSettled(budgets.map(budget => mutate("head", { action: "approveProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision })));
    let waiting = 0;
    try {
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
        waiting = Number((await pool.query("select count(*) as count from pg_stat_activity where datname=current_database() and query like 'select finance.mutate_project_budget%' and wait_event_type='Lock'")).rows[0].count);
        if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally { await gate.query("commit"); gate.release(); }
    expect(waiting).toBe(2);
    expect((await pending).map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
    for (const budget of budgets) expect((await services.projectBudget("head", budget.id)).approvedVersion).toMatchObject({ status: "approved" });
    expect((await db.query("select status,approved_by_member_id from finance.budgets where season_id=$1::uuid", [f.nextSeason])).rows).toEqual([{ status: "draft", approved_by_member_id: null }]);
  });
  it("waits for an in-flight membership revocation and rejects the department decision after it commits", async () => {
    let budget = await draft(); await mutate("lead", { action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision }); budget = await services.projectBudget("lead", budget.id);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from project_management.department_members where member_id=$1::uuid and department_id=$2::uuid", [f.departmentLead, f.department]);
      const pending = mutate("departmentLead", { action: "approveDepartmentBudget", projectBudgetId: budget.id, expectedRevision: budget.revision });
      // Attach rejection handling immediately while the grant write still holds its row lock.
      const outcome = pending.then(value => ({ value }), error => ({ error }));
      await client.query("commit");
      expect(await outcome).toMatchObject({ error: { status: 403 } });
      expect((await services.projectBudget("lead", budget.id)).pendingStage).toBe("department_pending");
    } finally { await client.query("rollback").catch(() => undefined); client.release(); }
  });
});
