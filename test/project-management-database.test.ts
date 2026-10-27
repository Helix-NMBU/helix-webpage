import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectServices } from "../api/_lib/project-management-service.js";
import type { WorkspaceIdentity } from "../api/_lib/member-cv-service.js";
import { ORGANIZATION_DEPARTMENTS, type TaskInput } from "../src/features/ProjectManagement/types.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const manager: WorkspaceIdentity = { userId: id(1), googleSub: "google-manager", email: "manager@helixnmbu.no", name: "Manager" };
const member: WorkspaceIdentity = { userId: id(2), googleSub: "google-member", email: "member@helixnmbu.no", name: "Member" };
const outsider: WorkspaceIdentity = { userId: id(3), googleSub: "google-outsider", email: "outsider@helixnmbu.no", name: "Outsider" };
let db: PGlite;
const service = (identity = manager) => createProjectServices({ db, authenticate: async () => identity });
const task = (overrides: Partial<TaskInput> = {}): TaskInput => {
  const category = overrides.category ?? "production";
  const projectId = category === "partnership-deliverables" ? id(952) : category === "marketing" ? id(954) : id(950);
  const milestoneId = category === "partnership-deliverables" ? id(953) : category === "marketing" ? id(955) : id(951);
  return { title: "Manufacture brackets", description: "Cut and inspect", category, projectId,
    milestoneId: overrides.kind === "milestone" ? null : milestoneId,
    assigneeIds: [member.userId], deadline: "2026-12-01", startDate: "2026-11-01", status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "", ...overrides };
};
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
    await db.query("insert into project_management.tasks(id,season,title,category,assignee_id,status,priority,kind,created_at) values($1,'S27','Existing assigned task','production',$2,'todo','normal','task','2020-01-01')", [id(800), member.userId]);
    await db.exec(readFileSync(new URL("../db/migrations/011_task_assignees.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/012_project_milestones.sql", import.meta.url), "utf8"));
    for (const [projectId, milestoneId, category] of [[950, 951, "production"], [952, 953, "partnership-deliverables"], [954, 955, "marketing"]] as const) {
      await db.query("insert into project_management.projects(id,season,name,category) values($1,'S27',$2,$3)", [id(projectId), `${category} project`, category]);
      await db.query("insert into project_management.tasks(id,season,title,category,project_id,deadline,status,priority,kind,partner_name) values($1,'S27','Existing milestone',$2,$3,'2026-12-01','todo','normal','milestone',$4)", [id(milestoneId), category, id(projectId), category === "partnership-deliverables" ? "Sponsor" : ""]);
    }
    // All legacy shapes are inserted before the strict hierarchy migration.
    await db.query("insert into project_management.tasks(id,season,title,category,deadline,status,priority,kind) values($1,'S27','Ungrouped milestone','production','2026-12-01','todo','normal','milestone')", [id(801)]);
    for (const [taskId, projectId, milestoneId] of [[202, null, null], [802, null, 801], [803, 950, 801], [804, 950, null]] as const) {
      await db.query("insert into project_management.tasks(id,season,title,category,project_id,milestone_id,status,priority,kind) values($1,'S27','Ungrouped task','production',$2,$3,'todo','normal','task')", [id(taskId), projectId === null ? null : id(projectId), milestoneId === null ? null : id(milestoneId)]);
      await db.query("insert into project_management.task_assignees values($1,$2)", [id(taskId), member.userId]);
    }
    await db.query("insert into project_management.tasks(id,season,title,category,deadline,start_date,status,priority,kind) values($1,'S27','Editable legacy milestone','production','2026-12-01','2026-11-01','todo','normal','milestone')", [id(805)]);
    await db.query("insert into project_management.task_assignees values($1,$2)", [id(805), member.userId]);
    await db.exec(readFileSync(new URL("../db/migrations/013_project_hierarchy.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/014_milestone_field_updates.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/015_project_departments.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/016_fixed_departments.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/017_workspace_directory.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/020_project_start_dates.sql", import.meta.url), "utf8"));
    await db.query("update project_management.projects set lead_ids=array[$1::uuid]", [manager.userId]);
    await db.exec(readFileSync(new URL("../db/migrations/023_project_requires_lead.sql", import.meta.url), "utf8"));

  }, 60000);
  afterAll(async () => { await db?.close(); });

  it("preserves existing assignments and does not restore removed members when migration is repeated", async () => {
    const baseline = (await service().load("verified")).progressEvents.filter(event => event.taskId === id(800));
    expect(baseline).toHaveLength(1);
    expect(baseline[0]).toMatchObject({ category: "production", kind: "task", status: "todo" });
    expect(new Date(baseline[0].recordedAt).getUTCFullYear()).toBeGreaterThan(2020);
    expect((await service().load("verified")).tasks.find(item => item.id === id(800))?.assigneeIds).toEqual([member.userId]);
    await db.query("insert into project_management.task_assignees(task_id,member_id) values($1,$2)", [id(800), manager.userId]);
    await db.query("delete from project_management.task_assignees where task_id=$1 and member_id=$2", [id(800), member.userId]);
    await db.exec(readFileSync(new URL("../db/migrations/011_task_assignees.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/012_project_milestones.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/013_project_hierarchy.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/014_milestone_field_updates.sql", import.meta.url), "utf8"));
    expect((await service().load("verified")).tasks.find(item => item.id === id(800))?.assigneeIds).toEqual([manager.userId]);
    expect((await service().load("verified")).progressEvents.filter(event => event.taskId === id(800))).toHaveLength(1);
    await db.query("delete from project_management.tasks where id=$1", [id(800)]);
    expect((await service().load("verified")).progressEvents.filter(event => event.taskId === id(800)).map(event => event.status)).toEqual(["todo", "cancelled"]);
    expect((await db.query("select has_table_privilege('public','project_management.task_assignees','SELECT') as allowed")).rows[0]).toEqual({ allowed: false });
  });

  it("does not infer module grants from member sign-in and exposes only eligible member names", async () => {
    await expect(service(outsider).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(save(10, task(), 0, outsider)).rejects.toMatchObject({ status: 403 });
    const workspace = await service().load("verified");
    expect(workspace).toMatchObject({ season: "S27", viewerId: manager.userId, canManage: true, taskLeadCategories: ["production", "partnership-deliverables", "marketing", "operations"] });
    expect(workspace.members).toEqual([{ id: manager.userId, name: "Manager", avatarUrl: null }, { id: member.userId, name: "Member", avatarUrl: null }]);
    expect(JSON.stringify(workspace)).not.toContain("@helixnmbu.no");
  });
  it("persists department-spanning subprojects and complete tasks in the shared season", async () => {
    await service().mutate("verified", { action: "save_project", id: id(20), expectedRevision: 0,
      project: { name: "Suspension", description: "Build and test", category: "production", departments: ["Mechanical & Production", "Electronics"], leadIds: [manager.userId], deadline: "2026-12-10" } });
    await save(960, task({ kind: "milestone", projectId: id(20) }));
    const workspace = await save(10, task({ projectId: id(20), milestoneId: id(960) }));
    expect(workspace.projects.find(item => item.id === id(20))).toMatchObject({ id: id(20), departments: ["Mechanical & Production", "Electronics"], deadline: "2026-12-10", revision: 1 });
    expect(workspace.tasks.find(item => item.id === id(10))).toMatchObject({ id: id(10), projectId: id(20), title: "Manufacture brackets", assigneeIds: [member.userId], revision: 1, completedAt: null });
  });
  it("rejects duplicate creates and stale edits without overwriting saved work", async () => {
    await expect(save(10)).rejects.toMatchObject({ status: 409 });
    await save(10, task({ title: "Inspect brackets", projectId: id(20), milestoneId: id(960) }), 1);
    await expect(save(10, task({ title: "Stale replacement" }), 1)).rejects.toMatchObject({ status: 409 });
    expect((await service().load("verified")).tasks.find(t => t.id === id(10))).toMatchObject({ title: "Inspect brackets", revision: 2 });
  });
  it("lets an assignee update status but prevents edits and updates to another member's task", async () => {
    await save(11, task({ assigneeIds: [manager.userId] }));
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
    expect((await service().load("verified")).members).toEqual([{ id: manager.userId, name: "Manager", avatarUrl: null }]);
    await db.query("update project_management.access set active=true where member_id=$1", [member.userId]);
    await expect(service({ ...manager, googleSub: "switched-google" }).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(save(12, task(), 0, { ...manager, email: "another@helixnmbu.no" })).rejects.toMatchObject({ status: 403 });
  });
  it("enforces same-category project references and preserves the category of a populated project", async () => {
    await expect(save(12, task({ category: "marketing", projectId: id(20) }))).rejects.toMatchObject({ status: 400 });
    await expect(service().mutate("verified", { action: "save_project", id: id(20), expectedRevision: 1,
      project: { name: "Suspension", description: "", category: "operations", departments: [], leadIds: [manager.userId], deadline: null } })).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ projectId: id(999) }))).rejects.toMatchObject({ status: 400 });
    await expect(save(12, task({ assigneeIds: [outsider.userId] }))).rejects.toMatchObject({ status: 400 });
  });
  it("excludes banned or unlinked users from assignment and rejects stale authentication", async () => {
    await db.query('update neon_auth."user" set banned=true where id=$1', [member.userId]);
    await expect(service(member).load("verified")).rejects.toMatchObject({ status: 403 });
    await expect(save(13)).rejects.toMatchObject({ status: 400 });
    expect((await service().load("verified")).members).toEqual([{ id: manager.userId, name: "Manager", avatarUrl: null }]);
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
    await expect(save(10, task({ assigneeIds: [outsider.userId] }), 5, outsider)).rejects.toMatchObject({ status: 403 });
    await db.query("update project_management.access set can_manage=false,task_lead_categories=array['production'] where member_id=$1", [outsider.userId]);
    await expect(save(12, task({ category: "production" }), 1, outsider)).rejects.toMatchObject({ status: 403 });
    await save(90, task({ assigneeIds: [outsider.userId] }), 0, outsider);
    await expect(save(91, task({ category: 'marketing' }), 0, outsider)).rejects.toMatchObject({ status: 403 });
    const workspace = await save(90, task({ assigneeIds: [member.userId] }), 1, outsider);
    expect(workspace.tasks.find(item => item.id === id(90))?.assigneeIds).toEqual([member.userId]);
    await db.query("update project_management.access set task_lead_categories='{}' where member_id=$1", [outsider.userId]);
    await expect(save(90, task(), 2, outsider)).rejects.toMatchObject({ status: 403 });
    await expect(service(outsider).mutate("verified", { action: "set_status", id: id(90), expectedRevision: 2, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
  });
  it("authorizes every co-assignee, detects shared conflicts and revokes removed assignments", async () => {
    const input = task({ assigneeIds: [member.userId, outsider.userId] });
    const created = await save(91, input);
    expect(created.tasks.find(item => item.id === id(91))?.assigneeIds).toEqual([member.userId, outsider.userId]);
    await service(member).mutate("verified", { action: "set_status", id: id(91), expectedRevision: 1, status: "done", blockedReason: "" });
    await expect(service(outsider).mutate("verified", { action: "set_status", id: id(91), expectedRevision: 1, status: "todo", blockedReason: "" })).rejects.toMatchObject({ status: 409 });
    await service(outsider).mutate("verified", { action: "set_status", id: id(91), expectedRevision: 2, status: "todo", blockedReason: "" });
    await save(91, task({ assigneeIds: [member.userId] }), 3);
    await expect(service(outsider).mutate("verified", { action: "set_status", id: id(91), expectedRevision: 4, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
  });
  it("rejects invalid co-assignees without changing the task or its saved assignments", async () => {
    await save(92, task({ assigneeIds: [member.userId, manager.userId, member.userId] }));
    await expect(save(92, task({ title: "Must not be saved", assigneeIds: [manager.userId, id(9999)] }), 1)).rejects.toMatchObject({ status: 400 });
    const current = (await service().load("verified")).tasks.find(item => item.id === id(92))!;
    expect(current).toMatchObject({ title: "Manufacture brackets", revision: 1, assigneeIds: [manager.userId, member.userId] });
    const cleared = await save(92, task({ assigneeIds: [] }), 1);
    expect(cleared.tasks.find(item => item.id === id(92))?.assigneeIds).toEqual([]);
    await expect(service(member).mutate("verified", { action: "set_status", id: id(92), expectedRevision: 2, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
  });
  it("links ordinary tasks to milestones and returns child completion and unlinked tasks", async () => {
    await save(200, task({ kind: "milestone", projectId: id(20), title: "Suspension ready" }));
    await save(201, task({ projectId: id(20), milestoneId: id(200) }));
    const workspace = await service(member).mutate("verified", { action: "set_status", id: id(201), expectedRevision: 1, status: "done", blockedReason: "" });
    expect(workspace.tasks.find(item => item.id === id(201))).toMatchObject({ milestoneId: id(200), status: "done" });
    expect(workspace.tasks.find(item => item.id === id(202))).toMatchObject({ milestoneId: null });
    expect(workspace.progressEvents.filter(event => event.taskId === id(201)).map(event => event.status)).toEqual(["todo", "done"]);
    await expect(save(201, task({ projectId: id(20), milestoneId: id(960) }), 2, member)).rejects.toMatchObject({ status: 403 });
    expect((await service().load("verified")).tasks.find(item => item.id === id(201))?.milestoneId).toBe(id(200));
  });
  it("requires complete placement for new items and rejects invalid links atomically", async () => {
    await save(210, task({ kind: "milestone" }));
    await save(211, task({ milestoneId: id(210) }));
    await service().mutate("verified", { action: "save_project", id: id(21), expectedRevision: 0,
      project: { name: "Second project", description: "", category: "production", departments: [], leadIds: [manager.userId], deadline: null } });
    for (const patch of [
      { projectId: null }, { milestoneId: null }, { milestoneId: id(9999) }, { milestoneId: id(202) }, { milestoneId: id(212) },
      { milestoneId: id(200), projectId: id(21) }, { milestoneId: id(200), projectId: null },
      { milestoneId: id(210), category: "marketing" as const }, { milestoneId: id(801) },
      { milestoneId: id(210), kind: "milestone" as const }, { kind: "milestone" as const, projectId: null },
    ]) await expect(save(212, task(patch))).rejects.toMatchObject({ status: 400 });
    await expect(save(211, task({ milestoneId: id(9999), assigneeIds: [manager.userId], title: "Invalid replacement" }), 1)).rejects.toMatchObject({ status: 400 });
    const workspace = await service().load("verified");
    expect(workspace.tasks.find(item => item.id === id(211))).toMatchObject({ milestoneId: id(210), title: "Manufacture brackets", assigneeIds: [member.userId], revision: 1 });
    expect(workspace.tasks.some(item => item.id === id(212))).toBe(false);
    expect(workspace.progressEvents.filter(event => event.taskId === id(212))).toEqual([]);
  });
  it("guards linked milestones against incompatible edits", async () => {
    for (const patch of [{ kind: "task" as const, milestoneId: id(951) }, { category: "marketing" as const }, { projectId: id(21) }, { projectId: null }]) {
      await expect(save(210, task({ kind: "milestone", ...patch }), 1)).rejects.toMatchObject({ status: 400 });
    }
    await save(210, task({ kind: "milestone", title: "Updated milestone" }), 1);
    await expect(save(211, task({ milestoneId: id(210), projectId: id(21) }), 1)).rejects.toMatchObject({ status: 400 });
    await expect(save(211, task({ milestoneId: id(210), kind: "milestone" }), 1)).rejects.toMatchObject({ status: 400 });
    await expect(db.query("delete from project_management.tasks where id=$1", [id(210)])).rejects.toThrow();
  });
  it("preserves existing links when a milestone is cancelled but rejects new links", async () => {
    await service().mutate("verified", { action: "set_status", id: id(210), expectedRevision: 2, status: "cancelled", blockedReason: "" });
    await save(211, task({ milestoneId: id(210), title: "Existing linked task" }), 1);
    await expect(save(213, task({ milestoneId: id(210) }))).rejects.toMatchObject({ status: 400 });
    await save(211, task({ milestoneId: id(951) }), 2);
    await expect(save(211, task({ milestoneId: id(210) }), 3)).rejects.toMatchObject({ status: 400 });
  });
  it("enforces link invariants for direct database writes and rejects missing relation payloads", async () => {
    await expect(db.query("update project_management.tasks set milestone_id=id where id=$1", [id(202)])).rejects.toThrow();
    await expect(db.query("update project_management.tasks set milestone_id=$1 where id=$2", [id(210), id(202)])).rejects.toThrow();
    await expect(db.query("update project_management.tasks set kind='task' where id=$1", [id(200)])).rejects.toThrow();
    const { milestoneId: _missing, ...oldClient } = task();
    await expect(service().mutate("verified", { action: "save_task", id: id(202), expectedRevision: 1, task: oldClient })).rejects.toMatchObject({ status: 400 });
    await expect(db.query("select project_management.mutate($1,$2,$3,$4::jsonb)", [manager.userId, manager.googleSub, manager.email,
      JSON.stringify({ action: "save_task", id: id(202), expectedRevision: 1, task: oldClient })])).rejects.toThrow();
    expect((await service().load("verified")).tasks.find(item => item.id === id(202))).toMatchObject({ milestoneId: null, revision: 1 });
  });
  it("records observed states on reopen, category and kind changes without treating scheduled dates as work", async () => {
    await save(220, task({ assigneeIds: [member.userId, outsider.userId], startDate: "2020-01-01" }));
    await service(outsider).mutate("verified", { action: "set_status", id: id(220), expectedRevision: 1, status: "done", blockedReason: "" });
    await service(member).mutate("verified", { action: "set_status", id: id(220), expectedRevision: 2, status: "in_progress", blockedReason: "" });
    await service(member).mutate("verified", { action: "set_status", id: id(220), expectedRevision: 3, status: "in_progress", blockedReason: "" });
    await save(220, task({ category: "marketing", kind: "milestone", status: "in_progress", title: "Different title" }), 4);
    const events = (await service().load("verified")).progressEvents.filter(event => event.taskId === id(220));
    expect(events.map(event => [event.category, event.kind, event.status])).toEqual([
      ["production", "task", "todo"], ["production", "task", "done"], ["production", "task", "in_progress"], ["marketing", "milestone", "in_progress"],
    ]);
    expect(events.every(event => new Date(event.recordedAt).getUTCFullYear() > 2020)).toBe(true);
    expect(events.map(event => event.recordedAt)).toEqual([...events.map(event => event.recordedAt)].sort());
    expect(JSON.stringify(events)).not.toMatch(/Member|Manager|helixnmbu|Different title/);
    const count = events.length;
    await db.exec(readFileSync(new URL("../db/migrations/012_project_milestones.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/013_project_hierarchy.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/014_milestone_field_updates.sql", import.meta.url), "utf8"));
    expect((await service().load("verified")).progressEvents.filter(event => event.taskId === id(220))).toHaveLength(count);
  });
  it("rolls history back with failed writes and protects events from public access and mutation", async () => {
    const before = (await service().load("verified")).progressEvents;
    await db.exec("begin");
    await db.query("update project_management.tasks set status='done',completed_at=now() where id=$1", [id(202)]);
    await db.exec("rollback");
    expect((await service().load("verified")).progressEvents).toEqual(before);
    await expect(save(202, task({ milestoneId: id(9999), status: "done" }), 1)).rejects.toMatchObject({ status: 400 });
    expect((await service().load("verified")).progressEvents).toEqual(before);
    await expect(db.query("update project_management.task_progress_events set status='cancelled' where task_id=$1", [id(202)])).rejects.toThrow();
    await expect(db.query("delete from project_management.task_progress_events where task_id=$1", [id(202)])).rejects.toThrow();
    await expect(db.exec("truncate project_management.task_progress_events")).rejects.toThrow();
    expect((await db.query("select has_table_privilege('public','project_management.task_progress_events','SELECT') as allowed")).rows[0]).toEqual({ allowed: false });
    expect((await db.query("select relrowsecurity from pg_class where oid='project_management.task_progress_events'::regclass")).rows[0]).toEqual({ relrowsecurity: true });
  });

  it("preserves every legacy shape and history when strict migration is repeated", async () => {
    const before = await service().load("verified");
    expect(before.tasks.find(item => item.id === id(801))).toMatchObject({ kind: "milestone", projectId: null });
    expect(before.tasks.find(item => item.id === id(802))).toMatchObject({ projectId: null, milestoneId: id(801) });
    expect(before.tasks.find(item => item.id === id(803))).toMatchObject({ projectId: id(950), milestoneId: id(801) });
    expect(before.tasks.find(item => item.id === id(804))).toMatchObject({ projectId: id(950), milestoneId: null });
    await db.exec(readFileSync(new URL("../db/migrations/013_project_hierarchy.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/014_milestone_field_updates.sql", import.meta.url), "utf8"));
    const after = await service().load("verified");
    expect(after.tasks).toEqual(before.tasks);
    expect(after.progressEvents).toEqual(before.progressEvents);
  });
  it("lets legacy assignees update status but requires Lead placement before full saves", async () => {
    for (const taskId of [202, 802, 803, 804]) {
      await service(member).mutate("verified", { action: "set_status", id: id(taskId), expectedRevision: 1, status: "done", blockedReason: "" });
      const row = (await service().load("verified")).tasks.find(item => item.id === id(taskId))!;
      await expect(save(taskId, { ...row, title: "Unplaced details" }, 2)).rejects.toMatchObject({ status: 400 });
      expect((await service().load("verified")).tasks.find(item => item.id === id(taskId))).toMatchObject({ title: "Ungrouped task", revision: 2, status: "done" });
    }
    await service().mutate("verified", { action: "set_status", id: id(801), expectedRevision: 1, status: "in_progress", blockedReason: "" });
    const milestone = (await service().load("verified")).tasks.find(item => item.id === id(801))!;
    await expect(save(801, { ...milestone, title: "Unplaced milestone" }, 2)).rejects.toMatchObject({ status: 400 });
    await db.query("update project_management.tasks set title='Legacy detail edit' where id=$1", [id(802)]);
    expect((await service().load("verified")).tasks.find(item => item.id === id(802))).toMatchObject({ projectId: null, milestoneId: id(801), status: "done", title: "Legacy detail edit" });
    await expect(save(802, task(), 2, member)).rejects.toMatchObject({ status: 403 });
    await save(202, task({ status: "done" }), 2);
    expect((await service().load("verified")).tasks.find(item => item.id === id(202))).toMatchObject({ projectId: id(950), milestoneId: id(951), revision: 3 });
  });
  it("rejects incomplete direct writes and prevents hierarchy changes that invalidate legacy links", async () => {
    const before = (await service().load("verified")).progressEvents;
    for (const [kind, projectId, milestoneId] of [["task", null, null], ["task", 950, null], ["task", 950, 801], ["milestone", null, null]] as const) {
      await expect(db.query("insert into project_management.tasks(id,season,title,category,project_id,milestone_id,deadline,status,priority,kind) values($1,'S27','Invalid new item','production',$2,$3,'2026-12-01','todo','normal',$4)",
        [id(880), projectId === null ? null : id(projectId), milestoneId === null ? null : id(milestoneId), kind])).rejects.toThrow();
    }
    await expect(db.query("update project_management.tasks set project_id=$1 where id=$2", [id(950), id(801)])).rejects.toThrow();
    await expect(db.query("update project_management.tasks set project_id=$1 where id=$2", [id(21), id(803)])).rejects.toThrow();
    await expect(db.query("update project_management.tasks set milestone_id=null where id=$1", [id(803)])).rejects.toThrow();
    const legacy = (await service().load("verified")).tasks.find(item => item.id === id(803))!;
    await expect(db.query("select project_management.mutate($1,$2,$3,$4::jsonb)", [manager.userId, manager.googleSub, manager.email,
      JSON.stringify({ action: "save_task", id: legacy.id, expectedRevision: legacy.revision, task: { ...legacy, title: "SQL bypass" } })])).rejects.toThrow();
    expect((await service().load("verified")).progressEvents).toEqual(before);
    // Reassign legacy children to an organized milestone before placing their old parent.
    await save(802, task(), 2);
    await save(803, task(), 2);
    await save(801, task({ kind: "milestone" }), 2);
    expect((await service().load("verified")).tasks.find(item => item.id === id(801))).toMatchObject({ projectId: id(950), milestoneId: null, revision: 3 });
  });

  it("reapplies the field-update migration without modifying existing work", async () => {
    const before = await service().load("verified");
    for (let attempt = 0; attempt < 2; attempt++) await db.exec(readFileSync(new URL("../db/migrations/014_milestone_field_updates.sql", import.meta.url), "utf8"));
    expect(await service().load("verified")).toEqual(before);
  });
  it("updates unorganized milestone fields without rewriting hierarchy, children or history", async () => {
    const before = await service().load("verified");
    const legacy = before.tasks.find(item => item.id === id(805))!;
    expect(legacy.projectId).toBeNull();
    const changes = { priority: "high", deadline: "2026-12-15", assigneeIds: [manager.userId, member.userId] };
    const after = await service().mutate("verified", { action: "update_milestone", id: legacy.id, expectedRevision: 1, changes });
    expect(after.tasks.find(item => item.id === legacy.id)).toMatchObject({ ...legacy, ...changes, revision: 2, updatedAt: expect.any(String) });
    expect(after.tasks.filter(item => item.id !== legacy.id)).toEqual(before.tasks.filter(item => item.id !== legacy.id));
    expect(after.progressEvents).toEqual(before.progressEvents);
    await expect(service().mutate("verified", { action: "update_milestone", id: legacy.id, expectedRevision: 1, changes: { priority: "low" } })).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back invalid partial updates and rejects hierarchy/status injection at API and SQL boundaries", async () => {
    const before = await service().load("verified");
    const change = { action: "update_milestone", id: id(805), expectedRevision: 2 };
    for (const changes of [{ priority: "urgent", assigneeIds: [manager.userId, id(9999)] }, { deadline: "2026-10-31" }, { deadline: null }, { deadline: "2026-02-30" }, { projectId: id(950) }, { category: "marketing" }, { kind: "task" }, { status: "done" }, {}]) {
      await expect(service().mutate("verified", { ...change, changes })).rejects.toMatchObject({ status: 400 });
      await expect(db.query("select project_management.mutate($1,$2,$3,$4::jsonb)", [manager.userId, manager.googleSub, manager.email, JSON.stringify({ ...change, changes })])).rejects.toThrow();
    }
    await expect(service().mutate("verified", { ...change, id: id(804), changes: { priority: "high" } })).rejects.toMatchObject({ status: 400 });
    await expect(service().mutate("verified", { ...change, id: id(9999), changes: { priority: "high" } })).rejects.toMatchObject({ status: 404 });
    expect(await service().load("verified")).toEqual(before);
  });
  it("requires an active scoped Lead grant for partial updates, even for managers and assigned members", async () => {
    const change = { action: "update_milestone", id: id(805), expectedRevision: 2, changes: { priority: "low" } };
    await expect(service(member).mutate("verified", change)).rejects.toMatchObject({ status: 403 });
    await db.query("update project_management.access set can_manage=true,task_lead_categories=array['marketing'] where member_id=$1", [outsider.userId]);
    await expect(service(outsider).mutate("verified", change)).rejects.toMatchObject({ status: 403 });
    await db.query("update project_management.access set task_lead_categories=array['production'] where member_id=$1", [member.userId]);
    const updated = await service(member).mutate("verified", change);
    expect(updated.tasks.find(item => item.id === id(805))).toMatchObject({ priority: "low", projectId: null, revision: 3 });
    await db.query("update project_management.access set task_lead_categories='{}' where member_id=$1", [member.userId]);
    await expect(service(member).mutate("verified", { ...change, expectedRevision: 3 })).rejects.toMatchObject({ status: 403 });
    await expect(service({ ...manager, googleSub: "untrusted" }).mutate("verified", { ...change, expectedRevision: 3 })).rejects.toMatchObject({ status: 403 });
  });

  it("stores membership and a Lead for a fixed department without changing tasks or access", async () => {
    const before = await service().load("verified");
    expect(before.departments.map(item => item.name).sort()).toEqual([...ORGANIZATION_DEPARTMENTS].sort());
    const target = before.departments.find(item => item.name === "Mechanical & Production")!;
    const grants = (await db.query("select * from project_management.access order by member_id")).rows;
    const department = { name: target.name, memberIds: [member.userId, manager.userId, member.userId], leadId: member.userId };
    const after = await service().mutate("verified", { action: "save_department", id: target.id, expectedRevision: target.revision, department });
    expect(after.departments.find(item => item.id === target.id)).toMatchObject({ name: target.name, memberIds: [manager.userId, member.userId], leadId: member.userId, revision: target.revision + 1 });
    expect(after.tasks).toEqual(before.tasks); expect(after.progressEvents).toEqual(before.progressEvents);
    expect((await db.query("select * from project_management.access order by member_id")).rows).toEqual(grants);
    await expect(service().mutate("verified", { action: "save_department", id: id(501), expectedRevision: 0, department })).rejects.toMatchObject({ status: 400 });
    await expect(db.query("update project_management.department_members set is_lead=true where department_id=$1 and member_id=$2", [target.id, manager.userId])).rejects.toThrow();
  });
  it("rejects stale department revisions, nonmember Leads, ineligible members and additional departments", async () => {
    const before = await service().load("verified");
    const target = before.departments.find(item => item.name === "Mechanical & Production")!;
    const base = { action: "save_department", id: target.id, expectedRevision: target.revision };
    for (const department of [{ name: target.name, memberIds: [manager.userId, id(9999)], leadId: null }, { name: target.name, memberIds: [manager.userId], leadId: member.userId }, { name: "Other", memberIds: [], leadId: null }]) {
      await expect(service().mutate("verified", { ...base, department })).rejects.toMatchObject({ status: 400 });
      await expect(db.query("select project_management.save_department($1,$2,$3,$4::jsonb)", [manager.userId, manager.googleSub, manager.email, JSON.stringify({ ...base, department })])).rejects.toThrow();
    }
    await expect(service().mutate("verified", { ...base, expectedRevision: target.revision - 1, department: { name: target.name, memberIds: [], leadId: null } })).rejects.toMatchObject({ status: 409 });
    await expect(db.query("insert into project_management.departments(id,season,name) values($1,'S27','Other')", [id(501)])).rejects.toThrow();
    await expect(db.query("update project_management.projects set departments=array['Other'] where id=$1", [id(20)])).rejects.toThrow();
    expect(await service().load("verified")).toEqual(before);
  });
  it("requires project-management access for fixed department membership edits", async () => {
    const before = await service().load("verified");
    const target = before.departments.find(item => item.name === "Software & Autonomous")!;
    const change = { action: "save_department", id: target.id, expectedRevision: target.revision, department: { name: target.name, memberIds: [], leadId: null } };
    await db.query("update project_management.access set task_lead_categories=array['production'] where member_id=$1", [member.userId]);
    await expect(service(member).mutate("verified", change)).rejects.toMatchObject({ status: 403 });
    await expect(service({ ...manager, googleSub: "wrong" }).mutate("verified", change)).rejects.toMatchObject({ status: 403 });
    await db.query("update project_management.access set task_lead_categories='{}' where member_id=$1", [member.userId]);
    await service().mutate("verified", change);
    expect((await db.query("select has_table_privilege('public','project_management.department_members','SELECT') as allowed")).rows[0]).toEqual({ allowed: false });
  });
  it("maps older departments and project links, preserves memberships and archives conflicting or unknown metadata", async () => {
    const before = await service().load("verified");
    await db.exec("alter table project_management.departments drop constraint organization_department_name; alter table project_management.projects drop constraint organization_project_departments");
    for (const [number, name, lead] of [[701, "Business", manager.userId], [702, "Marketing", member.userId], [703, "Unknown", manager.userId]] as const) {
      await db.query("insert into project_management.departments(id,season,name) values($1,'S27',$2)", [id(number), name]);
      await db.query("insert into project_management.department_members(department_id,member_id,is_lead) values($1,$2,true)", [id(number), lead]);
    }
    await db.query("insert into project_management.projects(id,season,name,category,departments) values($1,'S27','Legacy departments','marketing',array['Business','Marketing','Unknown'])", [id(703)]);
    await db.exec(readFileSync(new URL("../db/migrations/016_fixed_departments.sql", import.meta.url), "utf8"));
    const after = await service().load("verified");
    expect(after.departments.map(item => item.name).sort()).toEqual([...ORGANIZATION_DEPARTMENTS].sort());
    expect(after.departments.find(item => item.name === "Business & Marketing")).toMatchObject({ memberIds: [manager.userId, member.userId], leadId: null });
    expect(after.projects.find(item => item.id === id(703))?.departments).toEqual(["Business & Marketing"]);
    expect((await db.query("select count(*)::int as count from project_management.department_catalog_backup where id=any($1::uuid[])", [[id(701), id(702), id(703)]])).rows[0]).toEqual({ count: 3 });
    expect(after.tasks).toEqual(before.tasks); expect(after.progressEvents).toEqual(before.progressEvents);
    await db.exec(readFileSync(new URL("../db/migrations/016_fixed_departments.sql", import.meta.url), "utf8"));
    expect(await service().load("verified")).toEqual(after);
  });

});
