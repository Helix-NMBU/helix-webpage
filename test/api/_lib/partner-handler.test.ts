import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPartnerHandler } from "../../../api/_lib/partner-handler.js";
import { verifyNeonSession } from "../../../api/_lib/neon-session.js";
import { MemberCvError } from "../../../api/_lib/member-cv-error.js";
import type { PartnerServices } from "../../../api/_lib/partner-service.js";

const userId = "10000000-0000-4000-8000-000000000001";
const orgId = "20000000-0000-4000-8000-000000000001";
const memberId = "30000000-0000-4000-8000-000000000001";
const issuer = "https://partner-auth.example.test";
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let wrongKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwt: string;
const session = { user: { name: "Partner", email: "partner@example.test" }, organizations: [{ id: orgId, name: "Partner company", entitlements: { directory: true, requests: true } }] };
const services: PartnerServices = {
  requestOtp: vi.fn(async () => undefined),
  authenticate: (token) => verifyNeonSession(token),
  session: vi.fn(async () => session),
  directory: vi.fn(async () => ({ members: [] })),
  download: vi.fn(async () => ({ url: "https://storage.example.test/signed", expiresIn: 120 })),
  requests: vi.fn(async () => ({ requests: [], administrators: [] })),
  request: vi.fn(async () => ({ request: {} as never })),
  createRequest: vi.fn(async () => ({ request: {} as never })),
  mutateRequest: vi.fn(async () => ({ request: {} as never })),
};
const getServices = vi.fn(() => services);
const handler = createPartnerHandler(getServices);

async function signed(options: { issuer?: string; audience?: string; sub?: string; expiry?: number; key?: CryptoKey } = {}) {
  return new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "partner-tests" })
    .setSubject(options.sub ?? userId).setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? issuer)
    .setIssuedAt().setExpirationTime(options.expiry ?? Math.floor(Date.now() / 1000) + 300)
    .sign(options.key ?? keys.privateKey);
}
async function request(query: Record<string, unknown> = {}, authorization: string | undefined = `Bearer ${jwt}`, method = "GET", inputBody?: unknown, extraHeaders: Record<string, string | undefined> = {}) {
  let status = 0;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = { setHeader: (key: string, value: string) => { headers[key] = value; },
    status: (value: number) => { status = value; return res; }, json: (value: unknown) => { body = value; return res; } };
  await handler({ method, headers: { authorization, ...extraHeaders }, query, body: inputBody } as VercelRequest, res as unknown as VercelResponse);
  return { status, body, headers };
}

describe("partner endpoint with real signed Neon token verification", () => {
  beforeAll(async () => {
    keys = await generateKeyPair("EdDSA");
    wrongKeys = await generateKeyPair("EdDSA");
    const publicKey = { ...await exportJWK(keys.publicKey), kid: "partner-tests", alg: "EdDSA", use: "sig" };
    vi.stubEnv("NEON_AUTH_BASE_URL", `${issuer}/neondb/auth`);
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      expect(String(url)).toBe(`${issuer}/neondb/auth/.well-known/jwks.json`);
      return Response.json({ keys: [publicKey] });
    }));
    jwt = await signed();
  });
  beforeEach(() => { vi.clearAllMocks(); });
  afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(["", "Basic bad", "Bearer bad token", "Bearer forged", "Bearer e30.e30.e30"])("refuses absent or invalid authentication: %s", async (authorization) => {
    expect((await request({}, authorization)).status).toBe(401);
    expect(services.session).not.toHaveBeenCalled();
    expect(services.directory).not.toHaveBeenCalled();
  });
  it("rejects cookie-only authentication before opening the database", async () => {
    expect((await request({}, "")).status).toBe(401);
    expect(getServices).not.toHaveBeenCalled();
  });
  it.each([
    { issuer: "https://untrusted.example.test" },
    { audience: "different-audience" },
    { expiry: 1 },
    { sub: "not-a-uuid" },
  ])("rejects incorrect JWT claims: %j", async (options) => {
    expect((await request({}, `Bearer ${await signed(options)}`)).status).toBe(401);
    expect(services.session).not.toHaveBeenCalled();
  });
  it("rejects a forged signature", async () => {
    expect((await request({}, `Bearer ${await signed({ key: wrongKeys.privateKey })}`)).status).toBe(401);
    expect(services.session).not.toHaveBeenCalled();
  });
  it("uses the verified subject rather than a submitted identity", async () => {
    const result = await request({ action: "session", userId: memberId, email: "admin@example.test" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual(session);
    expect(services.session).toHaveBeenCalledExactlyOnceWith(userId);
    expect(result.headers["Cache-Control"]).toContain("no-store");
    expect(result.headers.Vary).toBe("Authorization");
  });
  it("uses explicit organization and member identifiers for directory/download authorization", async () => {
    expect((await request({ action: "directory", organizationId: orgId })).status).toBe(200);
    expect(services.directory).toHaveBeenCalledWith(userId, orgId);
    expect((await request({ action: "download", organizationId: orgId, memberId, path: "forged.pdf" })).status).toBe(200);
    expect(services.download).toHaveBeenCalledWith(userId, orgId, memberId);
  });
  it("routes partner request reads and writes through the verified user and explicit organization", async () => {
    const requestId = "40000000-0000-4000-8000-000000000001";
    expect((await request({ action: "requests", organizationId: orgId })).status).toBe(200);
    expect(services.requests).toHaveBeenCalledWith(userId, orgId);
    expect((await request({ action: "request", organizationId: orgId, id: requestId })).status).toBe(200);
    expect(services.request).toHaveBeenCalledWith(userId, orgId, requestId);
    expect((await request({ action: "requests" }, `Bearer ${jwt}`, "POST", { organizationId: orgId, type: "recruitment", title: "Hiring", body: "We are hiring." })).status).toBe(201);
    expect(services.createRequest).toHaveBeenCalledWith(userId, orgId, { type: "recruitment", title: "Hiring", body: "We are hiring." });
    expect((await request({ action: "request" }, `Bearer ${jwt}`, "POST", { organizationId: orgId, id: requestId, expectedRevision: 0, operation: "reply", body: "Thanks" })).status).toBe(200);
    expect(services.mutateRequest).toHaveBeenCalledWith(userId, orgId, requestId, { organizationId: orgId, id: requestId, expectedRevision: 0, operation: "reply", body: "Thanks" });
  });
  it.each([
    { action: "requests" }, { action: "requests", organizationId: "bad" },
    { action: "request", organizationId: orgId }, { action: "request", organizationId: orgId, id: "bad" },
  ])("rejects request reads without valid organization and request identifiers: %j", async (query) => {
    expect((await request(query)).status).toBe(400);
    expect(services.requests).not.toHaveBeenCalled();
    expect(services.request).not.toHaveBeenCalled();
  });
  it.each([
    { action: "directory" }, { action: "directory", organizationId: "bad" },
    { action: "download", organizationId: orgId, memberId: [memberId] }, { action: ["session"] }, { action: "create-partner" },
  ])("rejects malformed actions or identifiers: %j", async (query) => {
    expect((await request(query)).status).toBe(400);
    expect(services.session).not.toHaveBeenCalled();
    expect(services.directory).not.toHaveBeenCalled();
    expect(services.download).not.toHaveBeenCalled();
  });
  it("preserves access denials and hides database errors", async () => {
    vi.mocked(services.session).mockRejectedValueOnce(new MemberCvError(403, "Partner access denied."));
    expect(await request()).toMatchObject({ status: 403, body: { error: "Partner access denied." } });
    vi.mocked(services.session).mockRejectedValueOnce(new Error("secret-database-host"));
    const result = await request();
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("secret-database-host");
  });
  it("provides no provisioning mutation endpoint", async () => {
    expect(await request({ action: "invite" }, "", "POST")).toMatchObject({ status: 400 });
    expect(getServices).not.toHaveBeenCalled();
  });
  it.each(["PUT", "DELETE", "PATCH"])("rejects unsupported method %s", async (method) => {
    expect(await request({}, "", method)).toMatchObject({ status: 405, headers: { Allow: "GET, POST" } });
    expect(getServices).not.toHaveBeenCalled();
  });
  it("requests OTP through the server gate without accepting a caller's identity or exposing invitation details", async () => {
    const result = await request({ action: "request-otp" }, "", "POST", { email: " Partner@Example.Test ", userId: memberId, organizationId: orgId },
      { origin: "http://localhost:5190", host: "localhost:5190" });
    expect(result).toMatchObject({ status: 202, body: { message: "If your email can sign in, a code will arrive shortly." } });
    expect(services.requestOtp).toHaveBeenCalledExactlyOnceWith("partner@example.test", "http://localhost:5190");
    expect(services.session).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toMatch(/partner@example|organization|invited|active/);
  });
  it.each([{}, { email: ["partner@example.test"] }, { email: "bad" }, { email: "a".repeat(255) }, { email: "a@b.test\nBcc: other@example.test" }])(
    "rejects malformed OTP input before looking up invitations: %j", async (body) => {
      expect((await request({ action: "request-otp" }, "", "POST", body, { origin: "http://localhost:5190", host: "localhost:5190" })).status).toBe(400);
      expect(getServices).not.toHaveBeenCalled();
    });
  it.each([{}, { origin: "https://attacker.test", host: "localhost:5190" }, { "sec-fetch-site": "cross-site", host: "localhost:5190" }])(
    "rejects cross-site and originless OTP requests: %j", async (headers) => {
      expect((await request({ action: "request-otp" }, "", "POST", { email: "partner@example.test" }, headers)).status).toBe(403);
      expect(getServices).not.toHaveBeenCalled();
    });
});
