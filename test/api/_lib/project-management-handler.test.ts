import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createProjectHandler } from "../../../api/_lib/project-management-handler.js";
import { MemberCvError } from "../../../api/_lib/member-cv-error.js";
import type { ProjectServices } from "../../../api/_lib/project-management-service.js";
import { parseProjectMutation } from "../../../api/_lib/project-management-validation.js";

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
