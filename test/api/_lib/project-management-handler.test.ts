import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createProjectHandler } from "../../../api/_lib/project-management-handler.js";
import { MemberCvError } from "../../../api/_lib/member-cv-error.js";
import type { ProjectServices } from "../../../api/_lib/project-management-service.js";
import { parseProjectMutation } from "../../../api/_lib/project-management-validation.js";
import memberApi from "../../../api/member-login.js";

const fixture = () => ({ load: vi.fn(), mutate: vi.fn() });
async function call(services: ProjectServices, args: { method?: string; token?: string; body?: unknown; length?: string } = {}) {
  let status = 0; let result: unknown;
  const headers: Record<string, unknown> = {};
  const res = { setHeader: (key: string, value: unknown) => { headers[key] = value; }, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { result = value; return res; } };
  await createProjectHandler(() => services)({ method: args.method ?? "GET", body: args.body, headers: {
    ...(args.token ? { authorization: `Bearer ${args.token}` } : {}), ...(args.length ? { "content-length": args.length } : {}),
  } } as VercelRequest, res as unknown as VercelResponse);
  return { status, result, headers };
}
describe("project management HTTP boundaries", () => {
  it("validates and deduplicates co-assignees without accepting the old single-assignee payload", () => {
    const first = "10000000-0000-4000-8000-000000000001";
    const second = "10000000-0000-4000-8000-000000000002";
    const input = { action: "save_task", id: first, expectedRevision: 0, task: { title: "Shared work", description: "", category: "production", projectId: first, milestoneId: second, assigneeIds: [first, second, first], deadline: null, startDate: null, status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "" } };
    expect(parseProjectMutation(input)).toMatchObject({ task: { assigneeIds: [first, second] } });
    for (const value of [null, first, [null], ["invalid"], Array(21).fill(first)]) expect(() => parseProjectMutation({ ...input, task: { ...input.task, assigneeIds: value } })).toThrow();
    const { assigneeIds: _old, ...withoutIds } = input.task;
    expect(() => parseProjectMutation({ ...input, task: { ...withoutIds, assigneeId: first } })).toThrow();
  });
  it("accepts only the three bounded milestone fields in partial updates", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const input = { action: "update_milestone", id, expectedRevision: 1, changes: { priority: "high", deadline: "2026-12-01", assigneeIds: [id, id] } };
    expect(parseProjectMutation(input)).toEqual({ ...input, changes: { ...input.changes, assigneeIds: [id] } });
    for (const changes of [{}, null, [], { projectId: null }, { category: "marketing" }, { status: "done" }, { priority: "invalid" }, { deadline: null }, { deadline: "2026-02-30" }, { assigneeIds: [null] }, { assigneeIds: Array(21).fill(id) }]) expect(() => parseProjectMutation({ ...input, changes })).toThrow();
    expect(() => parseProjectMutation({ ...input, expectedRevision: 0 })).toThrow();
  });
  it("bounds department membership and requires its Lead to be a member", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const input = { action: "save_department", id, expectedRevision: 0, department: { name: " Mechanical ", memberIds: [id, id], leadId: id } };
    expect(parseProjectMutation(input)).toMatchObject({ department: { name: "Mechanical", memberIds: [id], leadId: id } });
    for (const patch of [{ name: "" }, { memberIds: null }, { memberIds: Array(501).fill(id) }, { memberIds: [null] }, { leadId: "invalid" }, { memberIds: [] }]) expect(() => parseProjectMutation({ ...input, department: { ...input.department, ...patch } })).toThrow();
  });
  it("requires project and milestone placement on saves while keeping status-only updates separate", () => {
    const projectId = "10000000-0000-4000-8000-000000000010";
    const milestoneId = "10000000-0000-4000-8000-000000000002";
    const task = { title: "Linked task", description: "", category: "production", projectId, milestoneId,
      assigneeIds: [], deadline: "2026-12-01", startDate: null, status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "" };
    const input = { action: "save_task", id: "10000000-0000-4000-8000-000000000001", expectedRevision: 1, task };
    expect(parseProjectMutation(input)).toMatchObject({ task: { projectId, milestoneId } });
    for (const milestoneId of [null, undefined, "invalid", 5, [], {}]) expect(() => parseProjectMutation({ ...input, task: { ...task, milestoneId } })).toThrow();
    expect(() => parseProjectMutation({ ...input, task: { ...task, projectId: null } })).toThrow();
    expect(() => parseProjectMutation({ ...input, task: { ...task, kind: "milestone", milestoneId } })).toThrow();
    expect(() => parseProjectMutation({ ...input, task: { ...task, kind: "milestone", milestoneId: null, projectId: null } })).toThrow();
    expect(parseProjectMutation({ ...input, task: { ...task, kind: "milestone", milestoneId: null } })).toMatchObject({ task: { projectId, milestoneId: null } });
    const status = { action: "set_status", id: input.id, expectedRevision: 1, status: "done", blockedReason: "" };
    expect(parseProjectMutation(status)).toEqual(status);
  });
  it("preserves authentication and method handling through the shared member API", async () => {
    let status = 0;
    const res = { setHeader: vi.fn(), status: (value: number) => { status = value; return res; }, json: vi.fn() };
    await memberApi({ method: "GET", query: { __module: "projects" }, headers: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(status).toBe(401);
    await memberApi({ method: "DELETE", query: { __module: "projects" }, headers: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(status).toBe(405);
    await memberApi({ method: "GET", query: {}, headers: {} } as unknown as VercelRequest, res as unknown as VercelResponse);
    expect(status).toBe(405);
  });
  it("requires bearer authentication before every read and mutation", async () => {
    const services = fixture();
    expect((await call(services)).status).toBe(401);
    expect((await call(services, { method: "POST", body: {} })).status).toBe(401);
    expect(services.load).not.toHaveBeenCalled();
    expect(services.mutate).not.toHaveBeenCalled();
  });
  it("never accepts a local fixture token as an authentication bypass", async () => {
    const services = fixture();
    services.load.mockRejectedValue(new MemberCvError(401, "Your session has expired."));
    expect((await call(services, { token: "member-local" })).status).toBe(401);
    expect(services.load).toHaveBeenCalledWith("member-local");
  });
  it("passes authenticated requests to the services and prevents HTTP caching", async () => {
    const services = fixture();
    services.load.mockResolvedValue({ season: "S27" }); services.mutate.mockResolvedValue({ tasks: [] });
    expect(await call(services, { token: "verified" })).toMatchObject({ status: 200, result: { season: "S27" }, headers: { "Cache-Control": "no-store" } });
    await call(services, { token: "verified", method: "POST", body: { action: "set_status" } });
    expect(services.mutate).toHaveBeenCalledWith("verified", { action: "set_status" });
  });
  it("maps permission and conflict failures while withholding unexpected database details", async () => {
    const services = fixture();
    for (const status of [400, 401, 403, 404, 409, 503]) {
      services.load.mockRejectedValueOnce(new MemberCvError(status, "Safe message"));
      expect((await call(services, { token: "verified" })).status).toBe(status);
    }
    services.load.mockRejectedValue(new Error("postgres://secret internal_table private-data"));
    const response = await call(services, { token: "verified" });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.result)).not.toMatch(/secret|internal_table|private-data/);
  });
  it("rejects unsupported methods and oversized bodies", async () => {
    const services = fixture();
    expect((await call(services, { method: "DELETE", token: "verified" })).status).toBe(405);
    expect((await call(services, { method: "POST", token: "verified", length: "20001" })).status).toBe(413);
    expect(services.mutate).not.toHaveBeenCalled();
  });
  it("rejects invalid actions, revisions, IDs and unbounded fields before database mutation", () => {
    const change = { action: "set_status", id: "10000000-0000-4000-8000-000000000001", expectedRevision: 1, status: "done", blockedReason: "" };
    for (const patch of [{ action: "delete_all" }, { expectedRevision: -1 }, { expectedRevision: 1.2 }, { expectedRevision: 2147483647 }, { id: "untrusted" }, { status: "admin" }, { blockedReason: "x".repeat(501) }]) {
      expect(() => parseProjectMutation({ ...change, ...patch })).toThrow();
    }
    expect(parseProjectMutation(change)).toEqual(change);
  });
});
