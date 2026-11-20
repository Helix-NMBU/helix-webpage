import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { loadDepartmentHomeBudget } from "../../../api/_lib/finance-department-home.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { projectBudgetFixture as f, projectBudgetIdentity, setupProjectBudgetBase, seedProjectBudgetLegacy, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";

let pg: PGlite, db: ProjectBudgetTestDatabase;
const allocation = async (role: ProjectBudgetFixtureRole = "lead", departmentId: string = f.department) => loadDepartmentHomeBudget(db, projectBudgetIdentity(role), departmentId);
const migrations = new URL("../../../db/migrations/", import.meta.url);

beforeAll(async () => {
  pg = new PGlite();
  db = { exec: sql => pg.exec(sql), query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
  await setupProjectBudgetBase(db);
  await seedProjectBudgetLegacy(db);
  // This suite verifies the safe reader against fixed allocation facts. The real
  // 074 allocation view and package lifecycle have their own integration tests.
  for (const name of readdirSync(migrations).filter(name => /^0(6[6-9]|7[0-3])_.*\.sql$/.test(name)).sort()) {
    await pg.exec(readFileSync(new URL(name, migrations), "utf8"));
  }
  const currentSeason = readFileSync(new URL("041_project_current_season.sql", migrations), "utf8")
    .match(/create or replace function project_management\.current_season\([\s\S]*?\$\$;/)?.[0];
  if (!currentSeason) throw new Error("Missing real current-season function");
  await pg.exec(currentSeason);
  await db.query("insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Test current season',$1::uuid)", [f.head]);
  await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,false)", [f.department, f.lead]);
  const services = createFinanceServices({ db, authenticate: async role => projectBudgetIdentity(role as ProjectBudgetFixtureRole) });
  for (const [projectId, departmentId, systemId] of [[f.project, f.department, f.system], [f.electronicProject, f.electronicDepartment, f.electronicSystem]]) {
    const created = await services.mutate("lead", { action: "createProjectBudget", requestId: randomUUID(), projectId, responsibleDepartmentId: departmentId });
    let budget = await services.projectBudget("lead", created.id!);
    const action = async (role: ProjectBudgetFixtureRole, name: string, fields = {}) => {
      await services.mutate(role, { action: name, requestId: randomUUID(), projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields });
      budget = await services.projectBudget("lead", budget.id);
    };
    await action("lead", "saveProjectBudgetEntry", { entry: { systemId, description: "Private item details", category: "material", plannedNok: "200.00", ordinaryPriority: "P1", reuseStatus: "new", status: "planned", note: "PRIVATE DRAFT NOTE" } });
    await action("lead", "submitProjectBudget");
    await action(departmentId === f.department ? "departmentLead" : "otherDepartmentLead", "approveDepartmentBudget");
    await action("head", "approveProjectBudget");
  }
  await pg.exec(`create table finance.department_plan_allocation (
    entry_id uuid primary key,season_id uuid not null,system_id uuid not null,department_key text not null,
    project_id uuid,planned_ore bigint not null,legacy boolean not null
  )`);
  for (const [system, department, project, amount, legacy] of [
    [f.system, "mechanical-production", f.project, "12345", false],
    [f.electronicSystem, "mechanical-production", f.project, "6789", false],
    [f.system, "mechanical-production", null, "5000", true],
    [f.electronicSystem, "electrical", f.electronicProject, "30000", false],
  ] as const) {
    await db.query("insert into finance.department_plan_allocation values($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::bigint,$7)", [randomUUID(), f.season, system, department, project, amount, legacy]);
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
  const summary = await allocation();
  expect(Object.keys(summary).sort()).toEqual(["approvedTotalNok", "departmentId", "departmentName", "legacyTotalNok", "projects", "seasonCode", "seasonId", "viewVersion"].sort());
  expect(Object.keys(summary.projects[0]).sort()).toEqual(["projectId", "projectName", "approvedTotalNok"].sort());
  for (const privateValue of ["Private item details", "PRIVATE DRAFT NOTE", "invoice", "earmark", "funding", "approvedVersion", "pendingVersion", "ownerEmail"]) expect(JSON.stringify(summary)).not.toContain(privateValue);
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
  await db.query("update finance.department_plan_allocation set planned_ore=9007199254740993 where project_id=$1::uuid and system_id=$2::uuid", [f.project, f.system]);
  expect(await allocation()).toMatchObject({ approvedTotalNok: "90071992547527.82", projects: [{ approvedTotalNok: "90071992547477.82" }] });
});

it("rejects invalid department IDs and never disguises a missing allocation projection as zero", async () => {
  await expect(loadDepartmentHomeBudget(db, projectBudgetIdentity("lead"), "not-a-department")).rejects.toMatchObject({ status: 400 });
  await db.exec("drop table finance.department_plan_allocation");
  await expect(allocation()).rejects.toMatchObject({ status: 503 });
});
