import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProjectBudgetScope, previewProjectBudgetMapping } from "../../../api/_lib/finance-project-budget-foundation.js";
import { applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";

const url = process.env.FINANCE_TEST_POSTGRES_URL;
const name = `helix_pba_foundation_${process.pid}_${Date.now()}`;
let admin: pg.Client;
let pool: pg.Pool;
let db: ProjectBudgetTestDatabase;

describe.skipIf(!url)("project budget foundation on independent PostgreSQL connections", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) || connection.pathname !== "/postgres") {
      throw new Error("Project budget PostgreSQL tests require a loopback postgres maintenance database.");
    }
    admin = new pg.Client({ connectionString: connection.toString() });
    await admin.connect();
    await admin.query(`create database ${name}`);
    connection.pathname = `/${name}`;
    pool = new pg.Pool({ connectionString: connection.toString(), max: 6 });
    db = { exec: sql => pool.query(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params)).rows as T[] }) };
    await setupProjectBudgetBase(db);
    await seedProjectBudgetLegacy(db);
    expect(await applyProjectBudgetMigrations(db)).toContain("066_project_budget_foundation.sql");
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`drop database if exists ${name}`); await admin.end(); }
  });
  it("retains effective legacy facts and private evidence across the real additive migration", async () => {
    const result = await db.query<{ id: string; planned_ore: string; actual_ore: string; storage_backend: string }>(
      `select e.id,e.planned_ore::text,a.amount_ore::text as actual_ore,d.storage_backend from finance.effective_budget_entries e
       join finance.allocations a on a.budget_item_id=e.id join finance.purchase_lines pl on pl.id=a.line_id
       join finance.documents d on d.purchase_id=pl.purchase_id where e.id=$1::uuid`, [f.entry]);
    expect(result.rows).toEqual([{ id: f.entry, planned_ore: "1000000", actual_ore: "120000", storage_backend: "private_storage" }]);
    expect((await db.query<{ requester_member_id: null; import_source: string; paid: boolean; historical_payment: boolean }>(
      `select p.requester_member_id,p.import_source,i.paid,i.historical_payment from finance.purchases p
       join finance.invoice_obligations i on i.purchase_id=p.id where p.id=$1::uuid`, [f.importedPurchase])).rows)
      .toEqual([{ requester_member_id: null, import_source: "synthetic-historical-export", paid: true, historical_payment: true }]);
    const preview = await previewProjectBudgetMapping(db, projectBudgetIdentity("head"), "S27", [{ budgetItemId: f.electronicEntry, projectId: f.electronicProject, responsibleDepartmentId: f.electronicDepartment }]);
    expect(preview).toMatchObject({ valid: true, mappedTotalNok: "5000.00", unmappedTotalNok: "10000.00" });
  });
  it("rechecks verified identity and scoped authority on a fresh database connection", async () => {
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("lead"), f.project)).capabilities.canDraft).toBe(true);
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("finance"), f.project)).capabilities.canApproveFinance).toBe(false);
    await expect(loadProjectBudgetScope(db, projectBudgetIdentity("otherDepartmentLead"), f.project)).rejects.toMatchObject({ status: 403 });
    await expect(loadProjectBudgetScope(db, { ...projectBudgetIdentity("head"), googleSub: "wrong-sub" }, f.project)).rejects.toMatchObject({ status: 403 });
  });
  it("allows only one project/season header when two independent transactions compete", async () => {
    const a = await pool.connect(), b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      const sql = "insert into finance.project_budgets(id,season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$5::uuid)";
      await a.query(sql, [randomUUID(), f.season, f.project, f.department, f.lead]);
      const competing = b.query(sql, [randomUUID(), f.season, f.project, f.department, f.lead]).then(() => null, error => error as { code: string });
      await a.query("commit");
      expect((await competing)?.code).toBe("23505");
      await b.query("rollback");
      expect((await db.query("select id from finance.project_budgets where project_id=$1::uuid", [f.project])).rows).toHaveLength(1);
    } finally { await a.query("rollback").catch(() => undefined); await b.query("rollback").catch(() => undefined); a.release(); b.release(); }
  });
});
