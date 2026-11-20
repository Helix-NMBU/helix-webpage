import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import { applyProjectBudgetMigrations, approveProjectBudgetDepartmentPackage, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, submitProjectBudgetDepartmentPackage, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
let pg: PGlite, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const PRIVATE = "Unsubmitted confidential supplier note";
const mutate = (role: ProjectBudgetFixtureRole, body: Record<string, unknown>) => services.mutate(role, { requestId: randomUUID(), ...body });
async function change(budget: ProjectBudgetDetail, action: string, fields: Record<string, unknown> = {}) {
  await mutate("lead", { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields });
  return services.projectBudget("lead", budget.id);
}
async function approve(budget: ProjectBudgetDetail) {
  budget = await change(budget, "submitProjectBudget");
  await submitProjectBudgetDepartmentPackage(services, budget);
  return approveProjectBudgetDepartmentPackage(services, budget);
}
async function approvedThenPrivateDraft(requester: ProjectBudgetFixtureRole = "lead") {
  const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department });
  let budget = await services.projectBudget("lead", created.id!);
  budget = await change(budget, "adoptProjectBudgetEntries", { entries: [{ budgetItemId: f.entry }] });
  budget = await change(budget, "saveProjectBudgetEntry", { entry: { ...budget.pendingVersion!.entries[0], plannedNok: "1000", note: "Approved note" } });
  budget = await approve(budget);
  await mutate(requester, { action: "requestProjectBudgetChanges", projectBudgetId: budget.id, expectedRevision: budget.revision, reason: "Updated supplier quote" });
  budget = await services.projectBudget("lead", budget.id);
  return change(budget, "saveProjectBudgetEntry", { entry: { ...budget.pendingVersion!.entries[0], description: PRIVATE, plannedNok: "99999", note: PRIVATE } });
}
async function apiDetail(role: ProjectBudgetFixtureRole, id: string) {
  let status = 0, result: unknown;
  const response = { setHeader: () => undefined, status: (code: number) => { status = code; return response; }, json: (value: unknown) => { result = value; return response; } };
  await createFinanceHandler(() => services)({ method: "GET", headers: { authorization: `Bearer ${role}` }, query: { action: "projectBudget", projectBudgetId: id } } as unknown as VercelRequest, response as unknown as VercelResponse);
  return { status, result };
}
beforeAll(async () => {
  pg = new PGlite();
  db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); await applyProjectBudgetMigrations(db);
  services = createFinanceServices({ db, authenticate: async role => projectBudgetIdentity(role as ProjectBudgetFixtureRole) });
}, 30000);
beforeEach(() => pg.exec("begin")); afterEach(() => pg.exec("rollback")); afterAll(() => pg.close());
describe("current-authority Draft privacy through actual migrations 066–074", () => {
  it("hides unsubmitted revisions and raw audit payloads while retaining approved invoices and history", async () => {
    const budget = await approvedThenPrivateDraft("finance");
    const auditSql = "select jsonb_agg(snapshot)::text as snapshots from finance.project_budget_decisions where project_budget_id=$1::uuid";
    const raw = (await db.query<{ snapshots: string }>(auditSql, [budget.id])).rows[0].snapshots;
    expect(raw).toContain(PRIVATE);
    for (const role of ["finance", "head"] as const) {
      const detail = await services.projectBudget(role, budget.id);
      expect(detail).toMatchObject({ pendingStage: "draft", pendingTotalNok: null, pendingVersion: null, approvedTotalNok: "1000.00" });
      expect(detail.approvedVersion!.entries[0]).toMatchObject({ description: "Steel", plannedNok: "1000.00", note: "Approved note", actualNok: "1200.00", invoices: [expect.objectContaining({ documentId: f.document })] });
      expect(detail.historyVersions).toHaveLength(1); expect(detail.decisions.length).toBeGreaterThan(4);
      expect(detail.decisions.every(decision => JSON.stringify(decision.snapshot) === "{}")).toBe(true);
      expect(detail.decisions).toContainEqual(expect.objectContaining({ action: "requestProjectBudgetChanges", reason: "Updated supplier quote", actorMemberId: f.finance }));
      expect(JSON.stringify(detail)).not.toContain(PRIVATE); expect(JSON.stringify(detail)).not.toContain("99999");
      expect((await services.projectBudgets(role)).budgets.find(row => row.id === budget.id)).toMatchObject({ pendingTotalNok: null, approvedTotalNok: "1000.00" });
      const response = await apiDetail(role, budget.id); expect(response.status).toBe(200); expect(JSON.stringify(response.result)).not.toContain(PRIVATE);
    }
    for (const role of ["lead", "departmentLead"] as const) {
      const detail = await services.projectBudget(role, budget.id);
      expect(detail.pendingTotalNok).toBe("99999.00"); expect(detail.pendingVersion!.entries[0].note).toBe(PRIVATE); expect(JSON.stringify(detail.decisions)).toContain(PRIVATE);
    }
    expect((await db.query<{ snapshots: string }>(auditSql, [budget.id])).rows[0].snapshots).toBe(raw);
  });
  it("shows submitted and approved versions without leaking earlier authoring snapshots", async () => {
    let budget = await approvedThenPrivateDraft();
    budget = await change(budget, "saveProjectBudgetEntry", { entry: { ...budget.pendingVersion!.entries[0], description: "Submitted steel", plannedNok: "1500", note: "Submitted quote" } });
    budget = await change(budget, "submitProjectBudget");
    for (const role of ["finance", "head"] as const) {
      const detail = await services.projectBudget(role, budget.id);
      expect(detail.pendingVersion!.entries[0]).toMatchObject({ description: "Submitted steel", plannedNok: "1500.00" });
      expect(detail.pendingTotalNok).toBe("1500.00"); expect(JSON.stringify(detail)).not.toContain(PRIVATE);
    }
    await submitProjectBudgetDepartmentPackage(services, budget); budget = await approveProjectBudgetDepartmentPackage(services, budget);
    for (const role of ["finance", "head"] as const) {
      const detail = await services.projectBudget(role, budget.id);
      expect(detail.approvedTotalNok).toBe("1500.00"); expect(detail.historyVersions!.map(version => version.totalNok)).toEqual(["1000.00", "1500.00"]);
      expect(detail.approvedVersion!.entries[0].invoices).toContainEqual(expect.objectContaining({ documentId: f.document }));
      expect(JSON.stringify(detail)).not.toContain(PRIVATE); expect(detail.decisions.every(decision => JSON.stringify(decision.snapshot) === "{}")).toBe(true);
    }
  });
  it("retains access for Finance actors with current project or department authority", async () => {
    const budget = await approvedThenPrivateDraft();
    await db.query("update project_management.projects set lead_ids=lead_ids||$1::uuid where id=$2::uuid", [f.head, f.project]);
    await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,true)", [f.department, f.finance]);
    for (const role of ["head", "finance"] as const) {
      const detail = await services.projectBudget(role, budget.id);
      expect(detail.pendingVersion!.entries[0].note).toBe(PRIVATE); expect(detail.pendingTotalNok).toBe("99999.00"); expect(JSON.stringify(detail.decisions)).toContain(PRIVATE);
    }
    await db.query("update project_management.department_members set is_lead=false where member_id=$1::uuid", [f.finance]);
    expect((await services.projectBudget("finance", budget.id)).pendingVersion).toBeNull();
  });
  it("does not expose an unsubmitted ordinary priority through legacy EM funding choices", async () => {
    const funding = randomUUID(), part = randomUUID(), deal = randomUUID();
    await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'F-S27-001','Grant','Head','grant',1000000,'secured',$3::uuid,$3::uuid)", [funding, f.season, f.head]);
    await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'FE-001','Frame',1000000,$3::uuid,$3::uuid)", [part, funding, f.head]);
    await db.query("update finance.budget_items set priority='EM',earmark_id=$1::uuid where id=$2::uuid", [part, f.entry]);
    await db.query("insert into partner_deals.space_access values($1::uuid,true,true)", [f.otherDepartmentLead]);
    await db.query("insert into partner_deals.deals(id) values($1::uuid)", [deal]);
    const application = await createDealServices({ db, authenticate: async () => projectBudgetIdentity("otherDepartmentLead") }).saveFundingApplication("otherDepartmentLead", {
      action: "saveFundingApplication", requestId: randomUUID(), dealId: deal, dealExpectedRevision: 0, expectedRevision: 0, seasonId: f.season, purchaseConditions: "Required frame materials",
    });
    const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department });
    let budget = await services.projectBudget("lead", created.id!);
    budget = await change(budget, "adoptProjectBudgetEntries", { entries: [{ budgetItemId: f.entry, ordinaryPriority: "P3" }] });
    expect(budget.pendingVersion!.entries[0].ordinaryPriority).toBe("P3");
    expect((await services.fundingApplicationBudgetContext("head", application.id)).entries.find(entry => entry.entryId === f.entry)).toBeUndefined();
    budget = await change(budget, "submitProjectBudget");
    expect((await services.fundingApplicationBudgetContext("head", application.id)).entries.find(entry => entry.entryId === f.entry)).toMatchObject({ ordinaryPriority: "P3", effectivePriority: "EM" });
    expect((await db.query("select priority from finance.budget_items where id=$1::uuid", [f.entry])).rows).toEqual([{ priority: "EM" }]);
  });

});
