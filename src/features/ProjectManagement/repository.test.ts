// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectRepository, ProjectRequestError } from "./repository";
import { osloDate } from "./model";
import { createLocalProjectRepository } from "./local-repository";
import { CvRequestError } from "../MemberCV/repository";
import { clearMemberLanding, ensureMemberLanding, loginAction } from "../MemberCV/session";

afterEach(() => { clearMemberLanding(); vi.unstubAllEnvs(); });
describe("project repository", () => {
  it.each(["load", "save"])("invalidates a cached signed-in landing when the API rejects %s with 401", async action => {
    const jwt = `${btoa('{}')}.${btoa(JSON.stringify({ sub: "member", exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
    const client = { getSession: vi.fn().mockResolvedValue({ data: { user: { id: "member" } } }), token: vi.fn().mockResolvedValue({ data: { token: jwt } }) };
    const bootstrap = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    expect(loginAction(await ensureMemberLanding(client, bootstrap))).toBe("profile");
    const repository = createProjectRepository(async () => jwt, vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Your session has expired." }), { status: 401 })));
    const request = action === "load" ? repository.load() : repository.mutate({ action: "set_status", id: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, status: "done", blockedReason: "" });
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(loginAction(await ensureMemberLanding(client, bootstrap))).toBe("form");
    expect(client.getSession).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])("turns rejected session acquisition (%s) into sign-in recovery without a request", async status => {
    const request = vi.fn();
    const repository = createProjectRepository(async () => { throw new CvRequestError("Sign in again.", status); }, request);
    await expect(repository.load()).rejects.toMatchObject({ status: 401 });
    expect(request).not.toHaveBeenCalled();
  });
  it("sends the authenticated token and does not use shared response caching", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ season: "S27" })));
    const repository = createProjectRepository(async () => "member-token", request);
    await repository.load();
    expect(request).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "GET", cache: "no-store", headers: { Authorization: "Bearer member-token" } }));
  });
  it("preserves access failures for notification and session recovery", async () => {
    const repository = createProjectRepository(async () => "partner-token", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Project access required." }), { status: 403 })));
    await expect(repository.load()).rejects.toEqual(new ProjectRequestError("Project access required.", 403));
  });
});

describe("dedicated local project mode", () => {
  beforeEach(() => { localStorage.clear(); vi.stubEnv("DEV", true); vi.stubEnv("MODE", "member-local"); });
  it("cannot enable fixtures in a production build or another development mode", () => {
    vi.stubEnv("DEV", false);
    expect(() => createLocalProjectRepository()).toThrow("member-local");
    vi.stubEnv("DEV", true); vi.stubEnv("MODE", "development");
    expect(() => createLocalProjectRepository()).toThrow("member-local");
  });
  it("creates project and initial milestones together, without persisting partial failures", async () => {
    const repository=createLocalProjectRepository();const before=await repository.load();
    const project={...before.projects[0],name:"Batch build"};
    const change={action:"save_project" as const,id:crypto.randomUUID(),expectedRevision:0,project,milestones:[{id:crypto.randomUUID(),title:"Design ready",description:"",deadline:"2026-11-01",partnerName:""}]};
    const stored=localStorage.getItem("helix-member-local-projects-v1");
    await expect(repository.mutate({...change,milestones:[change.milestones[0],{...change.milestones[0],id:before.tasks[0].id}]})).rejects.toMatchObject({status:409});
    expect(localStorage.getItem("helix-member-local-projects-v1")).toBe(stored);
    const saved=await repository.mutate(change);
    expect(saved.projects.find(p=>p.id===change.id)?.name).toBe("Batch build");
    expect(saved.tasks.find(t=>t.id===change.milestones[0].id)).toMatchObject({projectId:change.id,kind:"milestone",status:"todo"});
    expect(saved.progressEvents.filter(e=>e.taskId===change.milestones[0].id)).toHaveLength(1);
    localStorage.setItem("helix-member-local-projects-v1",JSON.stringify({...saved,canManage:false,taskLeadCategories:[]}));
    const withoutLead=localStorage.getItem("helix-member-local-projects-v1");
    await expect(repository.mutate({...change,id:crypto.randomUUID(),milestones:[{...change.milestones[0],id:crypto.randomUUID()}]})).rejects.toMatchObject({status:403});
    expect(localStorage.getItem("helix-member-local-projects-v1")).toBe(withoutLead);
  });
  it("persists changes and rejects a stale revision without overwriting the saved task", async () => {
    const repository = createLocalProjectRepository();
    const initial = await repository.load();
    const task = initial.tasks[1];
    const change = { action: "save_task" as const, id: task.id, expectedRevision: task.revision, task: { ...task, title: "Updated task" } };
    await repository.mutate(change);
    await expect(repository.mutate(change)).rejects.toMatchObject({ status: 409 });
    const reloaded = await createLocalProjectRepository().load();
    expect(reloaded.tasks.find(item => item.id === task.id)).toMatchObject({ title: "Updated task", revision: 2 });
  });
  it("preserves old local assignments when upgrading to multiple assignees", async () => {
    const initial = await createLocalProjectRepository().load();
    const legacy = { ...initial, tasks: initial.tasks.map(({ assigneeIds, ...task }) => ({ ...task, assigneeId: assigneeIds[0] ?? null })) };
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify(legacy));
    const upgraded = await createLocalProjectRepository().load();
    expect(upgraded.tasks[0].assigneeIds).toEqual(initial.tasks[0].assigneeIds);
    expect(upgraded.tasks[0]).not.toHaveProperty("assigneeId");
    const task = upgraded.tasks[0];
    const both = upgraded.members.map(member => member.id);
    await createLocalProjectRepository().mutate({ action: "save_task", id: task.id, expectedRevision: task.revision, task: { ...task, assigneeIds: both } });
    expect((await createLocalProjectRepository().load()).tasks.find(item => item.id === task.id)?.assigneeIds).toEqual(both);
  });
  it("upgrades existing fixtures without inventing old history or milestone membership", async () => {
    const initial = await createLocalProjectRepository().load();
    const { progressEvents: _history, ...legacy } = initial;
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...legacy, tasks: initial.tasks.map(({ milestoneId: _milestone, ...task }) => task) }));
    const loaded = await createLocalProjectRepository().load();
    expect(loaded.tasks.every(task => task.milestoneId === null)).toBe(true);
    expect(loaded.progressEvents).toHaveLength(loaded.tasks.length);
    expect(loaded.progressEvents.every(event => osloDate(new Date(event.recordedAt)) === osloDate())).toBe(true);
  });
  it("records observed status changes and rolls back invalid milestone changes", async () => {
    const repository = createLocalProjectRepository();
    const initial = await repository.load();
    const task = initial.tasks[1];
    const updated = await repository.mutate({ action: "set_status", id: task.id, expectedRevision: task.revision, status: "done", blockedReason: "" });
    expect(updated.progressEvents).toHaveLength(initial.progressEvents.length + 1);
    expect(updated.progressEvents[updated.progressEvents.length - 1]).toMatchObject({ taskId: task.id, status: "done" });
    const saved = updated.tasks.find(item => item.id === task.id)!;
    await expect(repository.mutate({ action: "save_task", id: saved.id, expectedRevision: saved.revision, task: { ...saved, milestoneId: initial.tasks.find(item => item.category === "operations")!.id } })).rejects.toThrow("milestone");
    expect(await repository.load()).toEqual(updated);
  });

  it("organizes legacy work without losing its assignment or observed history", async () => {
    const repository = createLocalProjectRepository();
    const initial = await repository.load();
    const task = initial.tasks[1];
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...initial, tasks: initial.tasks.map(item => item.id === task.id ? { ...item, projectId: null, milestoneId: null } : item) }));
    const legacy = (await repository.load()).tasks.find(item => item.id === task.id)!;
    const updated = await repository.mutate({ action: "set_status", id: legacy.id, expectedRevision: legacy.revision, status: "done", blockedReason: "" });
    const saved = updated.tasks.find(item => item.id === task.id)!;
    await expect(repository.mutate({ action: "save_task", id: saved.id, expectedRevision: saved.revision, task: saved })).rejects.toThrow("project");
    const organized = await repository.mutate({ action: "save_task", id: saved.id, expectedRevision: saved.revision, task: { ...saved, projectId: task.projectId, milestoneId: task.milestoneId } });
    expect(organized.tasks.find(item => item.id === task.id)).toMatchObject({ projectId: task.projectId, milestoneId: task.milestoneId, assigneeIds: task.assigneeIds, status: "done" });
    expect(organized.progressEvents).toEqual(updated.progressEvents);
  });

  it("updates legacy milestone fields without changing placement, children or history", async () => {
    const repository = createLocalProjectRepository();
    const workspace = await repository.load();
    const goal = workspace.tasks.find(task => task.kind === "milestone")!;
    const legacy = { ...goal, projectId: null };
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...workspace, tasks: workspace.tasks.map(task => task.id === goal.id ? legacy : task) }));
    const changes = { priority: "high" as const, deadline: "2027-01-01", assigneeIds: workspace.members.map(member => member.id) };
    const updated = await repository.mutate({ action: "update_milestone", id: goal.id, expectedRevision: 1, changes });
    expect(updated.tasks.find(task => task.id === goal.id)).toMatchObject({ ...legacy, ...changes, revision: 2, updatedAt: expect.any(String) });
    expect(updated.tasks.filter(task => task.id !== goal.id)).toEqual(workspace.tasks.filter(task => task.id !== goal.id));
    expect(updated.progressEvents).toEqual(workspace.progressEvents);
    await expect(repository.mutate({ action: "update_milestone", id: goal.id, expectedRevision: 1, changes: { priority: "low" } })).rejects.toMatchObject({ status: 409 });
    await expect(repository.mutate({ action: "update_milestone", id: goal.id, expectedRevision: 2, changes: { assigneeIds: ["00000000-0000-4000-8000-000000009999"] } })).rejects.toThrow("active");
    expect(await repository.load()).toEqual(updated);
  });
  it("honors management role overrides, denies Viewers, and rejects ordinary task targets", async () => {
    const repository = createLocalProjectRepository();
    const workspace = await repository.load();
    const goal = workspace.tasks.find(task => task.kind === "milestone")!;
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...workspace, canManage: true, taskLeadCategories: [] }));
    const saved = await repository.mutate({ action: "update_milestone", id: goal.id, expectedRevision: 1, changes: { priority: "high" } });
    expect(saved.tasks.find(task => task.id === goal.id)?.priority).toBe("high");
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...saved, canManage: false }));
    await expect(repository.mutate({ action: "update_milestone", id: goal.id, expectedRevision: 2, changes: { priority: "low" } })).rejects.toMatchObject({ status: 403 });
    await expect(repository.mutate({ action: "update_milestone", id: workspace.tasks[0].id, expectedRevision: 1, changes: { priority: "high" } })).rejects.toThrow("Milestone");
  });

  it("persists department membership and Lead without changing tasks, history or permissions", async () => {
    const repository = createLocalProjectRepository(); const before = await repository.load();
    const change = { action: "save_department" as const, id: before.departments.find(department => department.name === "Software & Autonomous")!.id, expectedRevision: 1, department: { name: "Software & Autonomous", memberIds: before.members.map(member => member.id), leadId: before.members[1].id } };
    const after = await repository.mutate(change);
    expect((await createLocalProjectRepository().load()).departments.find(item => item.id === change.id)).toMatchObject({ ...change.department, revision: 2, season: "S27" });
    expect(after.tasks).toEqual(before.tasks); expect(after.progressEvents).toEqual(before.progressEvents); expect(after.taskLeadCategories).toEqual(before.taskLeadCategories);
    await expect(repository.mutate(change)).rejects.toMatchObject({ status: 409 });
    await expect(repository.mutate({ ...change, expectedRevision: 2, department: { ...change.department, leadId: "00000000-0000-4000-8000-000000009999" } })).rejects.toThrow("member");
    await expect(repository.mutate({ ...change, expectedRevision: 2, department: { ...change.department, name: "Finance" } })).rejects.toThrow("names");
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...after, canManage: false }));
    await expect(repository.mutate({ ...change, expectedRevision: 2 })).rejects.toMatchObject({ status: 403 });
  });

  it("does not invent department membership when upgrading older local workspaces", async () => {
    const repository = createLocalProjectRepository(); const before = await repository.load();
    const { departments: _departments, ...older } = before;
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...older, canManage: false }));
    const after = await repository.load();
    expect(after.departments).toHaveLength(7); expect(after.departments.every(department => department.memberIds.length === 0 && !department.leadId)).toBe(true); expect(after.tasks).toEqual(before.tasks); expect(after.progressEvents).toEqual(before.progressEvents);
  });

  it("maps older department names to the fixed catalog without losing memberships or Leads", async () => {
    const repository = createLocalProjectRepository(); const before = await repository.load();
    const oldName = (name: string) => name === "Mechanical & Production" ? "Mechanical" : name === "Electronics" ? "Electrical" : name;
    localStorage.setItem("helix-member-local-projects-v1", JSON.stringify({ ...before, departments: before.departments.map(department => ({ ...department, name: oldName(department.name) })), projects: before.projects.map(project => ({ ...project, departments: project.departments.map(oldName) })) }));
    const after = await repository.load();
    expect(after.departments).toHaveLength(7);
    for (const name of ["Mechanical & Production", "Electronics"]) {
      const prior = before.departments.find(department => department.name === name)!;
      expect(after.departments.find(department => department.name === name)).toMatchObject({ id: prior.id, memberIds: prior.memberIds, leadId: prior.leadId, revision: prior.revision + 1 });
    }
    expect(after.projects[0].departments).toEqual(["Mechanical & Production", "Electronics"]);
    expect(await repository.load()).toEqual(after);
    expect(localStorage.getItem("helix-member-local-department-archive-v1")).not.toBeNull();
  });

});
