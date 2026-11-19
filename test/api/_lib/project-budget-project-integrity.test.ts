import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createProjectServices } from "../../../api/_lib/project-management-service.js";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import { applyProjectBudgetMigrations, setupFundingPipelineFixture, projectBudgetFixture as f, projectBudgetIdentity as fixtureIdentity, type ProjectBudgetFixtureRole } from "./project-budget-test-db.js";
const read = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}.sql`, import.meta.url), "utf8");
let db: PGlite, projects: ReturnType<typeof createProjectServices>, finance: ReturnType<typeof createFinanceServices>, departmentId: string;
const identity = (role: ProjectBudgetFixtureRole) => ({ ...fixtureIdentity(role), email: `${role.toLowerCase()}@helixnmbu.no` });
const input = { name: "Frame", description: "Build the frame", category: "production", departments: ["Mechanical & Production"], leadIds: [f.lead], deadline: "2027-06-01" };
beforeAll(async () => {
  db = new PGlite();
  await db.exec('create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());');
  for (const name of ["001_member_cv", "002_member_helix_role", "009_platform_access_and_managed_positions", "009_project_management", "010_department_lead_tasks", "011_task_assignees", "012_project_milestones", "013_project_hierarchy", "014_milestone_field_updates", "015_project_departments", "016_fixed_departments", "017_workspace_directory", "020_project_start_dates", "021_project_creation_milestones", "018_department_homes", "019_department_settings_permissions", "025_workspace_space_access", "026_department_access_levels", "032_estimated_task_history", "033_project_status", "022_task_backlog_status"]) await db.exec(read(name));
  const migrations = new URL("../../../db/migrations/", import.meta.url);
  for (const filename of readdirSync(migrations).filter(name => /^0(1[1-9]|2[01])_finance_.*\.sql$/.test(name)).sort()) await db.exec(readFileSync(new URL(filename, migrations), "utf8"));
  await db.exec(read("024_financials_member_role")); await db.exec(read("065_finance_historical_purchases"));
  await db.exec("create schema partner_deals;create table partner_deals.deals(id uuid primary key);");
  await setupFundingPipelineFixture(db);
  for (const role of ["lead", "departmentLead", "finance", "head", "outsider"] as const) {
    const actor = identity(role);
    await db.query('insert into neon_auth."user" values($1::uuid,$2,$3,true,false)', [actor.userId, role, actor.email]);
    await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2::uuid)', [actor.googleSub, actor.userId]);
    await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1::uuid,$1::uuid,$2,$3,$4)", [actor.userId, actor.googleSub, actor.email, role]);
  }
  await db.query("insert into identity.member_roles values($1::uuid,'project_manager'),($2::uuid,'financials'),($3::uuid,'financials')", [f.lead, f.finance, f.head]);
  await db.query("insert into finance.member_grants(member_id,profile,active,operator_member_id,reason) values($1::uuid,'head_of_finance',true,$2::uuid,'Synthetic grant')", [f.head, f.outsider]);
  await db.query("insert into finance.seasons(id,code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values($1::uuid,'S27','Synthetic season','2026-08-01','2027-07-31','active',$2::uuid,$2::uuid)", [f.season, f.head]);
  const currentSource = read("041_project_current_season");
  for (const name of ["current_season", "mutate", "can_access_project", "can_access_task"]) {
    const source = currentSource.match(new RegExp(`create or replace function project_management\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0];
    if (!source) throw new Error(`Missing actual041 function ${name}`); await db.exec(source);
  }
  departmentId = (await db.query<{ id: string }>("select id from project_management.departments where season='S27' and name='Mechanical & Production'")).rows[0].id;
  await db.query("insert into project_management.department_members(department_id,member_id,is_lead,access_level) values($1::uuid,$2::uuid,true,'lead')", [departmentId, f.departmentLead]);
  await db.query("insert into finance.systems(id,department_key,code,name) select $1::uuid,department_key,'SYS-INTEGRITY','Integrity system' from identity.departments where name='Mechanical & Production'", [f.system]);
  await applyProjectBudgetMigrations(db);
  projects = createProjectServices({ db, authenticate: async () => identity("lead") });
  finance = createFinanceServices({ db, authenticate: async token => identity(token as ProjectBudgetFixtureRole) });
}, 60000);
afterAll(() => db.close());
it("rejects an incompatible real project-service update while retaining readable approved budget and ordinary edits", async () => {
  let workspace = await projects.mutate("lead", { action: "save_project", id: f.project, expectedRevision: 0, project: input });
  const project = workspace.projects.find(project => project.id === f.project)!;
  let result = await finance.mutate("lead", { action: "createProjectBudget", requestId: randomUUID(), projectId: f.project, responsibleDepartmentId: departmentId });
  for (const [role, action, fields] of [["lead", "saveProjectBudgetEntry", { entry: { systemId: f.system, description: "Frame tubes", category: "material", plannedNok: "6000", ordinaryPriority: "P1", reuseStatus: "new", status: "planned" } }], ["lead", "submitProjectBudget", {}], ["departmentLead", "approveDepartmentBudget", {}], ["head", "approveProjectBudget", {}]] as const) result = await finance.mutate(role, { action, requestId: randomUUID(), projectBudgetId: result.id, expectedRevision: result.revision, ...fields });
  const approved = await finance.projectBudget("lead", result.id!);
  await expect(projects.mutate("lead", { action: "save_project", id: f.project, expectedRevision: project.revision, project: { ...input, departments: ["Electronics"] } })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("financial history") });
  expect((await finance.projectBudget("lead", approved.id)).approvedVersionId).toBe(approved.approvedVersionId);
  await expect(db.query("update project_management.projects set season='S28' where id=$1::uuid", [f.project])).rejects.toMatchObject({ code: "23514" });
  workspace = await projects.mutate("lead", { action: "save_project", id: f.project, expectedRevision: project.revision, project: { ...input, name: "Frame updated" } });
  expect(workspace.projects.find(project => project.id === f.project)?.name).toBe("Frame updated");
  expect((await finance.projectBudget("lead", approved.id)).approvedTotalNok).toBe("6000.00");
  const current = workspace.projects.find(project => project.id === f.project)!;
  await projects.mutate("lead", { action: "save_project", id: f.project, expectedRevision: current.revision, project: { ...input, name: "Frame updated", leadIds: [f.finance] } });
  await expect(finance.projectBudget("lead", approved.id)).rejects.toMatchObject({ status: 403 });
  expect((await finance.projectBudget("head", approved.id)).approvedTotalNok).toBe("6000.00");
});
