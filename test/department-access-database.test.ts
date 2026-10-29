import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectServices } from "../api/_lib/project-management-service.js";
import { createDepartmentHomeServices } from "../api/_lib/department-home-service.js";
import { createWorkspaceServices } from "../api/_lib/workspace-service.js";
import { createMemberAccessServices } from "../api/_lib/member-access-service.js";
import type { TaskInput } from "../src/features/ProjectManagement/types.js";
const id = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = ["lead", "member", "viewer", "manager", "admin", "outsider", "other-lead"];
const people = names.map((name, i) => ({ userId: id(i+1), name, email: name === "admin" ? "henrik.engdal@helixnmbu.no" : `${name}@helixnmbu.no`, googleSub: name }));
let db: PGlite;
const authenticate = async (token: string) => people.find(person => person.name === token)!;
const deps = { db: { query: <T>(sql: string, params?: unknown[]) => db.query<T>(sql, params) }, authenticate };
const projects = createProjectServices(deps);
const homes = createDepartmentHomeServices(deps);
const directory = createWorkspaceServices(deps);
const access = createMemberAccessServices(deps);
const project = { name: "Department project", description: "", category: "production" as const, departments: ["Mechanical & Production"], leadIds: [id(1)], deadline: null };
const task: TaskInput = { title: "Task", description: "", category: "production", projectId: id(100), milestoneId: id(101), assigneeIds: [id(2)], status: "todo", blockedReason: "", priority: "normal", deadline: null, startDate: null, kind: "task", partnerName: "" };
let departmentId: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('create schema neon_auth; create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());');
  for (const file of ["001_member_cv", "002_member_helix_role", "009_platform_access_and_managed_positions", "009_project_management", "010_department_lead_tasks", "011_task_assignees", "012_project_milestones", "013_project_hierarchy", "014_milestone_field_updates", "015_project_departments", "016_fixed_departments", "017_workspace_directory", "018_department_homes", "019_department_settings_permissions", "020_project_start_dates", "021_project_creation_milestones", "022_task_backlog_status", "023_project_requires_lead", "025_workspace_space_access"]) {
    await db.exec(readFileSync(new URL(`../db/migrations/${file}.sql`, import.meta.url), "utf8"));
  }
  for (const person of people) {
    await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [person.userId, person.name, person.email]);
    await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)', [person.googleSub, person.userId]);
    await db.query('insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)', [person.userId,person.googleSub,person.email,person.name]);
  }
  await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager'),($2,'platform_administrator')", [id(4),id(5)]);
  departmentId = (await db.query<{id: string}>("select id from project_management.departments where name='Mechanical & Production'")).rows[0].id;
  await db.query("insert into project_management.department_members(department_id,member_id,is_lead) values($1,$2,true),($1,$3,false)", [departmentId,id(1),id(2)]);
  await db.exec(readFileSync(new URL("../db/migrations/026_department_access_levels.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../db/migrations/028_member_preferences.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../db/migrations/032_estimated_task_history.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../db/migrations/033_project_status.sql", import.meta.url), "utf8"));
    await db.exec("create schema finance; create table finance.settings(setting_key text,setting_value jsonb);");
    await db.exec(readFileSync(new URL("../db/migrations/041_project_current_season.sql", import.meta.url), "utf8"));
  await db.query("insert into project_management.department_members(department_id,member_id,access_level) values($1,$2,'viewer')", [departmentId,id(3)]);
  await db.query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where name='Electronics'", [id(7)]);
}, 60000);
afterAll(async () => { await db?.close(); });
describe("department access authorization", () => {
  it("stores space order separately for each verified member and rejects invalid orders", async () => {
    expect((await directory.mutate("lead", { action: "save_space_order", order: ["/season-overview", "/departments/electronics"] })).spaceOrder).toEqual(["/season-overview", "/departments/electronics"]);
    expect((await directory.load("member")).spaceOrder).toEqual([]);
    await directory.mutate("member", { action: "save_space_order", order: ["/recruiting"] });
    expect((await directory.load("lead")).spaceOrder).toEqual(["/season-overview", "/departments/electronics"]);
    await expect(directory.mutate("lead", { action: "save_space_order", order: ["/tasks", "/tasks"] })).rejects.toMatchObject({ status: 400 });
    await expect(directory.mutate("lead", { action: "save_space_order", order: ["https://example.com"] })).rejects.toMatchObject({ status: 400 });
  });
  it("lets a department Lead create a project, milestones and assigned tasks without space or category grants", async () => {
    await projects.mutate("lead", {action: "save_project", id: id(100), expectedRevision: 0, project, milestones: [{ id: id(101), title: "Milestone", description: "", deadline: "2027-05-01", partnerName: "" }] });
    const result = await projects.mutate("lead", {action: "save_task", id: id(102), expectedRevision: 0, task });
    expect(result.tasks).toHaveLength(2);
    expect((await directory.load("member")).projectAccess).toBe(true);
    expect((await homes.save("lead", {action: "save_department_home", departmentId, expectedRevision: 0, description: "Department description", driveFolderUrl: null})).description).toBe("Department description");
  });
  it("lets Members change only assigned task status and blocked reason", async () => {
    const result = await projects.mutate("member", {action: "set_status", id: id(102), expectedRevision: 1, status: "blocked", blockedReason: "Waiting" });
    expect(result.tasks.find(t => t.id === id(102))?.blockedReason).toBe("Waiting");
    for (const change of [
      {action: "save_task", id: id(102), expectedRevision: 2, task: {...task,title: "Changed"}},
      {action: "delete_task", id: id(102), expectedRevision: 2},
      {action: "save_project", id: id(100), expectedRevision: 1, project},
      {action: "set_status", id: id(101), expectedRevision: 1, status: "done", blockedReason: ""},
    ]) await expect(projects.mutate("member", change)).rejects.toMatchObject({status:403});
    await expect(homes.save("member", {action: "save_department_home", departmentId, expectedRevision: 1, description: "No", driveFolderUrl:null})).rejects.toMatchObject({status:403});
  });
  it("keeps a Viewer read-only even if assigned a task or carrying a legacy category grant", async () => {
    await db.query("insert into project_management.task_assignees(task_id,member_id) values($1,$2)",[id(102),id(3)]);
    await db.query("insert into project_management.access(member_id,can_manage,task_lead_categories) values($1,true,array['production'])",[id(3)]);
    expect((await projects.load("viewer")).tasks).toHaveLength(2);
    for (const action of ["set_status","delete_task","save_task"]) await expect(projects.mutate("viewer", {action,id:id(102),expectedRevision:2,status:"done",blockedReason:"",task})).rejects.toMatchObject({status:403});
    expect((await homes.load("viewer", departmentId)).canEdit).toBe(false);
  });
  it("prevents cross-department Lead edits and unassigned Member status changes", async () => {
    expect((await projects.load("other-lead")).tasks).toEqual([]);
    await expect(projects.mutate("other-lead", {action:"set_status",id:id(102),expectedRevision:2,status:"done",blockedReason:""})).rejects.toMatchObject({status:403});
    await expect(projects.load("outsider")).rejects.toMatchObject({status:403});
    await projects.mutate("lead", {action:"save_task",id:id(103),expectedRevision:0,task:{...task,assigneeIds:[]}});
    await expect(projects.mutate("member", {action:"set_status",id:id(103),expectedRevision:1,status:"done",blockedReason:""})).rejects.toMatchObject({status:403});
  });
  it("stores Managers and Administrators as Viewers but gives full management access", async () => {
    for (const person of ["manager","admin"]) {
      const memberId=people.find(p=>p.name===person)!.userId;
      const memberships=(await db.query<{access_level:string;is_lead:boolean}>("select access_level,is_lead from project_management.department_members where member_id=$1",[memberId])).rows;
      expect(memberships).toHaveLength(7);
      expect(memberships.every(m=>m.access_level==='viewer' && !m.is_lead)).toBe(true);
      expect((await projects.load(person)).canManage).toBe(true);
      expect((await homes.load(person,departmentId)).canEdit).toBe(true);
      const current=(await projects.load(person)).tasks.find(t=>t.id===id(102))!;
      await projects.mutate(person,{action:"save_task",id:current.id,expectedRevision:current.revision,task:{...task,title:person}});
    }
  });
  it("persists Member to Viewer changes, keeps them on detail saves, and rejects stale revisions", async () => {
    const workspace=await directory.load("admin");
    const member=workspace.members.find(m=>m.id===id(2))!;
    const choices=workspace.departments.map(d=>({id:d.id,revision:d.revision,member:d.id===departmentId,lead:false,access:d.id===departmentId?"viewer" as const:null}));
    const change={memberId:member.id,expectedRevision:member.revision,departments:choices,spaceKeys:[]};
    await access.saveWorkspace("admin",change);
    await expect(access.saveWorkspace("admin",change)).rejects.toMatchObject({status:409});
    const fresh=await directory.load("admin");
    const details = {action:"save_member",id:member.id,expectedRevision:fresh.members.find(m=>m.id===member.id)!.revision,name:"Updated member",helixRole:null,departments:fresh.departments.map(d=>({id:d.id,revision:d.revision,member:d.memberIds.includes(member.id),lead:d.leadId===member.id}))};
    await directory.mutate("admin",details);
    expect(fresh.departments.find(d=>d.id===departmentId)?.viewerIds).toContain(member.id);
    await expect(projects.mutate("member",{action:"set_status",id:id(102),expectedRevision:4,status:"done",blockedReason:""})).rejects.toMatchObject({status:403});
  });
  it("applies and revokes role overrides immediately while keeping Viewer membership", async () => {
    await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager')",[id(6)]);
    expect((await projects.load("outsider")).canManage).toBe(true);
    expect((await directory.load("outsider")).departments.filter(d=>d.viewerIds?.includes(id(6)))).toHaveLength(7);
    await db.query("delete from identity.member_roles where member_id=$1 and role_key='project_manager'",[id(6)]);
    expect((await projects.load("outsider")).canManage).toBe(false);
    await expect(projects.mutate("outsider",{action:"delete_task",id:id(102),expectedRevision:4})).rejects.toMatchObject({status:403});
  });
  it("allows deletion of projects and descendants only for Leads and role overrides", async () => {
    await expect(projects.mutate("viewer",{action:"delete_project",id:id(100),expectedRevision:1})).rejects.toMatchObject({status:403});
    await expect(projects.mutate("lead",{action:"delete_project",id:id(100),expectedRevision:99})).rejects.toMatchObject({status:409});
    const result=await projects.mutate("manager",{action:"delete_project",id:id(100),expectedRevision:1});
    expect(result.tasks).toEqual([]);
    expect(result.projects).toEqual([]);
  });
});
