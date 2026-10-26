import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createWebsiteHandler } from "../../../api/_lib/website-handler.js";
import type { WebsiteServices } from "../../../api/_lib/website-service.js";
import { MemberCvError } from "../../../api/_lib/member-cv-error.js";

const id = "10000000-0000-4000-8000-000000000001";
function fixture() {
  const services: WebsiteServices = {
    positions: vi.fn(async () => [{ id: "software", title: "Software Engineer", department: "Software", tasks: ["Build"], applyUrl: "", about: "Join", achieve: [], contact: { name: "Recruiter", email: "test@example.test" } }]),
    savePosition: vi.fn(), managedPositions: vi.fn(async () => []), createPosition: vi.fn(), updatePosition: vi.fn(), setPositionVisibility: vi.fn(), deletePosition: vi.fn(),
    submit: vi.fn(async () => ({ id, emailStatus: "skipped" as const })),
    session: vi.fn(), list: vi.fn(), read: vi.fn(), file: vi.fn(), remove: vi.fn(), confirmation: vi.fn(),
  };
  return { services, get: vi.fn(() => services) };
}
async function call(handler: ReturnType<typeof createWebsiteHandler>, args: { method?: string; query?: object; body?: unknown; token?: string; length?: string; ip?: string; headers?: Record<string, string> }) {
  let status = 0; let result: unknown;
  const headers: Record<string, unknown> = {};
  const res = { setHeader: vi.fn((key: string, value: unknown) => { headers[key] = value; }),
    status: vi.fn((code: number) => { status = code; return res; }), json: vi.fn((body: unknown) => { result = body; return res; }) };
  const req = { method: args.method ?? "GET", query: args.query ?? {}, body: args.body,
    headers: { ...args.headers, ...(args.token ? { authorization: `Bearer ${args.token}` } : {}), ...(args.length ? { "content-length": args.length } : {}), ...(args.ip ? { "x-forwarded-for": args.ip } : {}) } };
  await handler(req as VercelRequest, res as unknown as VercelResponse);
  return { status, result, headers };
}
describe("website HTTP boundaries", () => {
  it("serves public positions without discarding the static fields", async () => {
    const f = fixture(); const r = await call(createWebsiteHandler(f.get), { query: { action: "positions" } });
    expect(r.status).toBe(200); expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.result).toMatchObject({ positions: [{ tasks: ["Build"], applyUrl: "", about: "Join", achieve: [], contact: { name: "Recruiter", email: "test@example.test" } }] });
    expect(f.services.session).not.toHaveBeenCalled();
  });
  it("passes a keyed digest of Vercel's client IP to anonymous application submissions", async () => {
    const f = fixture();
    const previous = process.env.DATABASE_URL;
    const secret = "postgres://server-secret@example.test/db";
    process.env.DATABASE_URL = secret;
    try {
      const response = await call(createWebsiteHandler(f.get), { method: "POST", ip: "203.0.113.9", body: { action: "submit" } });
      expect(response.status).toBe(201);
      expect(f.services.submit).toHaveBeenCalledWith({ action: "submit" }, createHmac("sha256", secret).update("203.0.113.9").digest("hex"));
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
  it("does not accept public submissions without a trusted client address outside local development", async () => {
    const f = fixture();
    const previousEnvironment = process.env.HELIX_ENVIRONMENT;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.HELIX_ENVIRONMENT;
    process.env.DATABASE_URL = "postgres://server-secret@example.test/db";
    try {
      const response = await call(createWebsiteHandler(f.get), { method: "POST", body: { action: "submit" } });
      expect(response.status).toBe(503);
      expect(f.services.submit).not.toHaveBeenCalled();
    } finally {
      if (previousEnvironment === undefined) delete process.env.HELIX_ENVIRONMENT;
      else process.env.HELIX_ENVIRONMENT = previousEnvironment;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
  it("rejects anonymous direct reads, signed downloads, deletions and rejection/confirmation requests", async () => {
    const f = fixture(); const handler = createWebsiteHandler(f.get);
    for (const action of ["session", "applications", "application", "file"]) {
      expect((await call(handler, { query: { action, id, kind: "cv" } })).status).toBe(401);
    }
    for (const action of ["delete", "reject", "confirmation"]) {
      expect((await call(handler, { method: "POST", body: { action, application_id: id } })).status).toBe(401);
    }
    expect(f.get).not.toHaveBeenCalled();
  });
  it("cannot override either fixed legacy endpoint to submit or send to supplied email details", async () => {
    const f = fixture();
    for (const action of ["reject", "confirmation"] as const) {
      const handler = createWebsiteHandler(f.get, action);
      expect((await call(handler, { method: "POST", body: { action: "submit", application_id: id, to_email: "attacker@example.test" } })).status).toBe(401);
      expect((await call(handler, { query: { action: "positions" } })).status).toBe(405);
    }
    expect(f.services.submit).not.toHaveBeenCalled(); expect(f.services.remove).not.toHaveBeenCalled();
  });
  it("passes only the application ID and server-checked member token to rejection", async () => {
    const f = fixture(); vi.mocked(f.services.remove).mockResolvedValue({ emailStatus: "skipped", cleanupPending: false });
    const response = await call(createWebsiteHandler(f.get, "reject"), { method: "POST", token: "jwt", body: {
      application_id: id, to_email: "forged@example.test", cv_path: "another/file.pdf", applicant_name: "Forged",
    } });
    expect(response.status).toBe(200); expect(f.services.remove).toHaveBeenCalledExactlyOnceWith("jwt", id, true);
  });
  it("routes rewritten rejection and confirmation URLs through query actions and keeps them POST-only", async () => {
    const f = fixture(); const handler = createWebsiteHandler(f.get);
    const reject = await call(handler, { method: "POST", query: { action: "reject" }, token: "jwt", body: { application_id: id } });
    const confirmation = await call(handler, { method: "POST", query: { action: "confirmation" }, token: "jwt", body: { application_id: id } });
    expect(reject.status).toBe(200);
    expect(f.services.remove).toHaveBeenCalledExactlyOnceWith("jwt", id, true);
    expect(confirmation.status).toBe(200);
    expect(f.services.confirmation).toHaveBeenCalledExactlyOnceWith("jwt", id);
    expect((await call(handler, { query: { action: "reject" } })).status).toBe(405);
    expect((await call(handler, { query: { action: "confirmation" } })).status).toBe(405);
  });
  it("returns access denials without a successful response or leaking server error details", async () => {
    const f = fixture(); vi.mocked(f.services.list).mockRejectedValueOnce(new MemberCvError(403, "Recruiter access required."));
    expect((await call(createWebsiteHandler(f.get), { token: "jwt", query: { action: "applications" } })).status).toBe(403);
    vi.mocked(f.services.list).mockRejectedValueOnce(new Error("secret connection string"));
    expect(await call(createWebsiteHandler(f.get), { token: "jwt", query: { action: "applications" } })).toMatchObject({ status: 503, result: { error: "The application service is temporarily unavailable. Please try again." } });
  });
  it("bounds request bodies and rejects invalid JSON/IDs/pages before accessing protected data", async () => {
    const f = fixture(); const handler = createWebsiteHandler(f.get);
    expect((await call(handler, { method: "POST", length: "4500000", body: {} })).status).toBe(413);
    expect((await call(handler, { method: "POST", body: "x".repeat(800000) })).status).toBe(413);
    expect((await call(handler, { method: "POST", body: "{" })).status).toBe(400);
    expect((await call(handler, { token: "jwt", query: { action: "applications", offset: ["0", "100"] } })).status).toBe(400);
    expect((await call(handler, { token: "jwt", query: { action: "file", id: "invalid", kind: "cv" } })).status).toBe(400);
    expect((await call(handler, { method: "DELETE" })).status).toBe(405);
    expect(f.services.submit).not.toHaveBeenCalled(); expect(f.services.file).not.toHaveBeenCalled(); expect(f.services.list).not.toHaveBeenCalled();
  });
});


describe("public website cross-origin access", () => {
  it("permits only the two public Helix origins to preflight JSON submissions", async () => {
    const f = fixture(); const handler = createWebsiteHandler(f.get);
    for (const origin of ["https://helixnmbu.no", "https://www.helixnmbu.no"]) {
      const r = await call(handler, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
      expect(r.status).toBe(200); expect(r.headers["Access-Control-Allow-Origin"]).toBe(origin);
      expect(r.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
    }
    for (const origin of ["https://attacker.test", "https://www.helixnmbu.no.attacker.test", "http://www.helixnmbu.no"]) {
      const r = await call(handler, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } });
      expect(r.status).toBe(403); expect(r.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    }
    expect(f.get).not.toHaveBeenCalled();
  });
  it("does not enable cross-origin authorization or protected member actions", async () => {
    const f = fixture(); const handler = createWebsiteHandler(f.get);
    const headers = { origin: "https://www.helixnmbu.no" };
    expect((await call(handler, { method: "OPTIONS", headers: { ...headers, "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } })).status).toBe(403);
    expect((await call(handler, { headers, token: "jwt", query: { action: "applications" } })).status).toBe(403);
    expect((await call(handler, { headers, token: "jwt", method: "POST", body: { action: "delete", application_id: id } })).status).toBe(403);
    expect(f.get).not.toHaveBeenCalled();
    const catalog = await call(handler, { headers, query: { action: "positions" } });
    expect(catalog.status).toBe(200); expect(catalog.headers["Access-Control-Allow-Origin"]).toBe(headers.origin);
  });
});
