import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { TokenPayload } from "google-auth-library";
import type { User } from "@supabase/supabase-js";
import { createMemberLoginHandler, type MemberLoginServices } from "./member-login.js";
import { matchesGoogleUser } from "./_lib/member-cv-service.js";

const valid = { iss: "https://accounts.google.com", aud: "server-client", exp: 200, iat: 50, sub: "google-ase", hd: "helixnmbu.no", email: "ase@helixnmbu.no", email_verified: true, name: "Åse" } satisfies TokenPayload;
const user: User = { id: "member-id", email: valid.email, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-10-06", identities: [{ id: "google-ase", user_id: "member-id", identity_id: "identity-id", provider: "google", identity_data: { sub: valid.sub } }] };
function fixture(payload = valid as TokenPayload) {
  const services: MemberLoginServices = { audience: "server-client", now: () => 100, verify: vi.fn(async () => payload), exchange: vi.fn(async () => ({ access_token: "access", refresh_token: "refresh", user })), onboard: vi.fn(async () => {}) };
  const handler = createMemberLoginHandler(() => services);
  async function request(body: unknown = { credential: "google-credential" }, method = "POST") {
    let status: number | undefined;
    let result: unknown;
    const res = { setHeader: vi.fn(), status: (code: number) => { status = code; return res; }, json: (value: unknown) => { result = value; return res; } };
    await handler({ method, body } as VercelRequest, res as unknown as VercelResponse);
    return { status, result };
  }
  return { services, request };
}
describe("server verified Google onboarding", () => {
  it("creates a private first-login account without requesting allowlist/admin access", async () => {
    const f = fixture();
    expect(await f.request()).toEqual({ status: 200, result: { access_token: "access", refresh_token: "refresh" } });
    expect(f.services.verify).toHaveBeenCalledWith("google-credential");
    expect(f.services.exchange).toHaveBeenCalledWith("google-credential");
    expect(f.services.onboard).toHaveBeenCalledWith({ userId: user.id, googleSub: valid.sub, email: valid.email, name: "Åse" });
  });
  it.each([
    [{ ...valid, hd: "gmail.com" }, 403],
    [{ ...valid, hd: undefined }, 403],
    [{ ...valid, email: "ase@gmail.com" }, 403],
    [{ ...valid, email_verified: false }, 403],
    [{ ...valid, aud: "other-client" }, 401],
    [{ ...valid, exp: 100 }, 401],
    [{ ...valid, iss: "evil.example" }, 401],
    [{ ...valid, sub: "" }, 401],
  ])("rejects invalid identity %# before Supabase exchange", async (payload, status) => {
    const f = fixture(payload as TokenPayload);
    expect((await f.request()).status).toBe(status);
    expect(f.services.exchange).not.toHaveBeenCalled();
    expect(f.services.onboard).not.toHaveBeenCalled();
  });
  it("rejects forged or invalid-signature credentials", async () => {
    const f = fixture();
    vi.mocked(f.services.verify).mockRejectedValue(new Error("Signature invalid"));
    expect((await f.request()).status).toBe(401);
    expect(f.services.onboard).not.toHaveBeenCalled();
  });
  it("rejects Supabase account identity mismatch rather than binding another account", async () => {
    const f = fixture();
    vi.mocked(f.services.exchange).mockResolvedValue({ access_token: "access", refresh_token: "refresh", user: { ...user, identities: [{ ...user.identities![0], identity_data: { sub: "different-sub" } }] } });
    expect((await f.request()).status).toBe(403);
    expect(f.services.onboard).not.toHaveBeenCalled();
  });
  it("does not authenticate client-controlled Google-looking metadata", () => {
    const forged = { id: user.id, email: valid.email, user_metadata: { hd: "helixnmbu.no", sub: valid.sub, email_verified: true } };
    expect(matchesGoogleUser(forged, { userId: user.id, googleSub: valid.sub, email: valid.email, name: "Åse" })).toBe(false);
  });
  it("uses generic server failure text without exposing secrets", async () => {
    const f = fixture();
    vi.mocked(f.services.onboard).mockRejectedValue(new Error("service-role-secret internal SQL"));
    expect(await f.request()).toEqual({ status: 503, result: { error: "Member sign-in is temporarily unavailable. Try again." } });
  });
  it("rejects malformed credentials and unsupported methods", async () => {
    const f = fixture();
    expect((await f.request({ credential: "x".repeat(16001) })).status).toBe(400);
    expect((await f.request({}, "GET")).status).toBe(405);
    expect(f.services.verify).not.toHaveBeenCalled();
  });
});
