import { describe, expect, it, vi } from "vitest";
import type { VercelResponse } from "@vercel/node";
import { isForwardedAuthCookie, proxyNeonAuth, sendAuthProxyResponse } from "./auth-proxy.js";

const BASE = "https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth";

function upstreamResponse(init: {
  status?: number;
  headers?: Headers;
  body?: string;
} = {}) {
  return new Response(init.body ?? "", {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

function mockFetch(response = upstreamResponse()) {
  return vi.fn(async (_input: string | URL, _init?: RequestInit) => response);
}

async function call(
  rawUrl: string,
  headers: Record<string, string>,
  fetchImpl = mockFetch(),
) {
  const response = await proxyNeonAuth({
    method: "POST",
    rawUrl,
    headers,
    body: "{\"provider\":\"google\"}",
    baseUrl: BASE,
    fetchImpl,
  });
  return { response, fetchImpl };
}

describe("Neon auth proxy", () => {
  it("drops X-Forwarded-* and any header that is not allowlisted", async () => {
    const { fetchImpl } = await call("/api/auth/sign-in/social", {
      "user-agent": "helix-test",
      authorization: "Bearer member-token",
      referer: "https://helix.example/member/login",
      "content-type": "application/json",
      "x-neon-client-info": "sdk=test",
      origin: "https://helix.example",
      host: "helix.example",
      "x-forwarded-host": "helix.example",
      "x-forwarded-for": "203.0.113.5",
      "x-forwarded-proto": "https",
      "x-request-id": "not-allowlisted",
      cookie: "_vercel_jwt=preview-secret; theme=dark",
    });
    const init = fetchImpl.mock.calls[0][1];
    if (!init?.headers) throw new Error("missing upstream headers");
    const sent = init.headers as Headers;
    expect(init.redirect).toBe("manual");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/sign-in/social`);
    expect(sent.get("user-agent")).toBe("helix-test");
    expect(sent.get("authorization")).toBe("Bearer member-token");
    expect(sent.get("origin")).toBe("https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech");
    for (const name of ["x-forwarded-host", "x-forwarded-for", "x-forwarded-proto", "host", "x-request-id", "cookie"]) {
      expect(sent.get(name)).toBeNull();
    }
    expect(sent.get("origin")).not.toBe("https://helix.example");
  });

  it("forwards only Neon Auth cookies", async () => {
    const { fetchImpl } = await call("/api/auth/get-session", {
      cookie: [
        "_vercel_jwt=preview-secret",
        "theme=dark",
        "__Secure-neon-auth.session_token=session-value",
        "__Secure-better-auth.oauth_state=pkce-state",
        "better-auth.session_data.0=chunk",
        "neon-auth.not-a-session=nope",
      ].join("; "),
    });
    const sent = fetchImpl.mock.calls[0][1]?.headers as Headers;
    expect(sent.get("cookie")).toBe([
      "__Secure-neon-auth.session_token=session-value",
      "__Secure-better-auth.oauth_state=pkce-state",
      "better-auth.session_data.0=chunk",
    ].join("; "));
    expect(isForwardedAuthCookie("_vercel_jwt")).toBe(false);
  });

  it("returns both set-cookie headers without Domain and rewrites the Neon path", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "__Secure-neon-auth.session_token=abc; Domain=neon.tech; Path=/neondb/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=604800");
    headers.append("set-cookie", "__Secure-better-auth.oauth_state=def; Domain=.neon.tech; Path=/neondb/auth/callback; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 21 Oct 2026 07:28:00 GMT");
    headers.set("set-auth-jwt", "signed-jwt");
    const fetchImpl = mockFetch(upstreamResponse({ headers, body: "{\"ok\":true}" }));
    const { response } = await call("/api/auth/get-session", {}, fetchImpl);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toEqual([
      "__Secure-neon-auth.session_token=abc; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=604800",
      "__Secure-better-auth.oauth_state=def; Path=/api/auth/callback; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
    ]);
    expect(cookies.join("\n")).not.toMatch(/domain=/i);
    expect(response.headers.get("set-auth-jwt")).toBe("signed-jwt");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const written: Array<[string, string | string[]]> = [];
    const res = {
      status: vi.fn(),
      setHeader: vi.fn((name: string, value: string | string[]) => { written.push([name, value]); }),
      send: vi.fn(),
    };
    await sendAuthProxyResponse(res as unknown as VercelResponse, response);
    expect(written.find(([name]) => name.toLowerCase() === "set-cookie")?.[1]).toEqual(cookies);
  });

  it("rewrites a Neon Auth Location and leaves the Google redirect unchanged", async () => {
    const headers = new Headers({
      location: `${BASE}/callback/google?state=abc`,
    });
    const neon = await call("/api/auth/sign-in/social", {}, mockFetch(upstreamResponse({
      status: 302,
      headers,
    })));
    expect(neon.response.status).toBe(302);
    expect(neon.response.headers.get("location")).toBe("/api/auth/callback/google?state=abc");
    expect(neon.response.headers.get("cache-control")).toBe("no-store");

    const google = await call("/api/auth/sign-in/social", {}, mockFetch(upstreamResponse({
      status: 302,
      headers: new Headers({ location: "https://accounts.google.com/o/oauth2/v2/auth?client_id=helix" }),
    })));
    expect(google.response.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=helix");
  });

  it("rejects a traversal path before calling Neon", async () => {
    const fetchImpl = mockFetch();
    const rejected = [
      "/api/auth/../secret",
      "/api/auth/foo/%2e%2e/secret",
      "/api/auth/%252e%252e/secret",
      "/api/auth/foo%2Fbar",
      "/api/auth/foo%5Cbar",
      "/api/auth/%252Fetc",
      "/api/auth/%255Cwindows",
      "/api/auth/\\\\evil",
      "/api/auth/https://evil.example",
      "/api/auth//evil.example",
    ];
    for (const rawUrl of rejected) {
      const response = await proxyNeonAuth({ rawUrl, baseUrl: BASE, fetchImpl });
      expect(response.status, rawUrl).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid auth path." });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    const allowed = await proxyNeonAuth({
      rawUrl: "/api/auth/get-session?foo=1",
      baseUrl: BASE,
      fetchImpl,
    });
    expect(allowed.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/get-session?foo=1`);
  });
});
