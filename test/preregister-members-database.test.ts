import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCvServices } from "../api/_lib/member-cv-service.js";
import { createWorkspaceServices } from "../api/_lib/workspace-service.js";

const files = ["001_member_cv", "002_member_helix_role", "003_admin_managed_member_names", "009_platform_access_and_managed_positions", "009_project_management", "010_department_lead_tasks", "011_task_assignees", "012_project_milestones", "013_project_hierarchy", "014_milestone_field_updates", "015_project_departments", "016_fixed_departments", "017_workspace_directory", "018_department_homes", "019_department_settings_permissions", "020_project_start_dates", "021_project_creation_milestones", "022_task_backlog_status", "023_project_requires_lead", "025_workspace_space_access", "026_department_access_levels", "027_admin_self_access", "028_member_preferences", "029_pending_members_multiple_leads"];
let db: PGlite;
const authId = "10000000-0000-4000-8000-000000000001";
const email = "jordan.kim@helixnmbu.no";
let pendingId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create schema neon_auth; create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean); create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"idToken" text,"createdAt" timestamptz default now());');
  for (const file of files) await db.exec(readFileSync(new URL(`../db/migrations/${file}.sql`, import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../db/migrations/011_finance_core.sql", import.meta.url), "utf8"));
  const operator = "10000000-0000-4000-8000-000000000003";
  await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [operator,"Test Operator","operator@helixnmbu.no"]);
  await db.query(`insert into neon_auth.account("accountId","providerId","userId") values('operator-sub','google',$1)`, [operator]);
  await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,'operator-sub','operator@helixnmbu.no','Test Operator')", [operator]);
  await db.query("insert into identity.member_roles(member_id,role_key) values($1,'platform_administrator')", [operator]);
  await db.exec(readFileSync(new URL("./fixtures/preregister-members.sql", import.meta.url), "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });

describe("pre-registered members", () => {
  it("creates eight pending profiles and both Business & Marketing Leads", async () => {
    const rows = (await db.query<{ id: string; email: string; auth_user_id: string | null }>("select id,email,auth_user_id from identity.members where email<>'operator@helixnmbu.no' order by email")).rows;
    expect(rows).toHaveLength(8);
    expect(rows.every(row => row.auth_user_id === null)).toBe(true);
    pendingId = rows.find(row => row.email === email)!.id;
    const leads = (await db.query<{ email: string }>("select m.email from project_management.department_members dm join project_management.departments d on d.id=dm.department_id join identity.members m on m.id=dm.member_id where d.name='Business & Marketing' and dm.is_lead order by m.email")).rows.map(row => row.email);
    expect(leads).toEqual([email, "taylor.blake@helixnmbu.no"]);
    expect((await db.query("select * from project_management.access where active")).rows).toHaveLength(2);
    expect((await db.query<{ email: string }>("select m.email from finance.member_grants g join identity.members m on m.id=g.member_id where g.active and g.profile='head_of_finance'")).rows).toEqual([{ email: "casey.parker@helixnmbu.no" }]);
    expect((await db.query<{ email: string }>("select m.email from identity.member_roles r join identity.members m on m.id=r.member_id where r.role_key='financials'")).rows).toEqual([{ email: "casey.parker@helixnmbu.no" }]);
  });
  it("links the pending profile only after a verified Workspace login", async () => {
    await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [authId, "Google Name", email]);
    await db.query('insert into neon_auth.account("accountId","providerId","userId","idToken") values($1,\'google\',$2,\'token\')', ["google-jordan",authId]);
    const services = createCvServices({ db, storage: { putPdf: async () => undefined, remove: async () => undefined, presign: async () => "unused" }, verifySession: async () => ({ userId: authId }), verifyGoogle: async () => ({ email, emailVerified: true, hd: "helixnmbu.no", googleSub: "google-jordan" }) });
    const identity = await services.authenticate("token");
    expect(identity).toMatchObject({ userId: pendingId, name: "Jordan Kim", helixRole: "Head of Business" });
    expect((await db.query("select auth_user_id,google_sub from identity.members where id=$1", [pendingId])).rows[0]).toEqual({ auth_user_id: authId, google_sub: "google-jordan" });
    const workspace = createWorkspaceServices({ db, authenticate: async () => identity });
    const snapshot = await workspace.load("token");
    expect(snapshot.departments.find(d => d.name === "Business & Marketing")?.leadIds).toHaveLength(2);
    expect(snapshot.members.some(m => m.name === "Taylor Blake")).toBe(true);
  });
  it("preserves both Leads when a manager edits a department", async () => {
    const managerId = "10000000-0000-4000-8000-000000000002";
    await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [managerId,"Manager","manager@helixnmbu.no"]);
    await db.query(`insert into neon_auth.account("accountId","providerId","userId") values('manager-sub','google',$1)`, [managerId]);
    await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,'manager-sub','manager@helixnmbu.no','Manager')", [managerId]);
    await db.query("insert into identity.member_roles(member_id,role_key) values($1,'project_manager')", [managerId]);
    const department = (await db.query<{ id: string; revision: number }>("select id,revision from project_management.departments where name='Business & Marketing'")).rows[0];
    const members = (await db.query<{ member_id: string; is_lead: boolean }>("select member_id,is_lead from project_management.department_members where department_id=$1", [department.id])).rows;
    const leadIds = members.filter(m => m.is_lead).map(m => m.member_id);
    const change = { action: "save_department", id: department.id, expectedRevision: department.revision, department: { name: "Business & Marketing", memberIds: members.map(m => m.member_id), leadId: leadIds[0], leadIds } };
    await db.query("select project_management.save_department($1,'manager-sub','manager@helixnmbu.no',$2::jsonb)", [managerId, JSON.stringify(change)]);
    expect((await db.query("select * from project_management.department_members where department_id=$1 and is_lead", [department.id])).rows).toHaveLength(2);
    for (const lead of leadIds) expect((await db.query<{ allowed: boolean }>("select project_management.can_access_project($1,array['Business & Marketing'],true) as allowed", [lead])).rows[0].allowed).toBe(true);
  });
  it("rejects a fabricated identity and prevents partially linked profiles", async () => {
    await expect(db.query("select identity.onboard_member($1,'wrong',$2,'Fake','{}','{}')", [authId,email])).rejects.toThrow("Identity mismatch");
    await expect(db.query("update identity.members set google_sub='fake' where auth_user_id is null and email='taylor.blake@helixnmbu.no' ")).rejects.toThrow();
  });
});
