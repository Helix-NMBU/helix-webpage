import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createSponsorAuthHandler, sendSponsorMagicLink, sponsorCallback } from "../../../api/_lib/sponsor-auth.js";
import { SponsorError, type SponsorAccess } from "../../../api/_lib/sponsor-access.js";
import { proxyNeonAuth } from "../../../api/_lib/auth-proxy.js";

function fixture(invited = true) {
  const access: SponsorAccess = { mayRequestLogin: vi.fn(async () => invited), authenticate: vi.fn(async () => { throw new SponsorError(403, "Invitation revoked."); }) };
  const sendLink = vi.fn(async () => undefined);
  const handler = createSponsorAuthHandler(() => access, { sendLink });
  async function call(input: { method?: string; action?: string; body?: unknown; origin?: string } = {}) {
    let status: number | undefined; let body: unknown; const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => { headers[name] = value; }, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { body = value; return res; } };
    await handler({ method: input.method ?? "POST", query: { action: input.action ?? "login" }, headers: { host: "sponsor.example", origin: input.origin ?? "https://sponsor.example", authorization: "Bearer token" }, body: input.body ?? { email: "Contact@Example.com", callbackURL: "https://attacker.example/" } } as unknown as VercelRequest, res as unknown as VercelResponse);
    return { status, body, headers };
  }
  return { access, sendLink, call };
}

describe("invitation-gated managed email login", () => {
  it("normalizes invited email and gives the same response for unknown addresses", async () => {
    const invited = fixture(); const unknown = fixture(false);
    expect(await invited.call()).toEqual(await unknown.call());
    expect(invited.sendLink).toHaveBeenCalledWith("contact@example.com");
    expect(unknown.sendLink).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests, malformed emails, methods and raw malformed JSON", async () => {
    const f = fixture();
    expect((await f.call({ origin: "https://attacker.example" })).status).toBe(403);
    expect((await f.call({ body: { email: "invalid" } })).status).toBe(400);
    expect((await f.call({ body: "{" })).status).toBe(400);
    expect((await f.call({ method: "GET" })).status).toBe(405);
    expect(f.sendLink).not.toHaveBeenCalled();
  });
  it("checks the current session server-side and preserves revoked-access status", async () => {
    const f = fixture();
    const result = await f.call({ method: "GET", action: "session" });
    expect(result).toMatchObject({ status: 403, body: { error: "Invitation revoked." }, headers: { "Cache-Control": "no-store" } });
    expect(f.access.authenticate).toHaveBeenCalledWith("token");
  });
  it("fixes every callback to configured HTTPS origin and does not expose provider tokens", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ token: "secret-token" }));
    await expect(sendSponsorMagicLink("contact@example.com", {
      env: { SPONSOR_PORTAL_ORIGIN: "https://sponsor.example", NEON_AUTH_BASE_URL: "https://auth.example/neondb/auth" }, fetchImpl: request,
    })).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith("https://auth.example/neondb/auth/sign-in/magic-link", expect.objectContaining({
      method: "POST", redirect: "error", body: JSON.stringify({ email: "contact@example.com", callbackURL: "https://sponsor.example/sponsor", newUserCallbackURL: "https://sponsor.example/sponsor", errorCallbackURL: "https://sponsor.example/sponsor/login" }),
    }));
    expect(() => sponsorCallback("http://sponsor.example")).toThrow();
    expect(() => sponsorCallback("https://user:password@sponsor.example")).toThrow();
    expect(() => sponsorCallback("https://sponsor.example/path")).toThrow();
    await expect(sendSponsorMagicLink("contact@example.com", { env: { SPONSOR_PORTAL_ORIGIN: "https://sponsor.example", NEON_AUTH_BASE_URL: "https://auth.example/neondb/auth" }, fetchImpl: async () => Response.json({ token: "secret-token" }, { status: 400 }) })).rejects.toMatchObject({ status: 503, message: "Could not request a sign-in link. Try again shortly." });
  });
  it.each(["/api/auth/sign-in/magic-link", "/api/auth/sign-in/%6dagic-link", "/api/auth?__path=sign-in%2Fmagic-link"]) ("denies proxy bypass at %s", async rawUrl => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    const response = await proxyNeonAuth({ rawUrl, method: "POST", headers: { host: "sponsor.example", origin: "https://sponsor.example" }, baseUrl: "https://auth.example/neondb/auth", body: JSON.stringify({ email: "unknown@example.com" }), fetchImpl });
    expect([400, 403]).toContain(response.status);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
