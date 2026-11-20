import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
import { projectBudgetFixture as f, projectBudgetIdentity, submitProjectBudgetDepartmentPackage, type ProjectBudgetTestDatabase, type ProjectBudgetFixtureRole } from "./project-budget-test-db.js";
import { setupMemberReadFixture, initialMemberFixtureBudget, changeMemberFixtureBudget as change, member, type MemberServices } from "./project-budget-member-read-fixture.js";
const url = process.env.FINANCE_TEST_POSTGRES_URL;
const name = `helix_member_read_${process.pid}_${Date.now()}`;
let admin: pg.Client, pool: pg.Pool, close: (() => Promise<void>) | undefined, db: ProjectBudgetTestDatabase, services: MemberServices;
describe.skipIf(!url)("approved-only member snapshot on real PostgreSQL", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) || connection.pathname !== "/postgres") throw new Error("Use the isolated loopback maintenance database.");
    admin = new pg.Client({ connectionString: connection.toString() }); await admin.connect(); await admin.query(`create database ${name}`);
    connection.pathname = `/${name}`;
    const resource = createPostgresTestPool({ connectionString: connection.toString(), max: 6 }); pool = resource.pool; close = resource.close;
    db = { exec: sql => pool.query(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params)).rows as T[] }) };
    services = await setupMemberReadFixture(db);
  }, 30000);
  afterAll(async () => { try { await close?.(); if (admin) await admin.query(`drop database if exists ${name}`); } finally { await admin?.end(); } });
  it("observes the complete old/new approved pointer and current assignment across independent commits", async () => {
    let budget = await initialMemberFixtureBudget(services);
    budget = await change(services, budget, "requestProjectBudgetChanges", { reason: "Revised supplier quote" });
    budget = await change(services, budget, "saveProjectBudgetEntry", { entry: { ...budget.pendingVersion!.entries[0], description: "New approved material", plannedNok: "2000", note: "Private second version" } });
    budget = await change(services, budget, "submitProjectBudget");
    const sent = await submitProjectBudgetDepartmentPackage(services, budget);
    const packet = await services.departmentBudgetPackage("head", sent.packageId);
    const writer = await pool.connect();
    try {
      await writer.query("begin");
      const writerDb = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await writer.query(sql, params)).rows as T[] }) };
      const writerServices = createFinanceServices({ db: writerDb, authenticate: async role => projectBudgetIdentity(role as ProjectBudgetFixtureRole) });
      await writerServices.mutate("head", { action: "approveDepartmentBudgetPackage", packageId: packet.id, expectedRevision: packet.revision, requestId: randomUUID() });
      const old = await services.projectBudget("member", budget.id);
      expect(old.approvedTotalNok).toBe("1000.00"); expect(old.approvedVersion!.entries[0].description).toBe("Steel"); expect(old.pendingVersionId).toBeNull(); expect(JSON.stringify(old)).not.toContain("Private second version");
      await writer.query("commit");
      const next = await services.projectBudget("member", budget.id);
      expect(next.approvedTotalNok).toBe("2000.00"); expect(next.approvedVersion!.entries[0].description).toBe("New approved material"); expect(next.approvedVersion!.entries[0].note).toBeNull(); expect(next.approvedVersionId).not.toBe(old.approvedVersionId);
      await writer.query("begin");
      await writer.query("delete from project_management.task_assignees where member_id=$1::uuid", [member.userId]);
      expect((await services.projectBudget("member", budget.id)).approvedTotalNok).toBe("2000.00");
      await writer.query("commit");
      await expect(services.projectBudget("member", budget.id)).rejects.toMatchObject({ status: 403 });
      await expect(services.projectBudgets("member", f.project)).rejects.toMatchObject({ status: 403 });
    } finally { await writer.query("rollback"); writer.release(); }
  });
  it("revalidates private scope after a successful routing probe and never falls back after revocation", async () => {
    const header = (await db.query<{id: string}>("select id from finance.project_budgets where project_id=$1::uuid", [f.project])).rows[0];
    let revoked = false, memberQueries = 0;
    const racingDb = { query: async <T>(sql: string, params?: unknown[]) => {
      if (sql.includes("from project_management.tasks task")) memberQueries++;
      if (!revoked && sql.includes("select h.id,finance.project_budget_scope")) {
        revoked = true;
        await pool.query("update project_management.projects set lead_ids='{}' where id=$1::uuid", [f.project]);
      }
      return { rows: (await pool.query(sql, params)).rows as T[] };
    } };
    const racingServices = createFinanceServices({ db: racingDb, authenticate: async () => projectBudgetIdentity("lead") });
    await expect(racingServices.projectBudget("lead", header.id)).rejects.toMatchObject({ status: 403 });
    expect(revoked).toBe(true); expect(memberQueries).toBe(0);
    expect((await pool.query("select 1 as healthy")).rows).toEqual([{ healthy: 1 }]);
  });

});
