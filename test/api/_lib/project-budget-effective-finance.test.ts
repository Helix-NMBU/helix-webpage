import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { loadBudgetHierarchy } from "../../../api/_lib/finance-budgets.js";
import { loadEffectiveFinancePresence } from "../../../api/_lib/finance-effective-read.js";
import { loadFundingScenarios } from "../../../api/_lib/finance-summary.js";
import { loadFundingRecords } from "../../../api/_lib/finance-funding-read.js";
import { createSeasonFinancialServices } from "../../../api/_lib/season-financials-service.js";
import { capabilitiesForProfiles } from "../../../src/features/Finance/access.js";
import { osloToday, addCalendarDays } from "../../../src/features/Finance/money.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import type { PublicBudgets } from "../../../src/features/Finance/types.js";
import { createMemoryFinanceStorage, putMemoryPdf } from "./finance-storage-mock.js";
import { applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
let pg: PGlite, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const storage = createMemoryFinanceStorage();
const mutate = (role: ProjectBudgetFixtureRole, body: Record<string, unknown>) => services.mutate(role, { requestId: randomUUID(), ...body });
const input = { systemId: f.system, description: "Approved frame", category: "material", plannedNok: "10000", ordinaryPriority: "P2", reuseStatus: "new", status: "planned" };
async function safe<T>(fn: () => Promise<T>) { await pg.exec("savepoint expected_error"); try { const result = await fn(); await pg.exec("release savepoint expected_error"); return result; } catch (error) { await pg.exec("rollback to savepoint expected_error; release savepoint expected_error"); throw error; } }
async function write(b: ProjectBudgetDetail, action: string, fields = {}, role: ProjectBudgetFixtureRole = "lead") { await mutate(role, { action, projectBudgetId: b.id, expectedRevision: b.revision, ...fields }); return services.projectBudget("lead", b.id); }
async function draft(adopt = true) { const created = await mutate("lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department }); let b = await services.projectBudget("lead", created.id!); b = await write(b, adopt ? "adoptProjectBudgetEntries" : "saveProjectBudgetEntry", adopt ? { entries: [{ budgetItemId: f.entry, ordinaryPriority: "P2" }] } : { entry: input }); return b; }
async function approve(b: ProjectBudgetDetail) { b = await write(b, "submitProjectBudget"); b = await write(b, "approveDepartmentBudget", {}, "departmentLead"); return write(b, "approveProjectBudget", {}, "head"); }
const budgets = async () => await services.budgets("head") as PublicBudgets;
const items = (b: PublicBudgets) => b.departments.flatMap(d => d.systems.flatMap(s => s.items));
const plan = (b: PublicBudgets) => b.departments.reduce((n, d) => n + Number(d.plannedNok), 0);
const actual = (b: PublicBudgets) => b.departments.reduce((n, d) => n + Number(d.actualNok), 0);
async function upload() { const u = await mutate("head", { action: "authorizeUpload", fileName: "invoice.pdf", contentType: "application/pdf", byteSize: 8 }); await putMemoryPdf(storage, u.stagingKey!); await mutate("head", { action: "finalizeUpload", uploadId: u.id }); return u.id!; }
async function purchase(itemId: string | null, systemId: string = f.system, amountNok = "500") { return mutate("head", { action: "registerPurchase", purchase: { buyerName: "Finance buyer", supplierName: "Supplier", paymentMethod: "team_account", purchaseDate: osloToday(), justification: "Frame purchase", documentKind: "receipt", uploadIds: [await upload()], lines: [{ systemId, budgetItemId: itemId, unbudgeted: itemId === null, description: "Material", quantity: "1", amountNok }] } }); }
async function fund(label: string) { const id = randomUUID(), part = randomUUID(); await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,$3,$3,'Head','grant',2000000,'received',$4::uuid,$4::uuid)", [id, f.season, 'F-S27-' + (label === 'A' ? '001' : '002'), f.head]); await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,$3,$3,2000000,$4::uuid,$4::uuid)", [part, id, 'FE-' + (label === 'A' ? '001' : '002'), f.head]); return part; }
beforeAll(async () => { pg = new PGlite(); db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params).catch(error => { console.error("Synthetic Finance query failed", { action: sql.match(/finance\.[a-z_]+/)?.[0], code: error.code, constraint: error.constraint, message: error.message }); throw error; })).rows }) }; await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); await applyProjectBudgetMigrations(db); await db.exec(readFileSync(new URL("../../../db/migrations/034_finance_bank_snapshot.sql",import.meta.url),"utf8")); await db.exec("alter table partner_deals.deals add column cancelled_at timestamptz; create table partner_deals.contributions(season_id uuid,deal_id uuid,amount_ore bigint,kind text,retired_at timestamptz,pending_change_id uuid);"); await db.query("insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test',$1::uuid)", [f.head]); await db.query("insert into finance.reference_counters(counter_key,configured_next,last_issued,updated_by_member_id) values('request:S27',2,1,$1::uuid)", [f.head]); await db.exec(`create table project_management.access(member_id uuid primary key,active boolean); insert into project_management.access values('${f.lead}',true);`); services = createFinanceServices({ db, financeStorage: storage, authenticate: async token => projectBudgetIdentity(token as ProjectBudgetFixtureRole) }); }, 30000);
beforeEach(() => pg.exec("begin")); afterEach(() => pg.exec("rollback")); afterAll(() => pg.close());
describe("canonical effective Finance reads", () => {
  it("counts legacy, imported paid actuals, adoption and pending revisions once; removal retains actuals", async () => {
    expect(plan(await budgets())).toBe(15000); expect(actual(await budgets())).toBe(2000);
    let b = await draft(); b = await write(b, "saveProjectBudgetEntry", { entry: { ...input, entryId: f.entry, plannedNok: "9000" } });
    expect(plan(await budgets())).toBe(15000); b = await approve(b);
    expect(plan(await budgets())).toBe(14000); expect(actual(await budgets())).toBe(2000);
    b = await write(b, "requestProjectBudgetChanges", { reason: "Updated quote" }); b = await write(b, "saveProjectBudgetEntry", { entry: { ...input, entryId: f.entry, plannedNok: "12000" } });
    expect(plan(await budgets())).toBe(14000); b = await write(b, "removeProjectBudgetEntry", { entryId: f.entry }); b = await approve(b);
    expect(plan(await budgets())).toBe(5000); expect(actual(await budgets())).toBe(2000);
    expect(items(await budgets()).find(i => i.id === f.entry)).toMatchObject({ actualNok: "1200.00", effectivePlanNok: "0.00", status: "cancelled" });
    await db.query("update finance.purchases set status='voided',void_reason='Duplicate historical entry',voided_at=clock_timestamp(),voided_by_member_id=$2::uuid where id=$1::uuid", [f.importedPurchase,f.head]);
    expect(actual(await budgets())).toBe(1500);
  });
  it("shows real project approval without fabricating season approval or revealing private Draft rows", async () => {
    await db.query("update finance.budgets set status='draft',approved_by_member_id=null,approved_on=null where id=$1::uuid", [f.legacyBudget]);
    await db.query("update finance.budget_items set description='PRIVATE DRAFT',note='PRIVATE NOTE' where id=$1::uuid", [f.electronicEntry]);
    const b = await approve(await draft(false)); const presence = await loadEffectiveFinancePresence(db.query.bind(db), "S27");
    expect(presence).toEqual({ approvedPresence: { legacyBudget: false, projectBudgets: true }, hasRecordedActuals: true });
    const view = await loadBudgetHierarchy(db, { memberId: f.lead, viewVersion: 1, seasonCode: "S27", capabilities: capabilitiesForProfiles([]) }, { status: "draft", approvedOn: null, budgetId: f.legacyBudget, revision: 0, ...presence }, projectBudgetIdentity("lead"));
    expect(plan(view)).toBe(10000); expect(actual(view)).toBe(2000); expect(items(view).map(i => i.id)).toEqual([b.approvedVersion!.entries[0].entryId]);
    const json = JSON.stringify(view); for (const privateValue of ["PRIVATE DRAFT", "PRIVATE NOTE", "invoices", "completion", f.document, f.purchase, "ownerEmail"]) expect(json).not.toContain(privateValue);
    expect(view).toMatchObject({ budgetStatus: "draft", approvedOn: null });
    const season = await createSeasonFinancialServices({ db, authenticate: async () => projectBudgetIdentity("lead") }).summary("lead");
    expect(season).toMatchObject({ budgetStatus: "draft-hidden", plannedNok: "10000.00", actualNok: "2000.00", approvedPresence: presence.approvedPresence });
    for (const field of ["invoices", "completion", "earmark", "funding", "purchaseId", "sourceName", "description", f.document]) expect(JSON.stringify(season)).not.toContain(field);
  });
  it("keeps historical funding attribution on its recorded approved version after relinking", async () => {
    const a = await fund("A"), z = await fund("B"); await db.query("update finance.budget_items set priority='EM',earmark_id=$1::uuid where id=$2::uuid", [a, f.entry]);
    let b = await approve(await draft()); const first = b.approvedVersionId!; await purchase(f.entry); b = await services.projectBudget("lead",b.id);
    b = await write(b, "requestProjectBudgetChanges", { reason: "Different funding" }); b = await write(b, "saveProjectBudgetEntry", { entry: { ...input, entryId: f.entry, earmarkId: z } }); b = await approve(b);
    const facts = (await db.query<{ part: string; amount: string; version: string | null }>("select recorded_earmark_id as part,amount_ore::text as amount,approved_version_id as version from finance.registered_allocation_facts where budget_item_id=$1::uuid order by amount_ore", [f.entry])).rows;
    expect(facts).toEqual([{ part: a, amount: "50000", version: first }, { part: a, amount: "120000", version: null }]);
    const records = await loadFundingRecords(db.query.bind(db), "S27", osloToday(), true);
    expect(records.parts.find(p => p.id === a)?.usedNok).toBe("1700.00"); expect(records.parts.find(p => p.id === z)?.usedNok).toBe("0.00");
    expect(records.parts.find(p => p.id === z)?.linkedItems[0]).toMatchObject({ id: f.entry, description: "Approved frame" });
    expect(actual(await budgets())).toBe(2500);
    const scenarios = await loadFundingScenarios(db.query.bind(db), "S27", true);
    expect(scenarios[0]).toMatchObject({ needNok: "2500.00", restrictedCoverNok: "1700.00", generalNeedNok: "800.00" });
    expect(scenarios[1]).toMatchObject({ needNok: "15300.00", restrictedCoverNok: "10000.00", generalNeedNok: "5300.00" });
  });
  it("makes awarded P0 mandatory without creating cash or making legacy EM mandatory", async () => {
    let b = await draft(false); b = await write(b, "saveProjectBudgetEntry", { entry: { ...input, entryId: b.pendingVersion!.entries[0].entryId, ordinaryPriority: "P4", plannedNok: "100" } }); b = await approve(b);
    const before = await loadFundingScenarios(db.query.bind(db), "S27", true);
    const deal = randomUUID(), app = randomUUID(); await db.query("insert into partner_deals.deals(id) values($1::uuid)", [deal]); await db.query("insert into finance.funding_applications(id,deal_id,season_id,purchase_conditions,awarded_at,awarded_by_member_id,award_date,award_reference,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid,'Required material',clock_timestamp(),$4::uuid,'2026-11-19','Synthetic award',$4::uuid)", [app, deal, f.season, f.head]); await db.query("insert into finance.budget_obligations(application_id,entry_id,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid)", [app, b.approvedVersion!.entries[0].entryId, f.head]);
    const after = await loadFundingScenarios(db.query.bind(db), "S27", true);
    expect(after.map(s => Number(s.needNok) - Number(before.find(old => old.key === s.key)!.needNok))).toEqual([100,100,0]); expect(after.map(s => s.eligibleFundingNok)).toEqual(["0.00","0.00","0.00"]);
    expect(items(await budgets()).find(i => i.id === b.approvedVersion!.entries[0].entryId)).toMatchObject({ priority: "P0", ordinaryPriority: "P4", earmarked: false });
  });
  it("supports optional approved commitments against a project plan in a Draft compatibility ledger", async () => {
    await db.query("update finance.budgets set status='draft',approved_by_member_id=null,approved_on=null where id=$1::uuid", [f.legacyBudget]);
    const b = await approve(await draft(false)), id = b.approvedVersion!.entries[0].entryId;
    const request = { supplierName: "Supplier", justification: "Materials for frame", plannedDate: addCalendarDays(osloToday(),3), lines: [{ budgetItemId: id, description: "Frame", estimatedNok: "12000" }] };
    const saved = await mutate("head", { action: "saveRequest", request }); await mutate("head", { action: "submitRequest", requestRecordId: saved.id, expectedRevision: saved.revision, request });
    const row = (await db.query<{ id: string; revision: string }>("select l.id,r.submitted_revision_id as revision from finance.requests r join finance.request_lines l on l.revision_id=r.submitted_revision_id where r.id=$1::uuid", [saved.id])).rows[0]; await mutate("head", { action: "decideRequest", requestRecordId: saved.id, revisionId: row.revision, decision: "approved", reason: "Approved materials", approvedOreByLine: { [row.id]: "1200000" } });
    const all = await loadFundingScenarios(db.query.bind(db), "S27", true); expect(all.map(s => s.needNok)).toEqual(["14000.00","14000.00","14000.00"]);
    expect(items(await budgets()).find(i => i.id === id)).toMatchObject({ commitmentNok: "12000.00" });
  });
  it("keeps incurred unbudgeted actuals scoped before any project budget header exists", async () => {
    await db.query("update finance.budgets set status='draft',approved_by_member_id=null,approved_on=null where id=$1::uuid", [f.legacyBudget]);
    const bind = { projectId: f.project, responsibleDepartmentId: f.department };
    const authorized = await mutate("departmentLead", { action: "authorizeProjectPurchaseUpload", ...bind, fileName: "invoice.pdf", contentType: "application/pdf", byteSize: 8 });
    await putMemoryPdf(storage,authorized.stagingKey!); await mutate("departmentLead",{action:"finalizeProjectPurchaseUpload",...bind,uploadId:authorized.id});
    await mutate("departmentLead",{action:"registerProjectPurchase",...bind,purchase:{buyerName:"Department buyer",supplierName:"Supplier",paymentMethod:"team_account",purchaseDate:osloToday(),justification:"Incurred frame materials",documentKind:"receipt",uploadIds:[authorized.id],lines:[{systemId:f.system,budgetItemId:null,unbudgeted:true,description:"Materials",quantity:"1",amountNok:"75"}]}});
    const workspace = await services.projectBudgets("head");
    expect(workspace.budgets).toEqual([]);
    expect(workspace.scopes.find(scope=>scope.projectId===f.project)?.financials).toEqual({actualNok:"75.00",unbudgetedNok:"75.00"});
    expect(workspace.scopes.find(scope=>scope.projectId===f.electronicProject)?.financials).toEqual({actualNok:"0.00",unbudgetedNok:"0.00"});
    expect(actual(await budgets())).toBe(2075);
    const b = await approve(await draft(false)); expect(b).toMatchObject({actualNok:"75.00",unbudgetedNok:"75.00"});
  });
  it("validates effective system/status for generic purchases after revision and rejects unapproved Draft entries", async () => {
    await db.query("update finance.budgets set status='draft',approved_by_member_id=null,approved_on=null where id=$1::uuid", [f.legacyBudget]);
    const system = randomUUID(); await db.query("insert into finance.systems(id,department_key,code,name) values($1::uuid,'mechanical-production','SYS-F2','Frame revised')", [system]);
    let b = await approve(await draft(false)); const id = b.approvedVersion!.entries[0].entryId;
    await purchase(id); b = await services.projectBudget("lead",b.id); await expect(safe(() => purchase(f.entry))).rejects.toMatchObject({ status: 400 });
    b = await write(b, "requestProjectBudgetChanges", { reason: "Different system" }); b = await write(b, "saveProjectBudgetEntry", { entry: { ...input, entryId: id, systemId: system } }); b = await approve(b);
    await expect(safe(() => purchase(id))).rejects.toMatchObject({ status: 400 }); await purchase(id, system); b = await services.projectBudget("lead",b.id);
    const view = await budgets(); expect(view.departments.flatMap(d => d.systems).find(s => s.id === system)).toMatchObject({ actualNok: "1000.00", plannedNok: "10000.00" });
    const history = (await db.query("select distinct purchase_system_id from finance.registered_allocation_facts where budget_item_id=$1::uuid order by purchase_system_id", [id])).rows; expect(history).toEqual([{ purchase_system_id: f.system }, { purchase_system_id: system }].sort((a,b) => a.purchase_system_id.localeCompare(b.purchase_system_id)));
    b = await write(b, "requestProjectBudgetChanges", { reason: "No remaining plan" }); b = await write(b, "removeProjectBudgetEntry", { entryId: id }); await approve(b); await expect(safe(() => purchase(id, system))).rejects.toMatchObject({ status: 400 });
  });
});
