import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectServices } from "../api/_lib/project-management-service.js";
import type { WorkspaceIdentity } from "../api/_lib/member-cv-service.js";
import type { TaskInput } from "../src/features/ProjectManagement/types.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const manager: WorkspaceIdentity = { userId: id(1), googleSub: "google-manager", email: "manager@helixnmbu.no", name: "Manager" };
const member: WorkspaceIdentity = { userId: id(2), googleSub: "google-member", email: "member@helixnmbu.no", name: "Member" };
const outsider: WorkspaceIdentity = { userId: id(3), googleSub: "google-outsider", email: "outsider@helixnmbu.no", name: "Outsider" };
let db: PGlite;
const service = (identity = manager) => createProjectServices({ db, authenticate: async () => identity });
const task = (overrides: Partial<TaskInput> = {}): TaskInput => ({ title: "Manufacture brackets", description: "Cut and inspect", category: "production", projectId: null,
  assigneeId: member.userId, deadline: "2026-12-01", startDate: "2026-11-01", status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "", ...overrides });
const save = (taskId: number, input = task(), revision = 0, identity = manager) => service(identity).mutate("verified", { action: "save_task", id: id(taskId), expectedRevision: revision, task: input });

describe("project management database and authorization", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, name text, email text, "emailVerified" boolean, banned boolean);
      create table neon_auth.account (id uuid primary key default gen_random_uuid(), "accountId" text, "providerId" text, "userId" uuid references neon_auth."user"(id), "idToken" text, "createdAt" timestamptz default now());`);
    await db.exec(readFileSync(new URL("../db/migrations/001_member_cv.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/009_project_management.sql", import.meta.url), "utf8"));
    // Reapplying an additive migration must preserve existing records.
    await db.exec(readFileSync(new URL("../db/migrations/009_project_management.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/010_department_lead_tasks.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/010_department_lead_tasks.sql", import.meta.url), "utf8"));
    for (const identity of [manager, member, outsider]) {
      await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [identity.userId, identity.name, identity.email]);
      await db.query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)', [identity.googleSub, identity.userId]);
      await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$4)", [identity.userId, identity.googleSub, identity.email, identity.name]);
    }
    await db.query("insert into project_management.access values($1,true,true),($2,true,false)", [manager.userId, member.userId]);
    await db.query("update project_management.access set task_lead_categories=array['production','partnership-deliverables','marketing','operations'] where member_id=$1", [manager.userId]);
  });
  afterAll(async () => { await db?.close(); });

  it("does not infer module grants from member sign-in and exposes only eligible member names", async () => {
    await expect(service(outsider).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(save(10, task(), 0, outsider)).rejects.toMatchObject({ status: 403 });
    const workspace = await service().load("verified");
    expect(workspace).toMatchObject({ season: "S27", viewerId: manager.userId, canManage: true, taskLeadCategories: ["production", "partnership-deliverables", "marketing", "operations"], projects: [], tasks: [] });
    expect(workspace.members).toEqual([{ id: manager.userId, name: "Manager" }, { id: member.userId, name: "Member" }]);
    expect(JSON.stringify(workspace)).not.toContain("@helixnmbu.no");
  });
  it("persists department-spanning subprojects and complete tasks in the shared season", async () => {
    await service().mutate("verified", { action: "save_project", id: id(20), expectedRevision: 0,
      project: { name: "Suspension", description: "Build and test", category: "production", departments: ["Mechanical", "Electrical"], deadline: "2026-12-10" } });
    const workspace = await save(10, task({ projectId: id(20) }));
    expect(workspace.projects[0]).toMatchObject({ id: id(20), departments: ["Mechanical", "Electrical"], deadline: "2026-12-10", revision: 1 });
    expect(workspace.tasks[0]).toMatchObject({ id: id(10), projectId: id(20), title: "Manufacture brackets", assigneeId: member.userId, revision: 1, completedAt: null });
  });
  it("rejects duplicate creates and stale edits without overwriting saved work", async () => {
    await expect(save(10)).rejects.toMatchObject({ status: 409 });
    await save(10, task({ title: "Inspect brackets", projectId: id(20) }), 1);
    await expect(save(10, task({ title: "Stale replacement" }), 1)).rejects.toMatchObject({ status: 409 });
    expect((await service().load("verified")).tasks.find(t => t.id === id(10))).toMatchObject({ title: "Inspect brackets", revision: 2 });
  });
  it("lets an assignee update status but prevents edits and updates to another member's task", async () => {
    await save(11, task({ assigneeId: manager.userId }));
    await expect(save(12, task(), 0, member)).rejects.toMatchObject({ status: 403 });
    await expect(save(10, task(), 2, member)).rejects.toMatchObject({ status: 403 });
    await expect(service(member).mutate("verified", { action: "set_status", id: id(11), expectedRevision: 1, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
    let workspace = await service(member).mutate("verified", { action: "set_status", id: id(10), expectedRevision: 2, status: "done", blockedReason: "" });
    const completedAt = workspace.tasks.find(t => t.id === id(10))!.completedAt;
    expect(completedAt).toBeTruthy();
    expect(workspace.canManage).toBe(false);
    workspace = await service(member).mutate("verified", { action: "set_status", id: id(10), expectedRevision: 3, status: "done", blockedReason: "" });
    expect(workspace.tasks.find(t => t.id === id(10))!.completedAt).toBe(completedAt);
    workspace = await service(member).mutate("verified", { action: "set_status", id: id(10), expectedRevision: 4, status: "in_progress", blockedReason: "" });
    expect(workspace.tasks.find(t => t.id === id(10))!.completedAt).toBeNull();
    await expect(service(member).mutate("verified", { action: "set_status", id: id(10), expectedRevision: 4, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 409 });
  });
  it("rechecks revoked grants and identity bindings on every read and write", async () => {
    await db.query("update project_management.access set active=false where member_id=$1", [member.userId]);
    await expect(service(member).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(service(member).mutate("verified", { action: "set_status", id: id(10), expectedRevision: 5, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
    await expect(save(12)).rejects.toMatchObject({ status: 400 });
    expect((await service().load("verified")).members).toEqual([{ id: manager.userId, name: "Manager" }]);
    await db.query("update project_management.access set active=true where member_id=$1", [member.userId]);
    await expect(service({ ...manager, googleSub: "switched-google" }).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(save(12, task(), 0, { ...manager, email: "another@helixnmbu.no" })).rejects.toMatchObject({ status: 403 });
  });
  it("enforces same-category project references and preserves the category of a populated project", async () => {
    await expect(save(12, task({ category: "marketing", projectId: id(20) }))).rejects.toMatchObject({ status: 400 });
    await expect(service().mutate("verified", { action: "save_project", id: id(20), expectedRevision: 1,
      project: { name: "Suspension", description: "", category: "operations", departments: [], deadline: null } })).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ projectId: id(999) }))).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ assigneeId: outsider.userId }))).rejects.toMatchObject({ status: 400 });
  });
  it("excludes banned or unlinked users from assignment and rejects stale authentication", async () => {
    await db.query('update neon_auth."user" set banned=true where id=$1', [member.userId]);
    await expect(service(member).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(save(13)).rejects.toMatchObject({ status: 400 });
    expect((await service().load("verified")).members).toEqual([{ id: manager.userId, name: "Manager" }]);
    await db.query('update neon_auth."user" set banned=false where id=$1', [member.userId]);
    await db.query('update neon_auth.account set "accountId"=\'changed-google\' where "userId"=$1', [member.userId]);
    await expect(service(member).mutate("verified", { action: "set_status", id: id(10), expectedRevision: 5, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
    await db.query('update neon_auth.account set "accountId"=$1 where "userId"=$2', [member.googleSub, member.userId]);
  });
  it("requires dates on milestones, partner names on deliverables, and reasons on blocked tasks", async () => {
    await expect(save(12, task({ kind: "milestone", deadline: null }))).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ category: "partnership-deliverables" }))).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ status: "blocked" }))).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ deadline: "2026-02-31", startDate: null }))).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ startDate: "2027-01-01" }))).rejects.toMatchObject({ status: 400 });
    const workspace = await save(12, task({ category: "partnership-deliverables", partnerName: "Sponsor A", kind: "milestone", status: "blocked", blockedReason: "Awaiting artwork" }));
    expect(workspace.tasks.find(t => t.id === id(12))).toMatchObject({ partnerName: "Sponsor A", kind: "milestone", blockedReason: "Awaiting artwork" });
    await expect(service().mutate("verified", { action: "set_status", id: id(12), expectedRevision: 1, status: "blocked", blockedReason: "" })).rejects.toMatchObject({ status: 400 });
  });
  it("keeps missing records separate from revision conflicts and revokes public access", async () => {
    await expect(save(999, task(), 1)).rejects.toMatchObject({ status: 404 });
    await expect(service().mutate("verified", { action: "set_status", id: id(999), expectedRevision: 1, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 404 });
    expect((await db.query("select has_function_privilege('public','project_management.mutate(uuid,text,text,jsonb)','EXECUTE') as allowed")).rows[0]).toEqual({ allowed: false });
    expect((await db.query("select relrowsecurity from pg_class where oid='project_management.tasks'::regclass")).rows[0]).toEqual({ relrowsecurity: true });
  });
  it("requires a current Department Lead grant for the task area, independently of project management access", async () => {
    await db.query("insert into project_management.access(member_id,active,can_manage) values($1,true,true)", [outsider.userId]);
    expect(await service(outsider).load("verified")).toMatchObject({ canManage: true, taskLeadCategories: [] });
    await expect(save(90, task(), 0, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(save(10, task({ assigneeId: outsider.userId }), 5, outsider)).rejects.toMatchObject({ status: 403 });
    await db.query("update project_management.access set can_manage=false,task_lead_categories=array['production'] where member_id=$1", [outsider.userId]);
    await expect(save(12, task({ category: "production" }), 1, outsider)).rejects.toMatchObject({ status: 403 });
    await save(90, task({ assigneeId: outsider.userId }), 0, outsider);
    await expect(save(91, task({ category: 'marketing' }), 0, outsider)).rejects.toMatchObject({ status: 403 });
    const workspace = await save(90, task({ assigneeId: member.userId }), 1, outsider);
    expect(workspace.tasks.find(item => item.id === id(90))?.assigneeId).toBe(member.userId);
    await db.query("update project_management.access set task_lead_categories='{}' where member_id=$1", [outsider.userId]);
    await expect(save(90, task(), 2, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service(outsider).mutate("verified", { action: "set_status", id: id(90), expectedRevision: 2, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
  });
});
