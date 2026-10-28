import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemberAccessServices } from "../api/_lib/member-access-service.js";
import type { WorkspaceAccessChange, WorkspaceSpace } from "../src/features/Workspace/access.js";
const id = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
const identities = ["admin", "member", "other-admin", "lead"].map((name, i) => ({ userId: id(i + 1), googleSub: name, email: `${name}@helixnmbu.no`, name }));
const service = createMemberAccessServices({ db: { query: (sql, params) => db.query(sql, params) }, authenticate: async token => identities[token === "admin" ? 0 : token === "other-admin" ? 2 : 1] });
async function change(spaceKeys: WorkspaceSpace[] = []): Promise<WorkspaceAccessChange> {
  const member = (await db.query<{ revision: number }>("select directory_revision as revision from identity.members where id=$1", [id(2)])).rows[0];
  const departments = (await db.query<{ id: string; revision: number; member: boolean; lead: boolean }>("select d.id,d.revision,exists(select 1 from project_management.department_members dm where dm.department_id=d.id and dm.member_id=$1) as member,exists(select 1 from project_management.department_members dm where dm.department_id=d.id and dm.member_id=$1 and dm.is_lead) as lead from project_management.departments d order by d.name", [id(2)])).rows;
  return { memberId: id(2), expectedRevision: member.revision, departments, spaceKeys };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec('create schema neon_auth; create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());');
  for (const file of ["001_member_cv", "002_member_helix_role", "009_platform_access_and_managed_positions", "009_project_management", "010_department_lead_tasks", "011_task_assignees", "012_project_milestones", "013_project_hierarchy", "014_milestone_field_updates", "015_project_departments", "016_fixed_departments", "017_workspace_directory", "018_department_homes", "019_department_settings_permissions", "020_project_start_dates", "021_project_creation_milestones", "022_task_backlog_status", "023_project_requires_lead", "025_workspace_space_access", "026_department_access_levels"]) await db.exec(readFileSync(new URL(`../db/migrations/${file}.sql`, import.meta.url), "utf8"));
  for (const person of identities) {
    await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [person.userId,person.name,person.email]);
    await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)', [person.googleSub,person.userId]);
    await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)", [person.userId,person.googleSub,person.email,person.name]);
  }
  await db.query("insert into identity.member_roles(member_id,role_key) values($1,'platform_administrator'),($2,'platform_administrator'),($3,'team_member')", [id(1),id(3),id(2)]);
}, 60000);
afterAll(async () => { await db?.close(); });
describe("department and space access", () => {
  it("grants each space independently and preserves unrelated roles and manager permissions", async () => {
    await db.query("insert into project_management.access(member_id,active,can_manage) values($1,false,true)", [id(2)]);
    for (const space of ["season-overview", "recruiting", "financials"] as const) {
      await service.saveWorkspace("admin", await change([space]));
      const directory = await service.members("admin");
      const member = directory.members.find(m => m.id === id(2))!;
      expect(member.spaceKeys).toEqual([space]);
      expect(member.roleKeys).toContain("team_member");
      expect((await db.query<{ can_manage: boolean }>("select can_manage from project_management.access where member_id=$1", [id(2)])).rows[0].can_manage).toBe(true);
    }
    await service.saveWorkspace("admin", await change([]));
    expect((await service.members("admin")).members.find(m => m.id === id(2))?.spaceKeys).toEqual([]);
    expect((await service.self("member")).features).not.toContain("recruitment.manage");
  });
  it("saves department membership and Lead assignments without granting spaces", async () => {
    const input = await change([]);
    input.departments[0] = { ...input.departments[0], member: true, lead: true };
    await service.saveWorkspace("other-admin", input);
    expect((await db.query("select * from project_management.department_members where member_id=$1", [id(2)])).rows).toHaveLength(1);
    expect((await service.members("admin")).members.find(m => m.id === id(2))?.spaceKeys).toEqual([]);
    await expect(service.saveWorkspace("admin", input)).rejects.toMatchObject({ status: 409 });
  });
  it("denies members, self changes, malformed spaces, and spoofed identities", async () => {
    const input = await change();
    await expect(service.saveWorkspace("member", input)).rejects.toMatchObject({ status: 403 });
    await expect(service.saveWorkspace("admin", { ...input, memberId: id(1) })).rejects.toMatchObject({ status: 403 });
    for (const spaces of [["bad"], ["financials", "financials"], null]) await expect(service.saveWorkspace("admin", { ...input, spaceKeys: spaces })).rejects.toMatchObject({ status: 400 });
    await expect(db.query("select identity.save_workspace_access($1,'wrong',$2,$3::jsonb)", [id(1), identities[0].email, JSON.stringify(input)])).rejects.toThrow(/forbidden/);
  });
  it("rolls back department and space updates when a Lead is occupied", async () => {
    const input = await change(["financials"]);
    const department = input.departments.find(d => !d.member)!;
    await db.query("insert into project_management.department_members(department_id,member_id,is_lead) values($1,$2,true)", [department.id,id(4)]);
    input.departments = input.departments.map(d => ({ ...d, member: true, lead: d.id === department.id }));
    await expect(service.saveWorkspace("admin", input)).rejects.toMatchObject({ status: 409 });
    expect((await service.members("admin")).members.find(m => m.id === id(2))?.spaceKeys).toEqual([]);
    expect((await db.query("select * from project_management.department_members where member_id=$1", [id(2)])).rows).toHaveLength(1);
  });
});
