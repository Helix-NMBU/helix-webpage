import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSponsorHandler } from "../sponsor.js";
import { SponsorError } from "../_lib/sponsor-access.js";

function fixture() {
  const authenticate = vi.fn(async () => { throw new SponsorError(401, "Sign in to continue."); });
  const sendLink = vi.fn(async () => {});
  const handler = createSponsorHandler({ db: { query: vi.fn(async () => ({ rows: [] })) },
    access: { authenticate, mayRequestLogin: vi.fn(async () => false) },
    storage: { putPdf: async () => {}, remove: async () => {}, presign: async () => "" }, authSendLink: sendLink });
  async function call(action: unknown, options: { method?: string; origin?: string; body?: unknown } = {}) {
    let status = 0; let data: unknown; const headers: Record<string, unknown> = {};
    const response = { setHeader(name: string, value: unknown) { headers[name] = value; }, status(value: number) { status = value; return this; }, json(value: unknown) { data = value; return this; } };
    await handler({ query: { action }, headers: { host: "sponsor.example", origin: options.origin ?? "https://sponsor.example" }, method: options.method ?? "GET", body: options.body } as unknown as VercelRequest, response as unknown as VercelResponse);
    return { status, data, headers };
  }
  return { call, authenticate, sendLink };
}
describe("sponsor API composition", () => {
  it.each(["admin", "directory", "profile", "cv", "requests", "request", "session"])("denies anonymous %s access without invoking services", async (action) => {
    const f = fixture(); const result = await f.call(action);
    expect(result.status).toBe(401); expect(f.authenticate).not.toHaveBeenCalled(); expect(result.headers["Cache-Control"]).toBe("no-store");
  });
  it("rejects cross-origin changes before authentication or email delivery", async () => {
    const f = fixture();
    expect((await f.call("login", { method: "POST", origin: "https://attacker.example", body: { email: "a@example.invalid" } })).status).toBe(403);
    expect(f.sendLink).not.toHaveBeenCalled(); expect(f.authenticate).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized input and unknown action arrays", async () => {
    const f = fixture();
    expect((await f.call("requests", { method: "POST", body: "{" })).status).toBe(400);
    expect((await f.call("requests", { method: "POST", body: "x".repeat(65537) })).status).toBe(413);
    expect((await f.call(["admin", "directory"])).status).toBe(404);
  });
  it("gives an invitation-safe acknowledgement without delivering to unknown email", async () => {
    const f = fixture();
    expect((await f.call("login", { method: "POST", body: JSON.stringify({ email: "unknown@example.invalid" }) })).status).toBe(200);
    expect(f.sendLink).not.toHaveBeenCalled();
  });
});
