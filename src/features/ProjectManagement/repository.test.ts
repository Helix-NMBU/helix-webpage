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

});
