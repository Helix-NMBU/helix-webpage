import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createFinanceServices } from "../../../api/_lib/finance-service.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";
import { applyProjectBudgetMigrations, approveProjectBudgetDepartmentPackage, projectBudgetFixture as f, projectBudgetIdentity, seedProjectBudgetLegacy, setupProjectBudgetBase, submitProjectBudgetDepartmentPackage, type ProjectBudgetFixtureRole, type ProjectBudgetTestDatabase } from "./project-budget-test-db.js";
export const member = { userId: "81111111-1111-4111-8111-111111111111", googleSub: "ordinary-member-google", email: "ordinary@example.test", name: "Ordinary member" };
export const taskId = "82222222-2222-4222-8222-222222222222";
export async function setupMemberReadFixture(db: ProjectBudgetTestDatabase) {
  await setupProjectBudgetBase(db); await seedProjectBudgetLegacy(db); await applyProjectBudgetMigrations(db);
  await db.exec(`alter table project_management.department_members add column access_level text not null default 'member';
    update project_management.department_members set access_level='lead' where is_lead;
    create table project_management.access(member_id uuid primary key references identity.members(id),active boolean not null);
    create table project_management.tasks(id uuid primary key,project_id uuid references project_management.projects(id),season text not null,kind text not null);
    create table project_management.task_assignees(task_id uuid references project_management.tasks(id),member_id uuid references identity.members(id),primary key(task_id,member_id));`);
  const definition = readFileSync(new URL("../../../db/migrations/041_project_current_season.sql", import.meta.url), "utf8").match(/create or replace function project_management\.current_season\([\s\S]*?\$\$;/)![0];
  await db.exec(definition);
  await db.query('insert into neon_auth."user" values($1::uuid,$2,true,false)', [member.userId, member.email]);
  await db.query("insert into neon_auth.account values($1::uuid,$1::uuid,'google',$2)", [member.userId, member.googleSub]);
  await db.query("insert into identity.members values($1::uuid,$1::uuid,$2,$3,$4)", [member.userId, member.googleSub, member.email, member.name]);
  await db.query("insert into project_management.access values($1::uuid,true)", [member.userId]);
  await db.query("insert into project_management.department_members values($1::uuid,$2::uuid,false,'member')", [f.department, member.userId]);
  await db.query("insert into project_management.tasks values($1::uuid,$2::uuid,'S27','task')", [taskId, f.project]);
  await db.query("insert into project_management.task_assignees values($1::uuid,$2::uuid)", [taskId, member.userId]);
  return createFinanceServices({ db, authenticate: async role => role === "member" ? member : projectBudgetIdentity(role as ProjectBudgetFixtureRole) });
}
export type MemberServices = Awaited<ReturnType<typeof setupMemberReadFixture>>;
export const mutateMemberFixture = (services: MemberServices, role: string, body: Record<string, unknown>) => services.mutate(role, { requestId: randomUUID(), ...body });
export async function changeMemberFixtureBudget(services: MemberServices, budget: ProjectBudgetDetail, action: string, fields: Record<string, unknown> = {}) {
  await mutateMemberFixture(services, "lead", { action, projectBudgetId: budget.id, expectedRevision: budget.revision, ...fields });
  return services.projectBudget("lead", budget.id);
}
export async function initialMemberFixtureBudget(services: MemberServices, approved = true) {
  const result = await mutateMemberFixture(services, "lead", { action: "createProjectBudget", projectId: f.project, responsibleDepartmentId: f.department });
  let budget = await services.projectBudget("lead", result.id!);
  budget = await changeMemberFixtureBudget(services, budget, "adoptProjectBudgetEntries", { entries: [{ budgetItemId: f.entry }] });
  budget = await changeMemberFixtureBudget(services, budget, "saveProjectBudgetEntry", { entry: { ...budget.pendingVersion!.entries[0], plannedNok: "1000", note: "Private approved author note", ownerEmail: "private-owner@example.test" } });
  if (approved) {
    budget = await changeMemberFixtureBudget(services, budget, "submitProjectBudget");
    await submitProjectBudgetDepartmentPackage(services, budget); budget = await approveProjectBudgetDepartmentPackage(services, budget);
  }
  return budget;
}
