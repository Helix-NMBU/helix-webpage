// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectRepository, ProjectRequestError } from "./repository";
import { createLocalProjectRepository } from "./local-repository";

afterEach(() => vi.unstubAllEnvs());
describe("project repository", () => {
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
});
