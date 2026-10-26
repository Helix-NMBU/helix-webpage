import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import memberApi from "../../../api/member-login.js";
import { createWorkspaceHandler } from "../../../api/_lib/workspace-handler.js";
import { parseMemberChange } from "../../../api/_lib/workspace-service.js";
import { MemberCvError } from "../../../api/_lib/member-cv-error.js";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memberChange = () => ({
  action: "save_member",
  id: id(1),
  expectedRevision: 1,
  name: " Member ",
  helixRole: " Engineer ",
  departments: Array.from({ length: 7 }, (_, i) => ({
    id: id(i + 2),
    revision: 1,
    member: false,
    lead: false,
  })),
});
const fixture = () => ({ load: vi.fn(), mutate: vi.fn() });
async function call(
  services: ReturnType<typeof fixture>,
  method = "GET",
  token = "verified",
  body?: unknown,
  length?: number,
) {
  let status = 0;
  let result: unknown;
  const headers: Record<string, unknown> = {};
  const res = {
    setHeader: (key: string, value: unknown) => {
      headers[key] = value;
    },
    status: (value: number) => {
      status = value;
      return res;
    },
    json: (value: unknown) => {
      result = value;
      return res;
    },
  };
  await createWorkspaceHandler(() => services)(
    {
      method,
      body,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(length ? { "content-length": String(length) } : {}),
      },
    } as VercelRequest,
    res as unknown as VercelResponse,
  );
  return { status, result, headers };
}
describe("workspace request boundary", () => {
  it("routes department reads and settings without exposing them in the directory payload", async () => {
    const services = fixture();
    const department = {
      load: vi.fn().mockResolvedValue({ departmentId: id(1), revision: 0 }),
      save: vi.fn().mockResolvedValue({ departmentId: id(1), revision: 1 }),
    };
    let status = 0;
    let body: unknown;
    const res = {
      setHeader: () => undefined,
      status: (value: number) => {
        status = value;
        return res;
      },
      json: (value: unknown) => {
        body = value;
        return res;
      },
    };
    const handler = createWorkspaceHandler(
      () => services,
      () => department,
    );
    await handler(
      {
        method: "GET",
        query: { department: id(1) },
        headers: { authorization: "Bearer verified" },
      } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );
    expect(department.load).toHaveBeenCalledWith("verified", id(1));
    expect(status).toBe(200);
    expect(body).toMatchObject({ revision: 0 });
    expect(services.load).not.toHaveBeenCalled();
    await handler(
      {
        method: "POST",
        query: { department: id(1) },
        body: { action: "save_department_home" },
        headers: { authorization: "Bearer verified" },
      } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );
    expect(department.save).toHaveBeenCalledWith("verified", {
      action: "save_department_home",
    });
    expect(body).toMatchObject({ revision: 1 });
    expect(services.mutate).not.toHaveBeenCalled();
  });

  it("routes the workspace module through the existing member function", async () => {
    let status = 0;
    const res = {
      setHeader: () => undefined,
      status: (value: number) => {
        status = value;
        return res;
      },
      json: () => res,
    };
    await memberApi(
      {
        method: "GET",
        query: { __module: "workspace" },
        headers: {},
      } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );
    expect(status).toBe(401);
  });
  it("requires authentication and never caches directory responses", async () => {
    const services = fixture();
    const result = await call(services, "GET", "");
    expect(result.status).toBe(401);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(services.load).not.toHaveBeenCalled();
  });
  it("reads and mutates only through the authenticated service", async () => {
    const services = fixture();
    services.load.mockResolvedValue({ members: [] });
    expect((await call(services)).result).toEqual({ members: [] });
    expect(services.load).toHaveBeenCalledWith("verified");
    services.mutate.mockRejectedValue(new MemberCvError(403, "Only admins"));
    expect(
      (await call(services, "POST", "verified", memberChange())).status,
    ).toBe(403);
  });
  it("rejects unsupported methods and oversized mutation bodies", async () => {
    const services = fixture();
    expect((await call(services, "DELETE")).status).toBe(405);
    expect((await call(services, "POST", "verified", {}, 20001)).status).toBe(
      413,
    );
    expect(services.mutate).not.toHaveBeenCalled();
  });
  it("returns a generic message for unexpected failures", async () => {
    const services = fixture();
    services.load.mockRejectedValue(new Error("private connection string"));
    const result = await call(services);
    expect(result.status).toBe(503);
    expect(JSON.stringify(result)).not.toContain("private connection");
  });
  it("validates member fields, department revisions, and Lead membership", () => {
    const input = memberChange();
    expect(
      parseMemberChange({ ...input, role: "Admin", email: "ignored" }),
    ).toEqual({ ...input, name: "Member", helixRole: "Engineer" });
    for (const patch of [
      { id: "invalid" },
      { expectedRevision: 0 },
      { name: "" },
      { name: "x".repeat(161) },
      { helixRole: 12 },
      { departments: [] },
      { departments: input.departments.map((d) => ({ ...d, lead: true })) },
      { departments: input.departments.map((d) => ({ ...d, revision: 0 })) },
      { departments: Array(7).fill(input.departments[0]) },
    ])
      expect(() => parseMemberChange({ ...input, ...patch })).toThrow();
  });
});
