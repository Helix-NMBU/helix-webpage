import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { composeFinanceMail } from "../../../api/_lib/finance-mail.js";
import { applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
let pg: PGlite, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const entry = { systemId: f.system, description: "Frame tubes", category: "material", plannedNok: "6000.00", ordinaryPriority: "P1", reuseStatus: "new", status: "planned", note: "Supplier quote", expectedPurchaseDate: "2027-01-15", ownerEmail: "buyer@example.test" };
const mutate = (role: ProjectBudgetFixtureRole, body: Record<string, unknown>) => services.mutate(role, { requestId: randomUUID(), ...body });
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  await pg.exec("savepoint expected_error");
  try { const value = await operation(); await pg.exec("release savepoint expected_error"); return value; }
  catch (error) { await pg.exec("rollback to savepoint expected_error; release savepoint expected_error"); throw error; }
}
async function write(role: ProjectBudgetFixtureRole, budget: ProjectBudgetDetail, action: string, fields: Record<string, unknown> = {}) {
  await mutate(role, { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields }); return services.projectBudget(role, budget.id);
}
async function draft(adopt = false) {
  const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department });
  let budget = await services.projectBudget("lead", created.id!);
  budget = await write("lead", budget, adopt ? "adoptProjectBudgetEntries" : "saveProjectBudgetEntry", adopt ? { entries: [{ budgetItemId: f.entry }] } : { entry });
  return budget;
}
async function approve(budget: ProjectBudgetDetail) {
  budget = await write("lead", budget, "submitProjectBudget"); budget = await write("departmentLead", budget, "approveDepartmentBudget"); return write("head", budget, "approveProjectBudget");
}
async function award(entryId: string) {
  const dealId = randomUUID(), applicationId = randomUUID();
  await db.query("insert into partner_deals.deals(id) values($1::uuid)", [dealId]);
  await db.query("insert into finance.funding_applications(id,deal_id,season_id,purchase_conditions,awarded_at,awarded_by_member_id,award_date,award_reference,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid,'Required material',clock_timestamp(),$4::uuid,'2026-11-19','Synthetic award',$4::uuid)", [applicationId, dealId, f.season, f.head]);
  await db.query("insert into finance.budget_obligations(application_id,entry_id,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid)", [applicationId, entryId, f.head]);
}
// Allow cold PGlite startup and the full migration chain; assertion timeouts stay unchanged.
beforeAll(async () => {
  pg = new PGlite(); db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); await applyProjectBudgetMigrations(db);
  services = createFinanceServices({ db, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole) });
}, 30_000);
beforeEach(() => pg.exec("begin")); afterEach(() => pg.exec("rollback")); afterAll(() => pg.close());

describe("approved project budget revisions and candidate-only imports", () => {
  it("keeps approved plan, identities and purchased evidence while a revision changes then removes its old entry", async () => {
    let budget = await approve(await draft(true)); const original = budget.approvedVersion!;
    budget = await write("finance", budget, "requestProjectBudgetChanges", { reason: "Update the plan" });
    expect(budget.approvedVersion?.id).toBe(original.id); expect(budget.pendingVersion).toMatchObject({ versionNumber: 2, status: "draft", entries: [{ entryId: f.entry, actualNok: "1200.00" }] });
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: "11000" } });
    expect((await db.query<{ planned: string }>("select planned_ore::text as planned from finance.effective_budget_entries where id=$1::uuid", [f.entry])).rows).toEqual([{ planned: "1000000" }]);
    budget = await write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry });
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry }); budget = await approve(budget);
    expect(budget.approvedVersion?.id).not.toBe(original.id); expect(budget.historyVersions).toHaveLength(2);
    expect(budget.historyVersions?.[0].entries[0]).toMatchObject({ entryId: f.entry, plannedNok: "10000.00", removed: false });
    expect((await db.query<{ planned: string; actual: string; document: string }>("select e.planned_ore::text as planned,a.amount_ore::text as actual,d.id as document from finance.effective_budget_entries e join finance.allocations a on a.budget_item_id=e.id join finance.purchase_lines pl on pl.id=a.line_id join finance.documents d on d.purchase_id=pl.purchase_id where e.id=$1::uuid", [f.entry])).rows).toEqual([{ planned: "0", actual: "120000", document: f.document }]);
    await pg.exec("set constraints all immediate");
  });
  it("can approve removal of every non-obligated entry while retaining purchased history", async () => {
    let budget = await approve(await draft(true)); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "No further planned purchases" });
    budget = await write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry }); budget = await approve(budget);
    expect(budget.approvedTotalNok).toBe("0.00");
    expect(budget.approvedVersion!.entries[0]).toMatchObject({ entryId: f.entry, removed: true, actualNok: "1200.00" });
  });
  it("adopts restricted legacy identity with an explicit ordinary priority and rejects foreign/protected mappings", async () => {
    const fundingId = randomUUID(), partId = randomUUID();
    await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'F-S27-001','Old grant','Head','grant',1000000,'deleted',$3::uuid,$3::uuid)", [fundingId, f.season, f.head]);
    await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'FE-001','Material',1000000,$3::uuid,$3::uuid)", [partId, fundingId, f.head]);
    await db.query("update finance.budget_items set priority='EM',earmark_id=$1::uuid where id=$2::uuid", [partId, f.entry]);
    const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department }); let budget = await services.projectBudget("lead", created.id!);
    for (const entries of [[{ budgetItemId: f.entry }], [{ budgetItemId: f.electronicEntry }], [{ budgetItemId: f.unallocatedEntry }]]) await expect(safe(() => write("lead", budget, "adoptProjectBudgetEntries", { entries }))).rejects.toMatchObject({ status: 400 });
    budget = await write("lead", budget, "adoptProjectBudgetEntries", { entries: [{ budgetItemId: f.entry, ordinaryPriority: "P2" }] });
    expect(budget.pendingVersion!.entries[0]).toMatchObject({ entryId: f.entry, budgetItemId: f.entry, ordinaryPriority: "P2", earmarkId: partId });
    expect(budget.approvedVersion).toBeNull(); budget = await approve(budget);
    expect(budget.approvedVersion!.entries[0]).toMatchObject({ entryId: f.entry, priority: "P2", publicRef: "BI-S27-001" });
    expect((await db.query("select priority from finance.budget_items where id=$1::uuid", [f.entry])).rows).toEqual([{ priority: "EM" }]);
  });
  it("allows project/department/Finance requests, reuses one candidate, and resets both reviews with a reason", async () => {
    let budget = await draft();
    await expect(safe(() => write("finance", budget, "requestProjectBudgetChanges", { reason: "Initial hidden draft" }))).rejects.toMatchObject({ status: 409 });
    budget = await approve(budget);
    for (const role of ["lead", "departmentLead", "finance"] as const) {
      const previousId = budget.pendingVersionId;
      budget = await write(role, budget, "requestProjectBudgetChanges", { reason: "Refresh quote" });
      if (previousId) expect(budget.pendingVersionId).toBe(previousId);
      expect(budget.pendingVersion).toMatchObject({ status: "draft", departmentApprovedBy: null, approvedBy: null });
      budget = await write("lead", budget, "submitProjectBudget"); budget = await write("departmentLead", budget, "approveDepartmentBudget");
    }
    await expect(safe(() => write("outsider", budget, "requestProjectBudgetChanges", { reason: "Not assigned" }))).rejects.toMatchObject({ status: 403 });
    await expect(safe(() => write("finance", budget, "saveProjectBudgetEntry", { entry }))).rejects.toMatchObject({ status: 403 });
    expect((await db.query("select id from finance.project_budget_versions where project_budget_id=$1::uuid", [budget.id])).rows).toHaveLength(2);
  });
  it("previews and imports into Draft only, preserves matching IDs/omitted optional fields, and replays lost success", async () => {
    let budget = await draft(); const oldId = budget.pendingVersion!.entries[0].entryId;
    const csv = `system_id;description;planned_nok\n${f.system};Frame tubes;6500.25`;
    const preview = await mutate("lead", { action: "previewProjectBudgetImport", projectBudgetId: budget.id, expectedRevision: budget.revision, csv });
    expect(preview.importPreview).toMatchObject({ candidateRevision: budget.revision, counts: { changed: 1, added: 0, removed: 0 }, totalNok: "6500.25" });
    const body = { action: "importProjectBudgetEntries", requestId: randomUUID(), projectBudgetId: budget.id, expectedRevision: budget.revision, csv, previewToken: preview.importPreview!.previewToken };
    const applied = await mutate("lead", body), replayed = await mutate("lead", body);
    expect(replayed).toMatchObject({ id: applied.id, revision: applied.revision, replayed: true });
    budget = await services.projectBudget("lead", budget.id);
    expect(budget.pendingVersion!.entries[0]).toMatchObject({ entryId: oldId, plannedNok: "6500.25", note: entry.note, expectedPurchaseDate: entry.expectedPurchaseDate, ownerEmail: entry.ownerEmail, ordinaryPriority: "P1" });
    expect(budget.approvedVersion).toBeNull();
    expect(budget.decisions.filter(d => d.action === "importProjectBudgetEntries")).toHaveLength(1);
  });
  it("rejects stale previews, changed source, cross-scope writes and manual P0/EM", async () => {
    let budget = await draft(); const csv = `system_id;description;planned_nok\n${f.system};Frame tubes;6500`;
    const body = { projectBudgetId: budget.id, expectedRevision: budget.revision, csv };
    const preview = await mutate("lead", { action: "previewProjectBudgetImport", ...body });
    await expect(safe(() => mutate("lead", { action: "importProjectBudgetEntries", ...body, csv: csv.replace("6500", "7000"), previewToken: preview.importPreview!.previewToken }))).rejects.toMatchObject({ status: 409 });
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: budget.pendingVersion!.entries[0].entryId, note: "Changed while preview open" } });
    await expect(safe(() => mutate("lead", { action: "importProjectBudgetEntries", ...body, expectedRevision: budget.revision, previewToken: preview.importPreview!.previewToken }))).rejects.toMatchObject({ status: 409 });
    const latestPreview = await mutate("lead", { action: "previewProjectBudgetImport", ...body, expectedRevision: budget.revision });
    await db.query("update finance.systems set name='Updated catalog name' where id=$1::uuid", [f.system]);
    await expect(safe(() => mutate("lead", { action: "importProjectBudgetEntries", ...body, expectedRevision: budget.revision, previewToken: latestPreview.importPreview!.previewToken }))).rejects.toMatchObject({ status: 409 });
    await expect(safe(() => mutate("otherDepartmentLead", { action: "previewProjectBudgetImport", ...body }))).rejects.toMatchObject({ status: 403 });
    for (const priority of ["P0", "EM"]) {
      const bad = await mutate("lead", { action: "previewProjectBudgetImport", ...body, expectedRevision: budget.revision, csv: `system_id;description;planned_nok;priority\n${f.system};Frame tubes;6500;${priority}` });
      expect(bad.importPreview!.errors.length).toBeGreaterThan(0);
    }
    await expect(safe(() => services.mutate("head", { action: "importItems", requestId: randomUUID(), csv, departmentKey: "mechanical-production", expectedRevision: 0, previewToken: "a".repeat(64) }))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => services.mutate("head", { action: "editItem", requestId: randomUUID(), itemId: f.entry, expectedRevision: 0, patch: { plannedNok: "1" } }))).rejects.toMatchObject({ status: 409 });
  });
  it("protects awarded obligations on direct edits, deletion and CSV omission", async () => {
    let budget = await approve(await draft(true)); await award(f.entry);
    budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Updated purchases" });
    for (const update of [{ plannedNok: "9999" }, { ordinaryPriority: "P4" }]) await expect(safe(() => write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: "10000", ...update } }))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry }))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => db.query("delete from finance.project_budget_version_entries where version_id=$1::uuid and entry_id=$2::uuid", [budget.pendingVersionId, f.entry]))).rejects.toMatchObject({ code: "23514" });
    const csv = `system_id;description;planned_nok\n${f.system};Replacement;10000`;
    const preview = await mutate("lead", { action: "previewProjectBudgetImport", projectBudgetId: budget.id, expectedRevision: budget.revision, csv });
    await expect(safe(() => mutate("lead", { action: "importProjectBudgetEntries", projectBudgetId: budget.id, expectedRevision: budget.revision, csv, previewToken: preview.importPreview!.previewToken }))).rejects.toMatchObject({ status: 400 });
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: "12000" } });
    expect(budget.approvedVersion!.entries[0].plannedNok).toBe("10000.00"); expect(budget.pendingVersion!.entries[0].priority).toBe("P0");
  });
  it("rejects a reduction prepared before an obligation becomes active", async () => {
    let budget = await approve(await draft(true)); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Lower quote" });
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: "9000" } });
    budget = await write("lead", budget, "submitProjectBudget"); budget = await write("departmentLead", budget, "approveDepartmentBudget"); await award(f.entry);
    await expect(safe(() => write("head", budget, "approveProjectBudget"))).rejects.toMatchObject({ status: 400 });
    expect((await services.projectBudget("head", budget.id)).approvedTotalNok).toBe("10000.00");
  });
  it("rechecks obligations awarded after preparation during final promotion", async () => {
    let budget = await approve(await draft(true)); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Different material" });
    budget = await write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry });
    await db.query("delete from finance.project_budget_version_entries where version_id=$1::uuid and entry_id=$2::uuid", [budget.pendingVersionId, f.entry]);
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry });
    budget = await write("lead", budget, "submitProjectBudget"); budget = await write("departmentLead", budget, "approveDepartmentBudget");
    await award(f.entry);
    await expect(safe(() => write("head", budget, "approveProjectBudget"))).rejects.toMatchObject({ status: 400 });
    const current = await services.projectBudget("head", budget.id);
    expect(current.approvedVersionId).toBe(budget.approvedVersionId); expect(current.pendingStage).toBe("finance_pending");
  });
});


it("composes purchase current-budget status from approved revisions while retaining recorded line details", async () => {
  let budget = await draft(true);
  budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: "800.00" } });
  budget = await approve(budget);
  const composeLine = async () => {
    const result = await composeFinanceMail(db, {}, { eventType: "purchase_registered", entity: "purchase", entityId: f.purchase, recipientMemberId: f.finance, providerIdempotencyKey: "synthetic-current-budget", payload: {} });
    expect("message" in result).toBe(true);
    if (!("message" in result)) throw new Error("Expected a registration message");
    return result.message.text.split("\n").find(line => line.startsWith("2026-0100-L1:"));
  };
  expect(await composeLine()).toContain("budget over_budget (current)");
  // The historical anchor still carries its old 10,000 NOK plan.
  expect((await db.query<{ planned: string }>("select planned_ore::text as planned from finance.budget_items where id=$1::uuid", [f.entry])).rows[0].planned).toBe("1000000");
  budget = await write("finance", budget, "requestProjectBudgetChanges", { reason: "Increase the remaining plan" });
  budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: "2000.00" } });
  expect(await composeLine()).toContain("budget over_budget (current)");
  budget = await approve(budget);
  expect(await composeLine()).toContain("budget within (current)");
  budget = await write("finance", budget, "requestProjectBudgetChanges", { reason: "No further planned purchases" });
  budget = await write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry });
  await approve(budget);
  expect(await composeLine()).toContain("budget over_budget (current)");
  expect(await composeLine()).toContain("Steel; quantity 1; NOK 1200.00");
});
