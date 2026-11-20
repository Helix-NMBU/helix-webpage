import { submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage } from "./project-budget-test-db.js";
import { departmentPackageDecisionBody } from "./project-budget-package-test-actions.js";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
import { createPostgresTestPool } from "./postgres-test-pool.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
const url = process.env.FINANCE_TEST_POSTGRES_URL, name = `helix_pba_revisions_${process.pid}_${Date.now()}`;
let admin: pg.Client, pool: pg.Pool, close: (() => Promise<void>) | undefined, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const entry = { systemId: f.system, description: "Frame tubes", category: "material", plannedNok: "10000", ordinaryPriority: "P1", reuseStatus: "new", status: "planned" };
const mutate = (role: ProjectBudgetFixtureRole, body: Record<string, unknown>) => services.mutate(role, { requestId: randomUUID(), ...body });
async function write(role: ProjectBudgetFixtureRole, budget: ProjectBudgetDetail, action: string, fields: Record<string, unknown> = {}) {
  if (action === "sendDepartmentBudgetPackage") return (await submitProjectBudgetDepartmentPackage(services, budget, role)).budget;
  if (action === "approveDepartmentBudgetPackage") return approveProjectBudgetDepartmentPackage(services, budget);
  await mutate(role, { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields }); return services.projectBudget(role, budget.id);
}
async function approved() {
  const projectId = randomUUID();
  await db.query("insert into project_management.projects values($1::uuid,'S27','Frame revision race',array[$2::uuid],array['Mechanical & Production'],1)", [projectId, f.lead]);
  const created = await mutate("lead", { action: "createProjectBudget", projectId, responsibleDepartmentId: f.department });
  let budget = await services.projectBudget("lead", created.id!);
  for (const [role, action, fields] of [["lead", "saveProjectBudgetEntry", { entry }], ["lead", "submitProjectBudget", {}], ["departmentLead", "sendDepartmentBudgetPackage", {}], ["head", "approveDepartmentBudgetPackage", {}]] as const) budget = await write(role, budget, action, fields);
  return budget;
}
describe.skipIf(!url)("project revisions and imports on independent PostgreSQL connections", () => {
  beforeAll(async () => {
    const connection = new URL(url!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(connection.hostname) || connection.pathname !== "/postgres") throw new Error("Use the loopback postgres maintenance database for project revision tests.");
    admin = new pg.Client({ connectionString: connection.toString() }); await admin.connect(); await admin.query(`create database ${name}`); connection.pathname = `/${name}`;
    const resource = createPostgresTestPool({ connectionString: connection.toString(), max: 6 }); pool = resource.pool; close = resource.close;
    db = { exec: sql => pool.query(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pool.query(sql, params)).rows as T[] }) };
    await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); expect(await applyProjectBudgetMigrations(db)).toContain("069_project_budget_revisions.sql");
    services = createFinanceServices({ db, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole) });
  });
  afterAll(async () => { try { await close?.(); if (admin) await admin.query(`drop database if exists ${name}`); } finally { await admin?.end(); } });
  it("creates one candidate when project, department and Finance request revisions together", async () => {
    let budget = await approved(); const old = budget.approvedVersionId;
    const outcomes = await Promise.allSettled((["lead", "departmentLead", "finance"] as const).map(role => mutate(role, { action: "requestProjectBudgetChanges", projectBudgetId: budget.id, expectedRevision: budget.revision, reason: "New quote" })));
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected").every(r => r.status === "rejected" && r.reason.status === 409)).toBe(true);
    budget = await services.projectBudget("lead", budget.id);
    expect(budget.approvedVersionId).toBe(old); expect(budget.pendingVersion).toMatchObject({ versionNumber: 2, status: "draft" });
    expect((await db.query("select id from finance.project_budget_versions where project_budget_id=$1::uuid", [budget.id])).rows).toHaveLength(2);
    const candidate = budget.pendingVersionId;
    budget = await write("finance", budget, "requestProjectBudgetChanges", { reason: "Same pending quote" });
    expect(budget.pendingVersionId).toBe(candidate);
  });
  it("serializes CSV apply and manual edit against the same candidate revision", async () => {
    let budget = await approved(); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Update quote" });
    const csv = `system_id;description;planned_nok\n${f.system};Frame tubes;12000`;
    const preview = await mutate("lead", { action: "previewProjectBudgetImport", projectBudgetId: budget.id, expectedRevision: budget.revision, csv });
    const outcomes = await Promise.allSettled([
      mutate("lead", { action: "importProjectBudgetEntries", projectBudgetId: budget.id, expectedRevision: budget.revision, csv, previewToken: preview.importPreview!.previewToken }),
      mutate("lead", { action: "saveProjectBudgetEntry", projectBudgetId: budget.id, expectedRevision: budget.revision, entry: { ...entry, entryId: budget.pendingVersion!.entries[0].entryId, plannedNok: "13000" } }),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    budget = await services.projectBudget("lead", budget.id);
    expect(["12000.00", "13000.00"]).toContain(budget.pendingTotalNok); expect(budget.approvedTotalNok).toBe("10000.00");
  });
  it("keeps a complete approved version when promotion and return compete", async () => {
    let budget = await approved(); const old = budget.approvedVersionId;
    budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "More material" });
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: budget.pendingVersion!.entries[0].entryId, plannedNok: "15000" } });
    budget = await write("lead", budget, "submitProjectBudget"); budget = await write("departmentLead", budget, "sendDepartmentBudgetPackage");
    const outcomes = await Promise.allSettled([
      mutate("head", await departmentPackageDecisionBody(services, budget)),
      mutate("head", { action: "returnProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision, reason: "Clarify quantity" }),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    budget = await services.projectBudget("lead", budget.id);
    if (budget.approvedVersionId === old) { expect(budget.pendingStage).toBe("draft"); expect(budget.approvedTotalNok).toBe("10000.00"); }
    else { expect(budget.pendingVersionId).toBeNull(); expect(budget.approvedTotalNok).toBe("15000.00"); }
    expect(budget.historyVersions?.[0]).toMatchObject({ id: old, status: "approved", totalNok: "10000.00" });
    const effective = (await db.query<{ amount: string }>("select planned_ore::text as amount from finance.effective_budget_entries where project_budget_id=$1::uuid", [budget.id])).rows;
    expect(effective).toEqual([{ amount: budget.approvedVersionId === old ? "1000000" : "1500000" }]);
  });
});
