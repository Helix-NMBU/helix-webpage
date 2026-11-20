import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { loadDepartmentHomeBudget } from "../../../api/_lib/finance-department-home.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { applyProjectBudgetMigrations, submitProjectBudgetDepartmentPackage, approveProjectBudgetDepartmentPackage, projectBudgetFixture as f, projectBudgetIdentity, setupProjectBudgetBase, seedProjectBudgetLegacy, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";

let pg: PGlite, db: ProjectBudgetTestDatabase, services: ReturnType<typeof createFinanceServices>;
const allocation = async (role: ProjectBudgetFixtureRole = "lead", departmentId: string = f.department) => loadDepartmentHomeBudget(db, projectBudgetIdentity(role), departmentId);
const migrations = new URL("../../../db/migrations/", import.meta.url);

beforeAll(async () => {
  pg = new PGlite();
  db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  await setupProjectBudgetBase(db);
  await seedProjectBudgetLegacy(db);
  await applyProjectBudgetMigrations(db);
  const currentSeason = readFileSync(new URL("041_project_current_season.sql", migrations), "utf8")
    .match(/create or replace function project_management\.current_season\([\s\S]*?\$\$;/)?.[0];
  if (!currentSeason) throw new Error("Missing real current-season function");
  await pg.exec(currentSeason);
  await db.query("insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test current season',$1::uuid)", [f.head]);
  await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,false)", [f.department, f.lead]);
  services = createFinanceServices({ db, authenticate: async role => projectBudgetIdentity(role as ProjectBudgetFixtureRole) });
  // Real approved plans feed 074's canonical view. Physical Electronics costs
  // in Frame belong to its Mechanical responsible department; legacy stays separate.
  await db.query("update project_management.projects set departments=array['Mechanical & Production','Electronics'] where id=$1::uuid", [f.project]);
  await db.query("update finance.budget_items set planned_ore=case when id=$1::uuid then 5000 else 0 end where not protected", [f.entry]);
  for (const [projectId, departmentId, entries] of [
    [f.project, f.department, [[f.system, "123.45"], [f.electronicSystem, "67.89"]]],
    [f.electronicProject, f.electronicDepartment, [[f.electronicSystem, "300.00"]]],
  ] as const) {
    const created = await services.mutate("lead", { action: "createProjectBudget", requestId: randomUUID(), projectId, responsibleDepartmentId: departmentId });
    let budget = await services.projectBudget("lead", created.id!);
    const action = async (name: string, fields = {}) => {
      await services.mutate("lead", { action: name, requestId: randomUUID(), projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields });
      budget = await services.projectBudget("lead", budget.id);
    };
    for (const [systemId, plannedNok] of entries) await action("saveProjectBudgetEntry", { entry: { systemId, description: "Private item details", category: "material", plannedNok, ordinaryPriority: "P1", reuseStatus: "new", status: "planned", note: "PRIVATE DRAFT NOTE" } });
    await action("submitProjectBudget");
    budget = (await submitProjectBudgetDepartmentPackage(services, budget, departmentId === f.department ? "departmentLead" : "otherDepartmentLead")).budget;
    await approveProjectBudgetDepartmentPackage(services, budget);
  }
}, 30000);
beforeEach(() => pg.exec("begin"));
afterEach(() => pg.exec("rollback"));
afterAll(() => pg.close());

it("shows the approved responsible-department total and projects to an ordinary member without Financials", async () => {
  const before = (await db.query("select version from finance.view_versions")).rows;
  expect(await allocation()).toMatchObject({ departmentId: f.department, departmentName: "Mechanical & Production", seasonId: f.season, seasonCode: "S27", approvedTotalNok: "241.34", legacyTotalNok: "50.00", projects: [{ projectId: f.project, projectName: "Frame", approvedTotalNok: "191.34" }] });
  expect((await db.query("select version from finance.view_versions")).rows).toEqual(before);
  const other = await allocation("otherDepartmentLead", f.electronicDepartment);
  expect(other).toMatchObject({ approvedTotalNok: "300.00", projects: [{ projectId: f.electronicProject, approvedTotalNok: "300.00" }] });
});

it("returns an explicit aggregate allowlist without entries, invoices, funding, drafts or extra query fields", async () => {
  const approved = (await services.projectBudgets("lead", f.project)).budgets[0];
  await services.mutate("lead", { action: "requestProjectBudgetChanges", requestId: randomUUID(), projectBudgetId: approved.id, expectedRevision: approved.revision, reason: "Private candidate quote" });
  const candidate = await services.projectBudget("lead", approved.id);
  await services.mutate("lead", { action: "saveProjectBudgetEntry", requestId: randomUUID(), projectBudgetId: candidate.id, expectedRevision: candidate.revision, entry: { ...candidate.pendingVersion!.entries[0], description: "PRIVATE UNAPPROVED ENTRY", plannedNok: "9000.00" } });
  const summary = await allocation();
  expect(summary.approvedTotalNok).toBe("241.34");
  expect(Object.keys(summary).sort()).toEqual(["approvedTotalNok", "departmentId", "departmentName", "legacyTotalNok", "projects", "seasonCode", "seasonId", "viewVersion"].sort());
  expect(Object.keys(summary.projects[0]).sort()).toEqual(["projectId", "projectName", "approvedTotalNok"].sort());
  for (const privateValue of ["Private item details", "PRIVATE DRAFT NOTE", "PRIVATE UNAPPROVED ENTRY", "9000.00", "invoice", "earmark", "funding", "approvedVersion", "pendingVersion", "ownerEmail"]) expect(JSON.stringify(summary)).not.toContain(privateValue);
});

it.each(["otherDepartmentLead", "finance", "head", "outsider"] as const)("does not grant widget access from another department, Finance, a title or administrator role: %s", async role => {
  await expect(allocation(role)).rejects.toMatchObject({ status: 403 });
});

it("requires current membership and removes access after revocation", async () => {
  expect((await allocation()).approvedTotalNok).toBe("241.34");
  await db.query("delete from project_management.department_members where department_id=$1::uuid and member_id=$2::uuid", [f.department, f.lead]);
  await expect(allocation()).rejects.toMatchObject({ status: 403 });
});

it.each(["banned", "unverified", "no-google-link", "wrong-google-sub", "wrong-email"] as const)("requires the current verified linked Google identity: %s", async fault => {
  let identity = projectBudgetIdentity("lead");
  if (fault === "banned") await db.query('update neon_auth."user" set banned=true where id=$1::uuid', [f.lead]);
  if (fault === "unverified") await db.query('update neon_auth."user" set "emailVerified"=false where id=$1::uuid', [f.lead]);
  if (fault === "no-google-link") await db.query('delete from neon_auth.account where "userId"=$1::uuid', [f.lead]);
  if (fault === "wrong-google-sub") identity = { ...identity, googleSub: "unrelated-provider" };
  if (fault === "wrong-email") identity = { ...identity, email: "unrelated@example.test" };
  await expect(loadDepartmentHomeBudget(db, identity, f.department)).rejects.toMatchObject({ status: 403 });
});

it("does not read a department from a different current season", async () => {
  await db.query("update finance.settings set setting_value='\"S28\"' where setting_key='current_season'");
  await expect(allocation()).rejects.toMatchObject({ status: 403 });
});

it("returns an honest empty allocation before the department has a configured Finance season", async () => {
  const departmentId = randomUUID();
  await db.query("insert into project_management.departments(id,season,name) values($1::uuid,'S28','Mechanical & Production')", [departmentId]);
  await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,false)", [departmentId, f.lead]);
  await db.query("delete from finance.seasons where id=$1::uuid", [f.nextSeason]);
  await db.query("update finance.settings set setting_value='\"S28\"' where setting_key='current_season'");
  expect(await allocation("lead", departmentId)).toMatchObject({ seasonId: null, seasonCode: "S28", approvedTotalNok: "0.00", legacyTotalNok: "0.00", projects: [] });
});

it("preserves integer precision and does not derive ownership from the physical system", async () => {
  const budget = (await services.projectBudgets("lead", f.project)).budgets[0];
  await services.mutate("lead", { action: "requestProjectBudgetChanges", requestId: randomUUID(), projectBudgetId: budget.id, expectedRevision: budget.revision, reason: "A precise large supplier quote" });
  const candidate = await services.projectBudget("lead", budget.id);
  const entry = candidate.pendingVersion!.entries.find(entry => entry.systemId === f.system)!;
  await services.mutate("lead", { action: "saveProjectBudgetEntry", requestId: randomUUID(), projectBudgetId: candidate.id, expectedRevision: candidate.revision, entry: { ...entry, plannedNok: "90071992547409.93" } });
  const updated = await services.projectBudget("lead", budget.id);
  await services.mutate("lead", { action: "submitProjectBudget", requestId: randomUUID(), projectBudgetId: updated.id, expectedRevision: updated.revision });
  const submitted = await services.projectBudget("lead", updated.id);
  const sent = await submitProjectBudgetDepartmentPackage(services, submitted);
  await approveProjectBudgetDepartmentPackage(services, sent.budget);
  expect(await allocation()).toMatchObject({ approvedTotalNok: "90071992547527.82", projects: [{ approvedTotalNok: "90071992547477.82" }] });
});

it("rejects invalid department IDs and never disguises a missing allocation projection as zero", async () => {
  await expect(loadDepartmentHomeBudget(db, projectBudgetIdentity("lead"), "not-a-department")).rejects.toMatchObject({ status: 400 });
  await db.exec("drop view finance.department_plan_allocation");
  await expect(allocation()).rejects.toMatchObject({ status: 503 });
});
