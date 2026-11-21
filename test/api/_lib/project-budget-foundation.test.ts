import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadProjectBudgetScope, listProjectBudgetScopes, previewProjectBudgetMapping } from "../../../api/_lib/finance-project-budget-foundation.js";
import { applyProjectBudgetMigrations, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";

let pg: PGlite;
let db: ProjectBudgetTestDatabase;
let loaded: string[];
let beforeMigration: unknown;
let importedBeforeMigration: unknown;
const header = "81111111-1111-4111-8111-111111111111";
const version = "82222222-2222-4222-8222-222222222222";

async function failure<T>(operation: () => Promise<T>): Promise<T> {
  await pg.exec("savepoint expected_failure");
  try { const result = await operation(); await pg.exec("release savepoint expected_failure"); return result; }
  catch (error) { await pg.exec("rollback to savepoint expected_failure; release savepoint expected_failure"); throw error; }
}
async function legacyIdentity() {
  return (await db.query(`select i.id,i.public_ref,i.planned_ore::text,a.id as allocation_id,a.amount_ore::text,
    d.id as document_id,d.storage_key,r.id as request_id
    from finance.budget_items i join finance.allocations a on a.budget_item_id=i.id
    join finance.purchase_lines pl on pl.id=a.line_id join finance.documents d on d.purchase_id=pl.purchase_id
    cross join finance.requests r where i.id=$1::uuid`, [f.entry])).rows;
}
async function importedIdentity() {
  return (await db.query(`select p.id,p.requester_member_id,p.import_source,pl.id as line_id,a.id as allocation_id,a.amount_ore::text,
    invoice.id as invoice_id,invoice.paid,invoice.historical_payment,invoice.paid_by_member_id
    from finance.purchases p join finance.purchase_lines pl on pl.purchase_id=p.id
    join finance.allocations a on a.line_id=pl.id join finance.invoice_obligations invoice on invoice.purchase_id=p.id
    where p.id=$1::uuid`, [f.importedPurchase])).rows;
}
async function candidate(projectId: string = f.project, departmentId: string = f.department) {
  await db.query("insert into finance.project_budgets(id,season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$5::uuid)", [header, f.season, projectId, departmentId, f.lead]);
  await db.query("insert into finance.project_budget_versions(id,project_budget_id,version_number,created_by_member_id) values($1::uuid,$2::uuid,1,$3::uuid)", [version, header, f.lead]);
  await db.query("update finance.project_budgets set pending_version_id=$1::uuid where id=$2::uuid", [version, header]);
}
async function mapEntry(entryId: string = f.entry, systemId: string = f.system) {
  await db.query("insert into finance.project_budget_entries(id,project_budget_id,budget_item_id,created_by_member_id) values($1::uuid,$2::uuid,$1::uuid,$3::uuid)", [entryId, header, f.lead]);
  await db.query(`insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status)
    values($1::uuid,$2::uuid,$3::uuid,'Proposed changed plan','material',2000000,'P3','new')`, [version, entryId, systemId]);
}
// Allow cold PGlite startup and the full migration chain; assertion timeouts stay unchanged.
beforeAll(async () => {
  pg = new PGlite();
  db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  await setupProjectBudgetBase(db);
  await seedProjectBudgetLegacy(db);
  beforeMigration = await legacyIdentity();
  importedBeforeMigration = await importedIdentity();
  loaded = await applyProjectBudgetMigrations(db);
}, 30_000);
beforeEach(async () => { await pg.exec("begin"); });
afterEach(async () => { await pg.exec("rollback"); });
afterAll(async () => { await pg.close(); });

describe("project budget foundation through current identities and real migrations", () => {
  it("loads migration 066 and preserves legacy allocation, document and request identities", async () => {
    expect(loaded).toContain("066_project_budget_foundation.sql");
    expect(await legacyIdentity()).toEqual(beforeMigration);
    expect(await importedIdentity()).toEqual(importedBeforeMigration);
    expect(importedBeforeMigration).toMatchObject([{ requester_member_id: null, import_source: "synthetic-historical-export", paid: true, historical_payment: true, paid_by_member_id: null }]);
    const entries = (await db.query<{ id: string; planned_ore: string; source: string; storage_backend?: string }>("select id,planned_ore::text,source from finance.effective_budget_entries order by id")).rows;
    expect(entries).toEqual([{ id: f.entry, planned_ore: "1000000", source: "legacy" }, { id: f.electronicEntry, planned_ore: "500000", source: "legacy" }, { id: f.unallocatedEntry, planned_ore: "0", source: "legacy" }]);
    expect((await db.query<{ amount: string }>("select sum(a.amount_ore)::text as amount from finance.allocations a join finance.effective_budget_entries e on e.id=a.budget_item_id where e.id=$1::uuid", [f.unallocatedEntry])).rows[0]?.amount).toBe("30000");
    expect((await db.query<{ storage_backend: string }>("select storage_backend from finance.documents where id=$1::uuid", [f.document])).rows[0]?.storage_backend).toBe("private_storage");
  });
  it("lets an assigned lead draft without Financials but does not give private Finance permissions", async () => {
    const scope = await loadProjectBudgetScope(db, projectBudgetIdentity("lead"), f.project);
    expect(scope.capabilities).toMatchObject({ canRead: true, canDraft: true, canReadFinance: false, canReviewDepartment: false, canApproveFinance: false });
    expect((await listProjectBudgetScopes(db, projectBudgetIdentity("lead"))).map(s => s.projectId).sort()).toEqual([f.project, f.electronicProject].sort());
  });
  it("separates the responsible department lead, Finance and Head of Finance", async () => {
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("departmentLead"), f.project)).capabilities).toMatchObject({ canReviewDepartment: true, canRegisterPurchase: true, canDraft: false, canApproveFinance: false });
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("finance"), f.project)).capabilities).toMatchObject({ canReadFinance: true, canApproveFinance: false, canDraft: false });
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("head"), f.project)).capabilities).toMatchObject({ canReadFinance: true, canApproveFinance: true, canRecordAward: true, canReleaseObligation: true });
    await expect(failure(() => loadProjectBudgetScope(db, projectBudgetIdentity("otherDepartmentLead"), f.project))).rejects.toMatchObject({ status: 403 });
    await expect(failure(() => loadProjectBudgetScope(db, projectBudgetIdentity("outsider"), f.project))).rejects.toMatchObject({ status: 403 });
  });
  it("allows any current responsible department lead to review without a global Finance grant", async () => {
    await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,true)", [f.department, f.otherDepartmentLead]);
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("otherDepartmentLead"), f.project)).capabilities).toMatchObject({ canReviewDepartment: true, canReadFinance: false });
  });
  it("rechecks revoked assignments, Google linkage and banned accounts", async () => {
    await db.query("update project_management.projects set lead_ids='{}' where id=$1::uuid", [f.project]);
    await expect(failure(() => loadProjectBudgetScope(db, projectBudgetIdentity("lead"), f.project))).rejects.toMatchObject({ status: 403 });
    await expect(failure(() => loadProjectBudgetScope(db, { ...projectBudgetIdentity("head"), googleSub: "partner-otp-sub" }, f.project))).rejects.toMatchObject({ status: 403 });
    await db.query('update neon_auth."user" set banned=true where id=$1::uuid', [f.head]);
    await expect(failure(() => loadProjectBudgetScope(db, projectBudgetIdentity("head"), f.project))).rejects.toMatchObject({ status: 403 });
  });
  it("keeps a mapped Draft plan ineffective, then supersedes the old plan once without changing IDs", async () => {
    await candidate();
    await mapEntry();
    expect((await db.query<{ planned_ore: string }>("select planned_ore::text from finance.effective_budget_entries where id=$1::uuid", [f.entry])).rows[0]?.planned_ore).toBe("1000000");
    await db.query(`update finance.project_budget_versions set status='approved',department_approved_by=$1::uuid,department_approved_at=now(),approved_by=$2::uuid,approved_at=now() where id=$3::uuid`, [f.departmentLead, f.head, version]);
    await db.query("update finance.project_budgets set approved_version_id=$1::uuid,pending_version_id=null where id=$2::uuid", [version, header]);
    expect((await db.query<{ id: string; planned_ore: string; source: string }>("select id,planned_ore::text,source from finance.effective_budget_entries where id=$1::uuid", [f.entry])).rows).toEqual([{ id: f.entry, planned_ore: "2000000", source: "project" }]);
    expect(await legacyIdentity()).toEqual(beforeMigration);
    const remaining = await previewProjectBudgetMapping(db, projectBudgetIdentity("finance"), "S27", []);
    expect(remaining).toMatchObject({ sourceTotalNok: "5000.00", mappedTotalNok: "0.00", unmappedTotalNok: "5000.00" });
    expect(remaining.unmapped.map(item => item.budgetItemId)).toEqual([f.electronicEntry]);
    const remap = await previewProjectBudgetMapping(db, projectBudgetIdentity("finance"), "S27", [{ budgetItemId: f.entry, projectId: f.project, responsibleDepartmentId: f.department }]);
    expect(remap.conflicts).toMatchObject([{ code: "already_mapped" }]);
    await expect(db.query("update finance.project_budget_version_entries set planned_ore=1 where version_id=$1::uuid", [version])).rejects.toThrow("PROJECT_VERSION_IMMUTABLE");
  });
  it("uses canonical Electronics mapping for the legacy Electrical system and rejects other departments", async () => {
    await candidate(f.electronicProject, f.electronicDepartment);
    await mapEntry(f.electronicEntry, f.electronicSystem);
    expect((await db.query("select entry_id from finance.project_budget_version_entries where version_id=$1::uuid", [version])).rows).toHaveLength(1);
    await expect(db.query("insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status) values($1::uuid,$2::uuid,$3::uuid,'Wrong system','other',10,'P1','new')", [version, f.electronicEntry, f.system])).rejects.toThrow("PROJECT_ENTRY_MISMATCH");
  });
  it("previews mapping without writes, reports conflicts/unmapped totals and enforces Finance access", async () => {
    const report = await previewProjectBudgetMapping(db, projectBudgetIdentity("finance"), "S27", [{ budgetItemId: f.entry, projectId: f.project, responsibleDepartmentId: f.department }]);
    expect(report).toMatchObject({ valid: true, sourceTotalNok: "15000.00", mappedTotalNok: "10000.00", unmappedTotalNok: "5000.00" });
    expect(report.rows[0]).toMatchObject({ budgetItemId: f.entry, actualNok: "1200.00" });
    expect((await db.query("select id from finance.project_budgets")).rows).toEqual([]);
    expect(await legacyIdentity()).toEqual(beforeMigration);
    const invalid = await previewProjectBudgetMapping(db, projectBudgetIdentity("head"), "S27", [
      { budgetItemId: f.entry, projectId: f.electronicProject, responsibleDepartmentId: f.electronicDepartment },
      { budgetItemId: f.entry, projectId: f.project, responsibleDepartmentId: f.department },
    ]);
    expect(invalid.valid).toBe(false);
    expect(invalid.conflicts.map(c => c.code)).toEqual(["system_project_mismatch", "duplicate_entry"]);
    await expect(previewProjectBudgetMapping(db, projectBudgetIdentity("lead"), "S27", [])).rejects.toMatchObject({ status: 403 });
  });
  it("does not expose unapproved new entries or allow a Draft version to serve as approved", async () => {
    await candidate();
    const id = "83333333-3333-4333-8333-333333333333";
    await db.query("insert into finance.project_budget_entries(id,project_budget_id,created_by_member_id) values($1::uuid,$2::uuid,$3::uuid)", [id, header, f.lead]);
    expect((await db.query("select id from finance.effective_budget_entries where id=$1::uuid", [id])).rows).toEqual([]);
    await expect(failure(async () => {
      await db.query("update finance.project_budgets set approved_version_id=$1::uuid,pending_version_id=null where id=$2::uuid", [version, header]);
      await pg.exec("set constraints all immediate");
    })).rejects.toThrow("PROJECT_APPROVED_VERSION_MISMATCH");
  });
  it("requires an explicit ordinary priority when mapping EM without changing its restricted funding link", async () => {
    const fund = "84444444-4444-4444-8444-444444444444", part = "85555555-5555-4555-8555-555555555555";
    await db.query("insert into finance.funding(id,season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'F-S27-001','Synthetic grant','Synthetic owner','grant',1000000,'secured',$3::uuid,$3::uuid)", [fund, f.season, f.head]);
    await db.query("insert into finance.funding_parts(id,funding_id,public_ref,purpose,amount_ore,created_by_member_id,updated_by_member_id) values($1::uuid,$2::uuid,'FE-001','Steel',1000000,$3::uuid,$3::uuid)", [part, fund, f.head]);
    await db.query("update finance.budget_items set priority='EM',earmark_id=$1::uuid where id=$2::uuid", [part, f.entry]);
    const row = { budgetItemId: f.entry, projectId: f.project, responsibleDepartmentId: f.department };
    expect((await previewProjectBudgetMapping(db, projectBudgetIdentity("head"), "S27", [row])).conflicts).toMatchObject([{ code: "ordinary_priority_required" }]);
    expect((await previewProjectBudgetMapping(db, projectBudgetIdentity("head"), "S27", [{ ...row, ordinaryPriority: "P2" }])).valid).toBe(true);
    expect((await db.query<{ priority: string; earmark_id: string }>("select priority,earmark_id from finance.effective_budget_entries where id=$1::uuid", [f.entry])).rows[0]).toEqual({ priority: "EM", earmark_id: part });
  });
  it("does not let a caller substitute another linked department for the responsible department", async () => {
    await db.query("update project_management.projects set departments=array['Mechanical & Production','Electronics'] where id=$1::uuid", [f.project]);
    await candidate();
    await expect(failure(() => loadProjectBudgetScope(db, projectBudgetIdentity("otherDepartmentLead"), f.project, f.electronicDepartment))).rejects.toMatchObject({ status: 400 });
    await expect(failure(() => loadProjectBudgetScope(db, projectBudgetIdentity("otherDepartmentLead"), f.project))).rejects.toMatchObject({ status: 403 });
    expect((await loadProjectBudgetScope(db, projectBudgetIdentity("departmentLead"), f.project)).responsibleDepartmentId).toBe(f.department);
  });
  it("rejects a project header whose department is outside the project", async () => {
    await expect(candidate(f.project, f.electronicDepartment)).rejects.toThrow("PROJECT_DEPARTMENT_MISMATCH");
  });
});
