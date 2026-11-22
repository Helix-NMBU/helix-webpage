import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
import { createDealHandler } from "../../../api/_lib/partner-deals-handler.js";
import { submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage, applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import type { FundingApplicationDetail } from "../../../src/features/Finance/funding-application-types.js";
let pg: PGlite, db: ProjectBudgetTestDatabase, finance: ReturnType<typeof createFinanceServices>, deals: ReturnType<typeof createDealServices>;
const identity = (role: string) => projectBudgetIdentity(role === "marketing" ? "otherDepartmentLead" : role as ProjectBudgetFixtureRole);
const entry = { systemId: f.system, description: "Steel", category: "material", plannedNok: "10000", ordinaryPriority: "P1", reuseStatus: "new", status: "planned" };
const mutate = (role: string, body: Record<string, unknown>) => finance.mutate(role, { requestId: randomUUID(), ...body });
async function safe<T>(operation: () => Promise<T>): Promise<T> { await pg.exec("savepoint expected_error"); try { const result = await operation(); await pg.exec("release savepoint expected_error"); return result; } catch (error) { await pg.exec("rollback to savepoint expected_error;release savepoint expected_error"); throw error; } }
async function write(role: string, budget: ProjectBudgetDetail, action: string, fields: Record<string, unknown> = {}) { await mutate(role, { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields }); return finance.projectBudget(role, budget.id); }
async function approved() { const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department }); let budget = await finance.projectBudget("lead", created.id!); budget = await write("lead", budget, "adoptProjectBudgetEntries", { entries: [{ budgetItemId: f.entry }] }); return approve(budget); }
async function approve(budget: ProjectBudgetDetail) { budget = await write("lead", budget, "submitProjectBudget"); budget = (await submitProjectBudgetDepartmentPackage(finance, budget)).budget; return approveProjectBudgetDepartmentPackage(finance, budget); }
async function application(title = "Research award", fundingId?: string) { const dealId = randomUUID(); await db.query("insert into partner_deals.deals(id,title,primary_season_id,negotiation_notes) values($1::uuid,$2,$3::uuid,'Private negotiation amount and contact')", [dealId, title, f.season]); const result = await deals.saveFundingApplication("marketing", { action: "saveFundingApplication", requestId: randomUUID(), dealId, dealExpectedRevision: 0, expectedRevision: 0, seasonId: f.season, purchaseConditions: "Purchase the required material", fundingId }); return finance.fundingApplication("head", result.id); }
async function appWrite(app: FundingApplicationDetail, action: string, fields: Record<string, unknown> = {}, role = "head") { await mutate(role, { action, applicationId: app.id, expectedRevision: app.revision, ...fields }); return finance.fundingApplication("head", app.id); }
async function link(app: FundingApplicationDetail, budgetId: string, entryId = f.entry) { const budget = await finance.projectBudget("head", budgetId); return appWrite(app, "linkFundingApplicationEntry", { entryId, expectedBudgetRevision: budget.revision }); }
async function award(app: FundingApplicationDetail) { return appWrite(app, "recordFundingAward", { awardDate: "2026-11-19", awardReference: "Award letter A-2026" }); }
async function priority(id: string = f.entry) { return (await db.query<{ priority: string }>("select priority from finance.effective_budget_entries where id=$1::uuid", [id])).rows[0]?.priority; }
async function call(handler: ReturnType<typeof createFinanceHandler> | ReturnType<typeof createDealHandler>, role: string, query: Record<string, string>, body?: unknown) { let status = 0, result: unknown; const res = { setHeader: vi.fn(), status: (value: number) => { status = value; return res; }, json: (value: unknown) => { result = value; return res; } }; await handler({ method: body ? "POST" : "GET", query, body, headers: { authorization: `Bearer ${role}` } } as unknown as VercelRequest, res as unknown as VercelResponse); return { status, result }; }
beforeAll(async () => { pg = new PGlite(); db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) }; await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); await applyProjectBudgetMigrations(db); await db.query("insert into partner_deals.space_access values($1::uuid,true,true)", [f.otherDepartmentLead]); finance = createFinanceServices({ db, authenticate: async token => identity(token) }); deals = createDealServices({ db, authenticate: async token => identity(token) }); });
beforeEach(() => pg.exec("begin")); afterEach(() => pg.exec("rollback")); afterAll(() => pg.close());

describe("explicit funding awards and stable P0 obligations", () => {
  it("uses current pipeline permissions for classification and a separate limited HOF projection", async () => {
    const app = await application(); const unrelated = randomUUID(); await db.query("insert into partner_deals.deals(id,title,negotiation_notes) values($1::uuid,'Private sponsor card','Secret negotiation')", [unrelated]);
    expect((await finance.fundingApplications("head")).applications).toMatchObject([{ id: app.id, title: "Research award", award: null }]);
    const data = JSON.stringify(await finance.fundingApplication("head", app.id)); expect(data).not.toContain("Private sponsor"); expect(data).not.toContain("Private negotiation"); expect(data).not.toContain("organization");
    expect((await db.query<{ pipeline: boolean }>("select pipeline from partner_deals.capabilities($1::uuid,$2,$3)", [f.head, identity("head").googleSub, identity("head").email])).rows).toEqual([{ pipeline: false }]);
    await expect(safe(() => finance.fundingApplication("head", unrelated))).rejects.toMatchObject({ status: 404 });
    await expect(safe(() => finance.fundingApplications("finance"))).rejects.toMatchObject({ status: 403 });
    await db.query("update identity.members set full_name='Head of Finance' where id=$1::uuid", [f.outsider]);
    await expect(safe(() => finance.fundingApplications("outsider"))).rejects.toMatchObject({ status: 403 });
    await expect(safe(() => deals.fundingApplicationCard("head", app.dealId))).rejects.toMatchObject({ status: 403 });
    const dealHandler = createDealHandler(() => deals), financeHandler = createFinanceHandler(() => finance);
    expect(await call(dealHandler, "marketing", { view: "fundingApplicationCard", dealId: app.dealId })).toMatchObject({ status: 200, result: { application: { id: app.id } } });
    expect(await call(financeHandler, "head", { action: "fundingApplication", applicationId: app.id })).toMatchObject({ status: 200, result: { id: app.id } });
    await db.query("update partner_deals.space_access set pipeline=false where member_id=$1::uuid", [f.otherDepartmentLead]);
    await expect(safe(() => deals.fundingApplicationCard("marketing", app.dealId))).rejects.toMatchObject({ status: 403 });
  });
  it("activates P0 only on explicit award, without cash receipt, Won effects or automatic funding creation", async () => {
    const budget = await approved(); let app = await link(await application(), budget.id);
    expect(await priority()).toBe("P1"); expect(app.links[0].mandatory).toBe(false);
    await db.query("update partner_deals.deals set stage='won' where id=$1::uuid", [app.dealId]);
    expect(await priority()).toBe("P1"); const before = await db.query("select id from finance.funding"); const projects = await db.query("select id from project_management.projects");
    app = await award(app); expect(await priority()).toBe("P0"); expect(app.award).toMatchObject({ actorMemberId: f.head, date: "2026-11-19", reference: "Award letter A-2026" });
    expect((await db.query("select id from finance.funding")).rows).toEqual(before.rows); expect((await db.query("select id from project_management.projects")).rows).toEqual(projects.rows);
    expect(app.links[0]).toMatchObject({ approvedNok: "10000.00", mandatory: true });
    expect((await db.query("select d.id from finance.documents d where d.id=$1::uuid", [f.document])).rows).toHaveLength(1);
  });
  it("requires HOF and a reason for release, preserves multiple awards and restores the current ordinary priority", async () => {
    await db.query("update finance.budget_items set priority='P3' where id=$1::uuid", [f.entry]);
    let budget = await approved(); let first = await award(await link(await application("First award"), budget.id)); let second = await award(await link(await application("Second award"), budget.id));
    budget = await finance.projectBudget("lead", budget.id); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Raise ordinary priority" }); budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, ordinaryPriority: "P2" } }); budget = await approve(budget);
    await expect(safe(() => appWrite(first, "releaseFundingObligation", { obligationId: first.links[0].id, reason: "" }))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => appWrite(first, "releaseFundingObligation", { obligationId: first.links[0].id, reason: "Conditions changed" }, "finance"))).rejects.toMatchObject({ status: 403 });
    first = await appWrite(first, "releaseFundingObligation", { obligationId: first.links[0].id, reason: "First award released" }); expect(await priority()).toBe("P0");
    second = await appWrite(second, "releaseFundingObligation", { obligationId: second.links[0].id, reason: "Second award released" }); expect(await priority()).toBe("P2");
    expect(first.links[0].release).toMatchObject({ actorMemberId: f.head, reason: "First award released" }); expect(second.links[0].release).toBeTruthy();
    budget = await finance.projectBudget("lead", budget.id); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "New ordinary priority" }); budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, ordinaryPriority: "P3" } }); await approve(budget);
    expect(await priority()).toBe("P3");
    await expect(safe(() => db.query("delete from finance.budget_obligations where id=$1::uuid", [first.links[0].id]))).rejects.toMatchObject({ code: "23514" });
  });
  it("supports an awarded proposal in an initial Draft without making that Draft a Finance approval", async () => {
    const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department });
    let app = await application(); app = await appWrite(app, "proposeFundingBudgetEntry", { projectBudgetId: created.id, expectedBudgetRevision: created.revision, entry: { ...entry, description: "Initial obligated sensor", plannedNok: "2000" } }); app = await award(app);
    await expect(safe(() => finance.projectBudget("head", created.id!))).rejects.toMatchObject({ status: 404 });
    const context = await finance.fundingApplicationBudgetContext("head", app.id); expect(context.budgets[0].approvedVersionId).toBeNull(); expect(context.entries[0].approved).toBe(false);
    const proposed = await finance.projectFundingProposals("lead", created.id!);
    await mutate("lead", { action: "adoptFundingProposal", applicationId: app.id, expectedRevision: app.revision, projectBudgetId: created.id, expectedBudgetRevision: proposed.budgetRevision, proposalId: app.proposals[0].id });
    let budget = await finance.projectBudget("lead", created.id!); expect(budget.approvedVersionId).toBeNull(); expect(budget.pendingVersion!.entries[0].priority).toBe("P0");
    budget = await approve(budget); expect(budget.approvedVersion!.entries[0]).toMatchObject({ entryId: app.proposals[0].entryId, budgetItemId: app.proposals[0].entryId, priority: "P0" });
  });
  it("keeps newly awarded proposal money unapproved and protects its baseline through adoption and both reviews", async () => {
    let budget = await approved(); let app = await application();
    app = await appWrite(app, "proposeFundingBudgetEntry", { projectBudgetId: budget.id, expectedBudgetRevision: budget.revision, entry: { ...entry, description: "Obligated sensor", plannedNok: "2000", ordinaryPriority: "P2" }, note: "Award requires the sensor" });
    const proposal = app.proposals[0]; expect(proposal.approvalStatus).toBe("needs_project_lead"); expect(await priority(proposal.entryId)).toBeUndefined();
    app = await award(app); expect(app.proposals[0].mandatory).toBe(true); expect((await finance.projectBudget("head", budget.id)).approvedTotalNok).toBe("10000.00");
    const context = await finance.fundingApplicationBudgetContext("head", app.id); expect(context.entries.find(entry => entry.entryId === proposal.entryId)).toMatchObject({ approved: false, plannedNok: "2000.00", entry: { systemId: f.system } });
    budget = await finance.projectBudget("lead", budget.id); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Prepare the awarded proposal" });
    const otherSystem = randomUUID(); await db.query("insert into finance.systems(id,department_key,code,name) values($1::uuid,'mechanical-production','SYS-OTHER','Other mechanical system')", [otherSystem]);
    // No approved or pending row for this identity exists yet; the immutable proposal baseline must protect it.
    for (const change of [{ plannedNok: "1900" }, { ordinaryPriority: "P4" }, { systemId: otherSystem }]) await expect(safe(() => write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: proposal.entryId, description: "Obligated sensor", plannedNok: "2000", ordinaryPriority: "P2", ...change } }))).rejects.toMatchObject({ status: 400 });
    const scoped = await finance.projectFundingProposals("lead", budget.id); expect(scoped.proposals[0]).toMatchObject({ entryId: proposal.entryId, mandatory: true });
    await expect(safe(() => mutate("head", { action: "adoptFundingProposal", applicationId: app.id, expectedRevision: app.revision, proposalId: proposal.id, projectBudgetId: budget.id, expectedBudgetRevision: scoped.budgetRevision }))).rejects.toMatchObject({ status: 403 });
    await mutate("lead", { action: "adoptFundingProposal", applicationId: app.id, expectedRevision: app.revision, proposalId: proposal.id, projectBudgetId: budget.id, expectedBudgetRevision: scoped.budgetRevision });
    budget = await finance.projectBudget("lead", budget.id); expect(budget.approvedTotalNok).toBe("10000.00"); expect(budget.pendingVersion!.entries.find(entry => entry.entryId === proposal.entryId)).toMatchObject({ plannedNok: "2000.00", priority: "P0" });
    for (const change of [{ plannedNok: "1900" }, { ordinaryPriority: "P4" }]) await expect(safe(() => write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: proposal.entryId, description: "Obligated sensor", plannedNok: "2000", ordinaryPriority: "P2", ...change } }))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => write("lead", budget, "removeProjectBudgetEntry", { entryId: proposal.entryId }))).rejects.toMatchObject({ status: 400 });
    budget = await approve(budget); expect(budget.approvedTotalNok).toBe("12000.00"); expect(await priority(proposal.entryId)).toBe("P0");
    expect((await finance.fundingApplication("head", app.id)).proposals[0]).toMatchObject({ approvalStatus: "approved", entryId: proposal.entryId });
    await expect(safe(() => db.query("delete from project_management.projects where id=$1::uuid", [f.project]))).rejects.toMatchObject({ code: "23514" });
  });
  it("labels a proposal approved only when the genuine approval retains its amount and contents", async () => {
    await db.query("update finance.budget_items set planned_ore=500000 where id=$1::uuid", [f.entry]);
    const fundId = randomUUID(), partId = randomUUID();
    await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'F-S27-001','Restricted grant','Head','grant',1000000,'secured',$3::uuid,$3::uuid)", [fundId, f.season, f.head]);
    await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'FE-001','Steel',1000000,$3::uuid,$3::uuid)", [partId, fundId, f.head]);
    let budget = await approved(), app = await application();
    app = await appWrite(app, "proposeFundingBudgetEntry", { projectBudgetId: budget.id, expectedBudgetRevision: budget.revision,
      entry: { ...entry, entryId: f.entry, plannedNok: "8000" } });
    app = await award(app);
    budget = await finance.projectBudget("lead", budget.id);
    budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Review the proposal" });
    const proposal = (await finance.projectFundingProposals("lead", budget.id)).proposals[0];
    await mutate("lead", { action: "adoptFundingProposal", applicationId: app.id, expectedRevision: app.revision,
      projectBudgetId: budget.id, expectedBudgetRevision: budget.revision, proposalId: proposal.id });
    budget = await finance.projectBudget("lead", budget.id);
    for (const [amount, description, earmarkId, expected] of [["6000", "Steel", null, "awaiting_budget_approval"],
      ["8000", "Different purchase", null, "awaiting_budget_approval"], ["8000", "Steel", partId, "awaiting_budget_approval"],
      ["8000", "Steel", null, "approved"]] as const) {
      if (budget.approvedVersionId && !budget.pendingVersionId) budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Align proposed purchase" });
      budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: f.entry, plannedNok: amount, description, earmarkId } });
      budget = await approve(budget);
      expect((await finance.fundingApplication("head", app.id)).proposals[0].approvalStatus).toBe(expected);
      expect((await finance.projectFundingProposals("lead", budget.id)).proposals[0].approvalStatus).toBe(expected);
    }
  });
  it("retains proposal system departments before adoption without replacing the existing financial-history guard", async () => {
    await db.query("update project_management.projects set departments=array['Mechanical & Production','Electronics'] where id=$1::uuid", [f.project]);
    const budget = await approved(); let app = await application();
    app = await appWrite(app, "proposeFundingBudgetEntry", { projectBudgetId: budget.id, expectedBudgetRevision: budget.revision, entry: { ...entry, systemId: f.electronicSystem, description: "Awarded electronics", plannedNok: "2000" } }); app = await award(app);
    expect((await db.query("select entry_id from finance.project_budget_version_entries where entry_id=$1::uuid", [app.proposals[0].entryId])).rows).toEqual([]);
    await expect(safe(() => db.query("update project_management.projects set departments=array['Mechanical & Production'] where id=$1::uuid", [f.project]))).rejects.toMatchObject({ code: "23514" });
    await db.query("update project_management.projects set name='Renamed with proposal history' where id=$1::uuid", [f.project]);
    expect((await finance.projectBudget("head", budget.id)).approvedTotalNok).toBe("10000.00");
  });
  it("restores an awarded historical entry through a Draft without discarding its purchased evidence", async () => {
    let budget = await approved(); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "No further plan" }); budget = await write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry }); budget = await approve(budget);
    let app = await application(); app = await appWrite(app, "proposeFundingBudgetEntry", { projectBudgetId: budget.id, expectedBudgetRevision: budget.revision, entry: { ...entry, entryId: f.entry } }); app = await award(app);
    const pending = await finance.projectFundingProposals("lead", budget.id);
    await mutate("lead", { action: "adoptFundingProposal", applicationId: app.id, expectedRevision: app.revision, proposalId: app.proposals[0].id, projectBudgetId: budget.id, expectedBudgetRevision: pending.budgetRevision });
    budget = await finance.projectBudget("lead", budget.id); expect(budget.approvedTotalNok).toBe("0.00"); expect(budget.pendingVersion!.entries[0]).toMatchObject({ entryId: f.entry, removed: false, priority: "P0", actualNok: "1200.00" });
    budget = await approve(budget); expect(budget.approvedTotalNok).toBe("10000.00"); expect((await db.query("select id from finance.documents where id=$1::uuid", [f.document])).rows).toHaveLength(1);
  });
  it("does not convert legacy EM to P0 and keeps awarded obligations when linked funding changes", async () => {
    const fundingId = randomUUID(), partId = randomUUID();
    await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'F-S27-001','Research grant','Head','grant',1000000,'secured',$3::uuid,$3::uuid)", [fundingId, f.season, f.head]);
    await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'FE-001','Steel',1000000,$3::uuid,$3::uuid)", [partId, fundingId, f.head]);
    await db.query("update finance.budget_items set priority='EM',earmark_id=$1::uuid where id=$2::uuid", [partId, f.entry]); expect(await priority()).toBe("EM");
    const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department }); let budget = await finance.projectBudget("lead", created.id!);
    budget = await write("lead", budget, "adoptProjectBudgetEntries", { entries: [{ budgetItemId: f.entry, ordinaryPriority: "P2" }] }); budget = await approve(budget);
    let app = await application("Restricted research", fundingId);
    await deals.saveFundingApplication("marketing", { action: "saveFundingApplication", requestId: randomUUID(), dealId: app.dealId, dealExpectedRevision: 0, expectedRevision: app.revision, seasonId: f.season, purchaseConditions: "Clarified material conditions" });
    app = await finance.fundingApplication("head", app.id); expect(app.fundingId).toBe(fundingId);
    app = await link(app, budget.id); expect(await priority()).toBe("P2"); app = await award(app);
    await db.query("update finance.funding set status='deleted' where id=$1::uuid", [fundingId]); await db.query("update partner_deals.deals set stage='lost' where id=$1::uuid", [app.dealId]);
    expect(await priority()).toBe("P0"); expect((await finance.fundingApplication("head", app.id)).links[0].mandatory).toBe(true);
    expect((await db.query("select priority,earmark_id from finance.budget_items where id=$1::uuid", [f.entry])).rows).toEqual([{ priority: "EM", earmark_id: partId }]);
  });
  it("preserves the old approved plan when an awarded increase is proposed and only project leads adopt it", async () => {
    let budget = await approved(); let app = await application(); app = await appWrite(app, "proposeFundingBudgetEntry", { projectBudgetId: budget.id, expectedBudgetRevision: budget.revision, entry: { ...entry, entryId: f.entry, plannedNok: "12000" } }); app = await award(app);
    const proposals = await finance.projectFundingProposals("lead", budget.id); await mutate("lead", { action: "adoptFundingProposal", applicationId: app.id, expectedRevision: app.revision, projectBudgetId: budget.id, expectedBudgetRevision: proposals.budgetRevision, proposalId: app.proposals[0].id });
    budget = await finance.projectBudget("lead", budget.id); expect(budget.approvedTotalNok).toBe("10000.00"); expect(budget.pendingTotalNok).toBe("12000.00"); expect(await priority()).toBe("P0"); await approve(budget); expect((await finance.projectBudget("head", budget.id)).approvedTotalNok).toBe("12000.00");
  });
  it("catches an award after pending removal and allows promotion only after an explicit release", async () => {
    let budget = await approved(); let app = await application(); budget = await write("lead", budget, "requestProjectBudgetChanges", { reason: "Different material" }); budget = await write("lead", budget, "removeProjectBudgetEntry", { entryId: f.entry }); budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, description: "Replacement" } }); budget = await write("lead", budget, "submitProjectBudget"); budget = (await submitProjectBudgetDepartmentPackage(finance, budget)).budget;
    app = await award(await link(app, budget.id)); budget = await finance.projectBudget("head", budget.id);
    await expect(safe(() => approveProjectBudgetDepartmentPackage(finance, budget))).rejects.toMatchObject({ status: 400 });
    app = await appWrite(app, "releaseFundingObligation", { obligationId: app.links[0].id, reason: "Award conditions withdrawn" }); budget = await finance.projectBudget("head", budget.id); budget = await approveProjectBudgetDepartmentPackage(finance, budget); expect(budget.approvedVersion!.entries.find(entry => entry.entryId === f.entry)?.removed).toBe(true);
    expect((await db.query("select amount_ore::text from finance.allocations where budget_item_id=$1::uuid", [f.entry])).rows).toEqual([{ amount_ore: "120000" }]);
  });
  it("rechecks current identity/grants, retries exactly once, and rejects award/history bypasses", async () => {
    const budget = await approved(); let app = await link(await application(), budget.id); const body = { action: "recordFundingAward", requestId: randomUUID(), applicationId: app.id, expectedRevision: app.revision, awardDate: "2026-11-19", awardReference: "Verified award" };
    const first = await mutate("head", body), replay = await mutate("head", body); expect(replay).toMatchObject({ id: first.id, revision: first.revision, replayed: true });
    app = await finance.fundingApplication("head", app.id);
    await db.query('update neon_auth."user" set banned=true where id=$1::uuid', [f.head]);
    await expect(safe(() => mutate("head", body))).rejects.toMatchObject({ status: 403 });
    await db.query('update neon_auth."user" set banned=false where id=$1::uuid', [f.head]);
    await expect(safe(() => deals.saveFundingApplication("marketing", { action: "saveFundingApplication", requestId: randomUUID(), dealId: app.dealId, dealExpectedRevision: 0, expectedRevision: app.revision, seasonId: f.season, purchaseConditions: "No longer required" }))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => db.query("update finance.funding_applications set awarded_at=null,awarded_by_member_id=null,award_date=null,award_reference=null where id=$1::uuid", [app.id]))).rejects.toMatchObject({ code: "23514" });
    await db.query("update finance.member_grants set active=false,revoked_at=clock_timestamp(),revoked_by_member_id=$2::uuid where member_id=$1::uuid", [f.head, f.outsider]);
    await expect(safe(() => mutate("head", body))).rejects.toMatchObject({ status: 403 }); await expect(safe(() => finance.fundingApplications("head"))).rejects.toMatchObject({ status: 403 });
    expect((await db.query("select id from finance.funding_application_events where action='recordFundingAward' and application_id=$1::uuid", [app.id])).rows).toHaveLength(1);
  });
});
