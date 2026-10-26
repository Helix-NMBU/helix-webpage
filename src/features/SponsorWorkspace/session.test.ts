import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sponsorToken } from "./session";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const jwt = (sub: string) => `header.${btoa(JSON.stringify({ sub }))}.signature`;

describe("sponsor session guard with the installed Neon SDK", () => {
  it("uses the SDK magic-link endpoint with the expected method and fields", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ status: true }));
    vi.stubGlobal("fetch", request);
    const client = createAuthClient("https://auth.example/neondb/auth", { adapter: BetterAuthVanillaAdapter() });
    await client.signIn.magicLink({ email: "contact@example.com", callbackURL: "https://sponsor.example/sponsor" });
    expect(new URL(String(request.mock.calls[0][0])).pathname).toBe("/neondb/auth/sign-in/magic-link");
    expect(request.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ email: "contact@example.com", callbackURL: "https://sponsor.example/sponsor" });
  });
  it("forces fresh SDK reads and refuses an account switch before requesting a token", async () => {
    vi.stubGlobal("window", { location: { href: "https://sponsor.example/sponsor", origin: "https://sponsor.example", search: "" } });
    let user = "account-a";
    const request = vi.fn<typeof fetch>(async (input) => {
      expect(new URL(String(input)).pathname).toBe("/api/auth/get-session");
      return Response.json({ user: { id: user }, session: { userId: user } });
    });
    vi.stubGlobal("fetch", request);
    const tokenRequest = vi.fn<typeof fetch>(async () => Response.json({ token: jwt(user) }));
    const client = createAuthClient("https://sponsor.example/api/auth", { adapter: BetterAuthVanillaAdapter() });
    expect(await sponsorToken("account-a", client, tokenRequest)).toBe(jwt("account-a"));
    user = "account-b";
    await expect(sponsorToken("account-a", client, tokenRequest)).rejects.toMatchObject({ status: 401 });
    expect(tokenRequest).toHaveBeenCalledTimes(1);
  });
  it("rejects a token/session subject mismatch and preserves transient recovery", async () => {
    const client = { getSession: vi.fn(async () => ({ data: { user: { id: "account-a" } } })), signOut: vi.fn(async () => ({})) };
    await expect(sponsorToken("account-a", client, async () => Response.json({ token: jwt("account-b") }))).rejects.toMatchObject({ status: 401 });
    client.getSession.mockRejectedValueOnce({ status: 503 });
    await expect(sponsorToken("account-a", client)).rejects.toMatchObject({ status: 503 });
    expect(await sponsorToken("account-a", client, async () => Response.json({ token: jwt("account-a") }))).toBe(jwt("account-a"));
  });
  it.each([401, 403])("treats SDK-thrown %s as ended access", async status => {
    const client = { getSession: vi.fn(async () => { throw { status }; }), signOut: vi.fn(async () => ({})) };
    await expect(sponsorToken("account-a", client)).rejects.toMatchObject({ status });
  });
});
