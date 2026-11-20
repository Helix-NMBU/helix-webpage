import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { createFinanceHandler } from "../../../api/_lib/finance-handler.js";
import { type FinanceMailMessage, composeFinanceMail } from "../../../api/_lib/finance-mail.js";
import { submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage, applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
let pg: PGlite, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const entry = { systemId: f.system, description: "Frame tubes", category: "material", plannedNok: "6000.00", ordinaryPriority: "P1", reuseStatus: "new", status: "planned" };
async function mutate(role: ProjectBudgetFixtureRole, body: Record<string, unknown>) { return services.mutate(role, { requestId: randomUUID(), ...body }); }
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  await pg.exec("savepoint expected_error");
  try { const value = await operation(); await pg.exec("release savepoint expected_error"); return value; }
  catch (error) { await pg.exec("rollback to savepoint expected_error; release savepoint expected_error"); throw error; }
}
async function create() {
  const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department });
  await mutate("lead", { action: "saveProjectBudgetEntry", projectBudgetId: created.id, expectedRevision: created.revision, entry });
  return services.projectBudget("lead", created.id!);
}
async function write(role: ProjectBudgetFixtureRole, budget: ProjectBudgetDetail, action: string, fields: Record<string, unknown> = {}) {
  await mutate(role, { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields });
  return services.projectBudget(role, budget.id);
}
// Allow cold PGlite startup and the full migration chain; assertion timeouts stay unchanged.
beforeAll(async () => {
  pg = new PGlite();
  db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); await applyProjectBudgetMigrations(db);
  services = createFinanceServices({ db, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole) });
}, 30_000);
beforeEach(async () => { await pg.exec("begin"); });
afterEach(async () => { await pg.exec("rollback"); });
afterAll(async () => { await pg.close(); });

describe("project authoring and sequential approval", () => {
  it("drafts without Financials, hides unsubmitted drafts from Finance and exposes only scoped API reads", async () => {
    const budget = await create();
    expect(budget.pendingVersion?.entries[0]).toMatchObject({ plannedNok: "6000.00", ordinaryPriority: "P1", budgetItemId: null });
    expect((await services.projectBudgets("finance")).budgets).toEqual([]);
    await expect(safe(() => services.budgets("lead"))).rejects.toMatchObject({ status: 403 });
    await expect(safe(() => services.projectBudget("otherDepartmentLead", budget.id))).rejects.toMatchObject({ status: 403 });
    const handler = createFinanceHandler(() => services);
    let status = 0, result: unknown;
    const response = { setHeader: vi.fn(), status: (code: number) => { status = code; return response; }, json: (value: unknown) => { result = value; return response; } };
    await handler({ method: "GET", query: { action: "projectBudgets", projectId: f.project }, headers: { authorization: "Bearer lead" } } as unknown as VercelRequest, response as unknown as VercelResponse);
    expect(status).toBe(200); expect(result).toMatchObject({ budgets: [{ id: budget.id }], systems: [{ id: f.system }] });
  });
  it("requires department approval before explicit Head of Finance, then materializes the same stable entry ID", async () => {
    let budget = await create();
    const id = budget.pendingVersion!.entries[0].entryId;
    budget = await write("lead", budget, "submitProjectBudget");
    expect(budget.pendingStage).toBe("department_pending");
    expect((await services.projectBudgets("finance")).budgets[0].pendingStage).toBe("department_pending");
    await expect(safe(() => write("head", budget, "approveProjectBudget"))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => write("finance", budget, "approveDepartmentBudget"))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => write("departmentLead", budget, "approveDepartmentBudget"))).rejects.toMatchObject({ status: 400 });
    await expect(safe(() => submitProjectBudgetDepartmentPackage(services, budget, "finance"))).rejects.toMatchObject({ status: 403 });
    await expect(safe(() => write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: id, plannedNok: "1" } }))).rejects.toMatchObject({ status: 409 });
    budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget;
    expect(budget.pendingStage).toBe("finance_pending");
    await expect(safe(() => write("finance", budget, "approveProjectBudget"))).rejects.toMatchObject({ status: 400 });
    const packet = (await services.departmentBudgetPackages("head", f.department)).packages.find(packet => packet.status === "finance_pending")!;
    await expect(safe(() => mutate("finance", { action: "approveDepartmentBudgetPackage", packageId: packet.id, expectedRevision: packet.revision }))).rejects.toMatchObject({ status: 403 });
    budget = await approveProjectBudgetDepartmentPackage(services, budget);
    expect(budget.pendingVersion).toBeNull(); expect(budget.approvedVersion?.status).toBe("approved");
    expect(budget.approvedVersion?.entries[0]).toMatchObject({ entryId: id, budgetItemId: id, plannedNok: "6000.00" });
    expect(budget.decisions.map(d => d.action)).toEqual(["createProjectBudget", "saveProjectBudgetEntry", "submitProjectBudget", "sendDepartmentBudgetPackage", "approveDepartmentBudgetPackage"]);
    expect((await db.query<{ planned_ore: string }>("select planned_ore::text from finance.effective_budget_entries where id=$1::uuid", [id])).rows[0]?.planned_ore).toBe("600000");
    await pg.exec("set constraints all immediate");
  });
  it("returns and withdraws with reasons and restarts both decisions without rewriting old snapshots", async () => {
    let budget = await create(); budget = await write("lead", budget, "submitProjectBudget");
    const firstSubmit = budget.decisions.find(d => d.action === "submitProjectBudget")!.snapshot;
    await expect(safe(() => write("departmentLead", budget, "returnProjectBudget", { reason: " " }))).rejects.toMatchObject({ status: 400 });
    budget = await write("departmentLead", budget, "returnProjectBudget", { reason: "Clarify quantity" });
    expect(budget.pendingStage).toBe("draft");
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: budget.pendingVersion!.entries[0].entryId, plannedNok: "6500" } });
    budget = await write("lead", budget, "submitProjectBudget");
    budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget;
    budget = await write("lead", budget, "withdrawProjectBudget", { reason: "Update supplier quote" });
    expect(budget.pendingVersion).toMatchObject({ status: "draft", departmentApprovedBy: null, approvedBy: null });
    expect(budget.decisions.find(d => d.action === "submitProjectBudget")!.snapshot).toEqual(firstSubmit);
    budget = await write("lead", budget, "submitProjectBudget");
    await expect(safe(() => write("head", budget, "approveProjectBudget"))).rejects.toMatchObject({ status: 400 });
  });
  it("replays a lost successful response once, rejects stale edits and revoked current assignments", async () => {
    const requestId = randomUUID(), createBody = { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department, requestId };
    const first = await mutate("lead", createBody), replay = await mutate("lead", createBody);
    expect(replay).toMatchObject({ id: first.id, replayed: true, revision: first.revision });
    const body = { action: "saveProjectBudgetEntry", projectBudgetId: first.id, expectedRevision: first.revision, entry };
    await mutate("lead", body);
    await expect(safe(() => mutate("lead", body))).rejects.toMatchObject({ status: 409 });
    await db.query("update project_management.projects set lead_ids='{}' where id=$1::uuid", [f.project]);
    await expect(safe(() => mutate("lead", createBody))).rejects.toMatchObject({ status: 403 });
    expect((await db.query("select id from finance.project_budgets")).rows).toHaveLength(1);
  });
  it("creates an internal Draft ledger for the first approved project without inventing a season approval", async () => {
    const projectId = randomUUID(), departmentId = randomUUID();
    await db.query("insert into project_management.departments(id,season,name) values($1::uuid,'S28','Mechanical & Production')", [departmentId]);
    await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,true)", [departmentId, f.departmentLead]);
    await db.query("insert into project_management.projects values($1::uuid,'S28','Next frame',array[$2::uuid],array['Mechanical & Production'],1)", [projectId, f.lead]);
    const created = await mutate("lead", { action: "createProjectBudget", projectId, responsibleDepartmentId: departmentId });
    let budget = await services.projectBudget("lead", created.id!);
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry }); budget = await write("lead", budget, "submitProjectBudget");
    budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget; budget = await approveProjectBudgetDepartmentPackage(services, budget);
    expect((await db.query<{ status: string; approved_by_member_id: null }>("select status,approved_by_member_id from finance.budgets where season_id=$1::uuid", [f.nextSeason])).rows).toEqual([{ status: "draft", approved_by_member_id: null }]);
    expect(budget.approvedTotalNok).toBe("6000.00");
  });
  it("rejects cross-project systems, inactive systems and manual P0 without changing the draft", async () => {
    const budget = await create();
    for (const fields of [{ systemId: f.electronicSystem }, { ordinaryPriority: "P0" }, { plannedNok: "92233720368547758.08" }]) {
      await expect(safe(() => write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, ...fields } }))).rejects.toMatchObject({ status: 400 });
    }
    await db.query("update finance.systems set active=false where id=$1::uuid", [f.system]);
    await expect(safe(() => write("lead", budget, "saveProjectBudgetEntry", { entry }))).rejects.toMatchObject({ status: 400 });
    expect((await services.projectBudget("lead", budget.id)).revision).toBe(budget.revision);
  });
  it("keeps restricted funding independent of ordinary priority when materializing a stable anchor", async () => {
    let budget = await create();
    const fundingId = randomUUID(), partId = randomUUID();
    await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'F-S27-001','Synthetic fund','Head','grant',1000000,'secured',$3::uuid,$3::uuid)", [fundingId, f.season, f.head]);
    await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'FE-001','Materials',1000000,$3::uuid,$3::uuid)", [partId, fundingId, f.head]);
    budget = await write("lead", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: budget.pendingVersion!.entries[0].entryId, earmarkId: partId, ordinaryPriority: "P2" } });
    budget = await write("lead", budget, "submitProjectBudget"); budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget; budget = await approveProjectBudgetDepartmentPackage(services, budget);
    expect(budget.approvedVersion!.entries[0]).toMatchObject({ ordinaryPriority: "P2", priority: "P2", earmarkId: partId });
    expect((await db.query("select priority,earmark_id from finance.budget_items where id=$1::uuid", [budget.approvedVersion!.entries[0].entryId])).rows).toEqual([{ priority: "EM", earmark_id: partId }]);
  });
  it("dispatches durable review notifications after saving and does not duplicate a retried submission", async () => {
    let budget = await create();
    const send = vi.fn(async (_message: FinanceMailMessage) => ({ outcome: "sent" as const, providerMessageId: "synthetic-provider-id" }));
    const delivery = createFinanceServices({ db, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole), financeDelivery: { send,
      env: { HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_ENABLED: "true", RESEND_API_KEY: "synthetic-key", WEBSITE_EMAIL_TEST_RECIPIENTS: projectBudgetIdentity("departmentLead").email } } });
    const body = { action: "submitProjectBudget", projectBudgetId: budget.id, expectedRevision: budget.revision, requestId: randomUUID() };
    await delivery.mutate("lead", body); await delivery.mutate("lead", body);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: projectBudgetIdentity("departmentLead").email, subject: "Project budget is waiting for department approval" });
    expect((await db.query("select id from finance.outbox where entity_id=$1::uuid and status='sent'", [budget.id])).rows).toHaveLength(1);
    budget = await services.projectBudget("lead", budget.id);
    expect(budget.decisions.filter(d => d.action === "submitProjectBudget")).toHaveLength(1);
  });
  it("requires an active verified department reviewer and permits every currently assigned project lead", async () => {
    let budget = await create();
    await db.query('update neon_auth."user" set banned=true where id=$1::uuid', [f.departmentLead]);
    await expect(safe(() => write("lead", budget, "submitProjectBudget"))).rejects.toMatchObject({ status: 400 });
    await db.query('update neon_auth."user" set banned=false where id=$1::uuid', [f.departmentLead]);
    await db.query('delete from neon_auth.account where "userId"=$1::uuid', [f.departmentLead]);
    await expect(safe(() => write("lead", budget, "submitProjectBudget"))).rejects.toMatchObject({ status: 400 });
    await db.query("update project_management.projects set lead_ids=array_append(lead_ids,$1::uuid) where id=$2::uuid", [f.outsider, f.project]);
    budget = await write("outsider", budget, "saveProjectBudgetEntry", { entry: { ...entry, entryId: budget.pendingVersion!.entries[0].entryId, ordinaryPriority: "P4" } });
    expect(budget.pendingVersion!.entries[0].ordinaryPriority).toBe("P4");
  });
  it("queues actual composers for current reviewers/authors and suppresses revoked recipient access", async () => {
    let budget = await create(); budget = await write("lead", budget, "submitProjectBudget");
    const outbox = (await db.query<{ id: string; event_type: string; recipient_member_id: string; payload: Record<string, unknown> }>("select id,event_type,recipient_member_id,payload from finance.outbox where entity_id=$1::uuid order by created_at,id", [budget.id])).rows;
    expect(outbox).toHaveLength(1); expect(outbox[0]).toMatchObject({ event_type: "project_budget.department_pending", recipient_member_id: f.departmentLead });
    const claimed = { eventType: outbox[0].event_type, entity: "project_budget", entityId: budget.id, recipientMemberId: outbox[0].recipient_member_id, providerIdempotencyKey: "synthetic-budget", payload: outbox[0].payload };
    const mail = await composeFinanceMail(db, {}, claimed);
    expect(mail).toMatchObject({ message: { to: projectBudgetIdentity("departmentLead").email, subject: "Project budget is waiting for department approval" } });
    expect("message" in mail && mail.message.text).not.toContain("6000");
    await db.query("delete from project_management.department_members where member_id=$1::uuid", [f.departmentLead]);
    expect(await composeFinanceMail(db, {}, claimed)).toEqual({ safeError: "recipient_inactive" });
    await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,true)", [f.department, f.departmentLead]);
    budget = (await submitProjectBudgetDepartmentPackage(services, budget)).budget;
    expect(await composeFinanceMail(db, {}, claimed)).toEqual({ safeError: "recipient_inactive" });
    const submitted = (await db.query<{ entity_id: string; payload: Record<string, unknown> }>("select entity_id,payload from finance.outbox where event_type='department_package.submitted' and recipient_member_id=$1::uuid", [f.head])).rows[0];
    const finalReview = { ...claimed, eventType: "department_package.submitted", entity: "department_budget_package", entityId: submitted.entity_id, payload: submitted.payload, recipientMemberId: f.head };
    expect(await composeFinanceMail(db, {}, finalReview)).toMatchObject({ message: { to: projectBudgetIdentity("head").email } });
    await db.query("update finance.member_grants set active=false,revoked_at=clock_timestamp(),revoked_by_member_id=$2::uuid where member_id=$1::uuid", [f.head, f.outsider]);
    expect(await composeFinanceMail(db, {}, finalReview)).toEqual({ safeError: "recipient_inactive" });
  });
});
