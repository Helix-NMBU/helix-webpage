import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { APPROVED_MEMBER_BUDGET_CAPABILITIES } from "../../../src/features/Finance/project-budget-member-view.js";
import { approveProjectBudgetDepartmentPackage, projectBudgetFixture as f, submitProjectBudgetDepartmentPackage, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
import { setupMemberReadFixture, initialMemberFixtureBudget, changeMemberFixtureBudget as change, mutateMemberFixture as mutate, member, taskId, type MemberServices } from "./project-budget-member-read-fixture.js";
let pg: PGlite, db: ProjectBudgetTestDatabase, services: MemberServices, transaction = false;
beforeAll(async () => {
  pg = new PGlite();
  db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => {
    // Production pool queries are autocommitted; recover a denied privileged query before its safe fallback in this rollback-only fixture.
    if (transaction) await pg.exec("savepoint fixture_query");
    try { const result = await pg.query<T>(sql, params); if (transaction) await pg.exec("release savepoint fixture_query"); return { rows: result.rows }; }
    catch (error) { if (transaction) await pg.exec("rollback to savepoint fixture_query;release savepoint fixture_query"); throw error; }
  } };
  services = await setupMemberReadFixture(db);
}, 30000);
beforeEach(async () => { await pg.exec("begin"); transaction = true; });
afterEach(async () => { transaction = false; await pg.exec("rollback"); }); afterAll(() => pg.close());
async function api(action: string, fields: Record<string, string>) {
  let status = 0, body: unknown;
  const response = { setHeader: () => undefined, status: (value: number) => { status = value; return response; }, json: (value: unknown) => { body = value; return response; } };
  await createFinanceHandler(() => services)({ method: "GET", headers: { authorization: "Bearer member" }, query: { action, ...fields } } as unknown as VercelRequest, response as unknown as VercelResponse);
  return { status, body };
}
describe("approved-only allocations for assigned current project members", () => {
  it("returns only approved allowlisted plans through service/API while reviewers keep their private scope", async () => {
    const budget = await initialMemberFixtureBudget(services);
    const detail = await services.projectBudget("member", budget.id);
    expect(detail).toMatchObject({ capabilities: APPROVED_MEMBER_BUDGET_CAPABILITIES, approvedTotalNok: "1000.00", pendingVersionId: null, pendingStage: null, pendingTotalNok: null, pendingVersion: null, historyVersions: [], decisions: [] });
    expect(detail.approvedVersion!.entries[0]).toMatchObject({ description: "Steel", plannedNok: "1000.00", actualNok: "1200.00", completion: "partial", note: null, ownerEmail: null, earmarkId: null, invoices: [] });
    for (const privateValue of ["Private approved author note", "private-owner", f.document, f.purchase, "legacy/private", "viewerUrl"]) expect(JSON.stringify(detail)).not.toContain(privateValue);
    const workspace = await services.projectBudgets("member", f.project);
    expect(workspace.scopes[0].capabilities.approvedOnly).toBe(true); expect(workspace.budgets).toHaveLength(1);
    expect(workspace.budgets[0]).not.toHaveProperty("approvedVersion");
    expect(await api("projectBudget", { projectBudgetId: budget.id })).toMatchObject({ status: 200, body: { capabilities: { approvedOnly: true } } });
    expect(await api("projectBudgets", { projectId: f.project })).toMatchObject({ status: 200, body: { budgets: [{ id: budget.id }] } });
    for (const role of ["lead", "departmentLead", "head", "finance"]) expect((await services.projectBudget(role, budget.id)).approvedVersion!.entries[0].note).toBe("Private approved author note");
  });
  it("never reveals Draft or submitted candidates, then switches to the genuinely approved revision", async () => {
    let budget = await initialMemberFixtureBudget(services);
    budget = await change(services, budget, "requestProjectBudgetChanges", { reason: "Private revision reason" });
    budget = await change(services, budget, "saveProjectBudgetEntry", { entry: { ...budget.pendingVersion!.entries[0], description: "PRIVATE CANDIDATE", plannedNok: "99999", note: "Private revision note" } });
    const beforeAudit = (await db.query<{ snapshots: string }>("select jsonb_agg(snapshot)::text as snapshots from finance.project_budget_decisions where project_budget_id=$1::uuid", [budget.id])).rows[0].snapshots;
    for (const stage of ["draft", "submitted"]) {
      if (stage === "submitted") budget = await change(services, budget, "submitProjectBudget");
      const detail = await services.projectBudget("member", budget.id), workspace = await services.projectBudgets("member", f.project);
      expect(detail.approvedTotalNok).toBe("1000.00"); expect(detail.pendingVersion).toBeNull(); expect(detail.pendingVersionId).toBeNull(); expect(detail.pendingStage).toBeNull();
      expect(JSON.stringify([detail, workspace])).not.toContain("PRIVATE CANDIDATE"); expect(JSON.stringify([detail, workspace])).not.toContain("99999");
    }
    expect(beforeAudit).toContain("PRIVATE CANDIDATE");
    await submitProjectBudgetDepartmentPackage(services, budget); budget = await approveProjectBudgetDepartmentPackage(services, budget);
    const after = await services.projectBudget("member", budget.id); expect(after.approvedVersionId).toBe(budget.approvedVersionId); expect(after.approvedTotalNok).toBe("99999.00"); expect(after.approvedVersion!.entries[0].note).toBeNull(); expect(after.historyVersions).toEqual([]);
    expect((await db.query<{ snapshots: string }>("select jsonb_agg(snapshot)::text as snapshots from finance.project_budget_decisions where project_budget_id=$1::uuid", [budget.id])).rows[0].snapshots).toContain("Private revision note");
  });
  it("has an empty approved state before publication and never discovers other projects or Finance workspaces", async () => {
    expect((await services.projectBudgets("member", f.project)).budgets).toEqual([]);
    const budget = await initialMemberFixtureBudget(services, false);
    const workspace = await services.projectBudgets("member", f.project); expect(workspace.budgets).toEqual([]); expect(workspace.scopes[0].responsibleDepartmentId).toBeNull(); expect(workspace.systems).toEqual([]);
    await expect(services.projectBudget("member", budget.id)).rejects.toMatchObject({ status: 404 });
    await expect(services.projectBudgets("member", f.electronicProject)).rejects.toMatchObject({ status: 403 });
    expect((await services.projectBudgets("member")).budgets).toEqual([]); expect((await services.projectBudgets("member", undefined, f.department)).budgets).toEqual([]);
    await expect(services.projectBudgets("member", f.project, f.department)).rejects.toMatchObject({ status: 403 });
  });
  it.each([
    ["task assignment deletion", "delete from project_management.task_assignees"],
    ["milestone-only assignment", "update project_management.tasks set kind='milestone'"],
    ["wrong task season", "update project_management.tasks set season='S28'"],
    ["department removal", `delete from project_management.department_members where member_id='${member.userId}'`],
    ["viewer-only department", `update project_management.department_members set access_level='viewer' where member_id='${member.userId}'`],
    ["inactive module access", `update project_management.access set active=false where member_id='${member.userId}'`],
    ["banned identity", `update neon_auth."user" set banned=true where id='${member.userId}'`],
    ["unlinked Google account", `delete from neon_auth.account where "userId"='${member.userId}'`],
    ["mismatched Google account", `update neon_auth.account set "accountId"='other-google' where "userId"='${member.userId}'`],
    ["unverified email", `update neon_auth."user" set "emailVerified"=false where id='${member.userId}'`],
    ["changed current season", `insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S28"','Fixture','${f.head}')`],
  ])("rechecks %s on the next read", async (_label, sql) => {
    const budget = await initialMemberFixtureBudget(services); expect((await services.projectBudget("member", budget.id)).capabilities.approvedOnly).toBe(true);
    await db.exec(sql); await expect(services.projectBudget("member", budget.id)).rejects.toMatchObject({ status: 403 }); await expect(services.projectBudgets("member", f.project)).rejects.toMatchObject({ status: 403 });
  });
  it("does not infer permission from administrator titles or department membership alone", async () => {
    const budget = await initialMemberFixtureBudget(services);
    await db.query("insert into project_management.access values($1::uuid,true)", [f.outsider]);
    await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,false,'member')", [f.department, f.outsider]);
    await expect(services.projectBudget("outsider", budget.id)).rejects.toMatchObject({ status: 403 });
    await db.query("delete from project_management.task_assignees where task_id=$1::uuid", [taskId]);
    await expect(services.projectBudget("member", budget.id)).rejects.toMatchObject({ status: 403 });
  });
  it("grants no authoring, approvals, purchases, uploads, invoice or funding permission", async () => {
    const budget = await initialMemberFixtureBudget(services), expectedRevision = budget.revision;
    const packet = (await services.departmentBudgetPackages("head", f.department)).packages[0];
    const beforeAudit = (await db.query<{snapshot: string}>("select jsonb_agg(snapshot)::text as snapshot from finance.project_budget_decisions where project_budget_id=$1::uuid", [budget.id])).rows[0].snapshot;
    const oldRequest = (await db.query<{request_id: string}>("select request_id from finance.idempotency_keys where member_id=$1::uuid limit 1", [f.lead])).rows[0].request_id;
    for (const body of [
      { action: "requestProjectBudgetChanges", requestId: oldRequest, reason: "Replayed member request" },
      { action: "requestProjectBudgetChanges", reason: "Member request" },
      { action: "saveProjectBudgetEntry", entry: { ...budget.approvedVersion!.entries[0], plannedNok: "2000" } },
      { action: "submitProjectBudget" },
      { action: "setProjectBudgetCompletion", entryId: f.entry, complete: true, reason: "Member completion" },
      { action: "authorizeProjectPurchaseUpload", projectId: f.project, fileName: "invoice.pdf", contentType: "application/pdf", byteSize: 8 },
      { action: "finalizeProjectPurchaseUpload", projectId: f.project, uploadId: f.document },
      { action: "registerProjectPurchase", projectId: f.project, purchase: {} },
      { action: "downloadDocument", documentId: f.document },
      { action: "retryInvoiceTransfer", documentId: f.document, expectedRevision: 0 },
      { action: "approveDepartmentBudgetPackage", packageId: packet.id, expectedRevision: packet.revision },
    ]) await expect(mutate(services, "member", { projectBudgetId: budget.id, responsibleDepartmentId: f.department, expectedRevision, ...body })).rejects.toMatchObject({ status: 403 });
    await expect(services.projectPurchaseContext("member", f.project)).rejects.toMatchObject({ status: 403 });
    await expect(services.projectFundingProposals("member", budget.id)).rejects.toMatchObject({ status: 403 });
    await expect(services.fundingApplications("member")).rejects.toMatchObject({ status: 403 });
    expect((await db.query<{snapshot: string}>("select jsonb_agg(snapshot)::text as snapshot from finance.project_budget_decisions where project_budget_id=$1::uuid", [budget.id])).rows[0].snapshot).toBe(beforeAudit);
    const after = await services.projectBudget("lead", budget.id); expect(after.revision).toBe(expectedRevision); expect(after.approvedVersionId).toBe(budget.approvedVersionId);
  });
  it("shows public P0 and completion without exposing funding conditions or permitting an award", async () => {
    const budget = await initialMemberFixtureBudget(services), deal = randomUUID(), application = randomUUID();
    await db.query("insert into partner_deals.deals(id) values($1::uuid)", [deal]);
    await db.query("insert into finance.funding_applications(id,deal_id,season_id,purchase_conditions,awarded_at,awarded_by_member_id,award_date,award_reference,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid,'PRIVATE FUNDING CONDITIONS',clock_timestamp(),$4::uuid,'2026-11-20','Private award reference',$4::uuid)", [application, deal, f.season, f.head]);
    await db.query("insert into finance.budget_obligations(application_id,entry_id,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid)", [application, f.entry, f.head]);
    await db.query("insert into finance.project_budget_completion(entry_id,complete,updated_by_member_id,reason) values($1::uuid,true,$2::uuid,'Private completion reason') on conflict(entry_id) do update set complete=true", [f.entry, f.departmentLead]);
    const detail = await services.projectBudget("member", budget.id);
    expect(detail.approvedVersion!.entries[0]).toMatchObject({ priority: "P0", completion: "complete", ordinaryPriority: "P1", earmarkId: null });
    for (const value of [application, deal, "PRIVATE FUNDING", "Private award reference", "Private completion reason"]) expect(JSON.stringify(detail)).not.toContain(value);
    await expect(services.fundingApplicationBudgetContext("member", application)).rejects.toMatchObject({ status: 403 });
    await expect(mutate(services, "member", { action: "recordFundingAward", applicationId: application, expectedRevision: 0, awardDate: "2026-11-20", awardReference: "Member attempt" })).rejects.toMatchObject({ status: 403 });
    expect((await db.query("select award_reference from finance.funding_applications where id=$1::uuid", [application])).rows).toEqual([{ award_reference: "Private award reference" }]);
  });

});
