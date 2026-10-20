import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler, { config } from "../auth.js";
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

const sameSite = {
  origin: "https://helixnmbu.no",
  host: "helixnmbu.no",
};

// The rewrite destination replaces req.url. A browser request for
// /api/auth/sign-in/social?foo=1 is invoked as this query form.
function arrived(requestPath: string): string {
  const queryAt = requestPath.indexOf("?");
  const path = queryAt === -1 ? requestPath : requestPath.slice(0, queryAt);
  const search = queryAt === -1 ? "" : requestPath.slice(queryAt + 1);
  const prefix = "/api/auth/";
  if (path === "/api/auth" || !path.startsWith(prefix)) return requestPath;
  const suffix = path.slice(prefix.length);
  return `/api/auth?__path=${suffix}&path=${suffix}${search ? `&${search}` : ""}`;
}

async function call(
  rawUrl: string,
  headers: Record<string, string>,
  fetchImpl = mockFetch(),
) {
  const response = await proxyNeonAuth({
    method: "POST",
    rawUrl: arrived(rawUrl),
    headers: { ...sameSite, ...headers },
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
    expect(sent.get("origin")).toBe("https://helix.example");
    for (const name of ["x-forwarded-host", "x-forwarded-for", "x-forwarded-proto", "host", "x-request-id", "cookie"]) {
      expect(sent.get(name)).toBeNull();
    }
  });

  it("forwards only Neon Auth cookies", async () => {
    const { fetchImpl } = await call("/api/auth/get-session", {
      cookie: [
        "_vercel_jwt=preview-secret",
        "theme=dark",
        "__Secure-neon-auth.session_token=session-value",
        "__Secure-neon-auth.session_challenge=challenge-value",
        "__Secure-neon-auth.session_token.0=token-chunk",
        "__Secure-neonauth.session_token=docs-name",
        "__Secure-better-auth.oauth_state=pkce-state",
        "better-auth.session_data.0=chunk",
        "session_token=plain",
      ].join("; "),
    });
    const sent = fetchImpl.mock.calls[0][1]?.headers as Headers;
    expect(sent.get("cookie")).toBe([
      "__Secure-neon-auth.session_token=session-value",
      "__Secure-neon-auth.session_challenge=challenge-value",
      "__Secure-neon-auth.session_token.0=token-chunk",
      "__Secure-neonauth.session_token=docs-name",
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

  it("leaves the sign-in JSON url on the Neon host", async () => {
    const initUrl = `${BASE}/sign-in/social/init?state=abc`;
    const { response } = await call("/api/auth/sign-in/social", {}, mockFetch(upstreamResponse({
      headers: new Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ url: initUrl, redirect: false }),
    })));
    expect(await response.json()).toEqual({ url: initUrl, redirect: false });
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
      const response = await proxyNeonAuth({ rawUrl: arrived(rawUrl), baseUrl: BASE, fetchImpl });
      expect(response.status, rawUrl).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid auth path." });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    const allowed = await proxyNeonAuth({
      rawUrl: arrived("/api/auth/get-session?foo=1"),
      baseUrl: BASE,
      fetchImpl,
    });
    expect(allowed.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/get-session?foo=1`);
  });

  it("rejects a traversal path that arrives in the __path query", async () => {
    const fetchImpl = mockFetch();
    const rejected = [
      "/api/auth?__path=..%2F..%2Fadmin&path=..%2F..%2Fadmin",
      "/api/auth?__path=..%252F..%252Fadmin&path=..%252F..%252Fadmin",
    ];
    for (const rawUrl of rejected) {
      const response = await proxyNeonAuth({ rawUrl, baseUrl: BASE, fetchImpl });
      expect(response.status, rawUrl).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid auth path." });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    const allowed = await proxyNeonAuth({
      rawUrl: "/api/auth?__path=get-session&path=injected&foo=1",
      baseUrl: BASE,
      fetchImpl,
    });
    expect(allowed.status).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`${BASE}/get-session?foo=1`);
  });

  it("rejects a cross-site state change and still forwards a same-origin POST and a cross-origin GET", async () => {
    const crossSite = mockFetch();
    const rejected = await proxyNeonAuth({
      method: "POST",
      rawUrl: arrived("/api/auth/sign-out"),
      headers: { origin: "https://evil.example", host: "helixnmbu.no", "sec-fetch-site": "cross-site" },
      baseUrl: BASE,
      fetchImpl: crossSite,
    });
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({ error: "Cross-site request was rejected." });
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    expect(crossSite).not.toHaveBeenCalled();

    const missingOrigin = mockFetch();
    const noOrigin = await proxyNeonAuth({
      method: "POST",
      rawUrl: arrived("/api/auth/sign-out"),
      headers: { host: "helixnmbu.no", "sec-fetch-site": "cross-site" },
      baseUrl: BASE,
      fetchImpl: missingOrigin,
    });
    expect(noOrigin.status).toBe(403);
    expect(missingOrigin).not.toHaveBeenCalled();

    const neither = mockFetch();
    const noHeaders = await proxyNeonAuth({
      method: "POST",
      rawUrl: arrived("/api/auth/sign-out"),
      headers: { host: "helixnmbu.no" },
      baseUrl: BASE,
      fetchImpl: neither,
    });
    expect(noHeaders.status).toBe(403);
    expect(neither).not.toHaveBeenCalled();

    const www = mockFetch();
    const productionAlias = await proxyNeonAuth({
      method: "POST",
      rawUrl: arrived("/api/auth/sign-out"),
      headers: { origin: "https://www.helixnmbu.no", host: "helixnmbu.no" },
      baseUrl: BASE,
      fetchImpl: www,
    });
    expect(productionAlias.status).toBe(200);
    expect(www).toHaveBeenCalledOnce();

    const sameOrigin = mockFetch();
    const forwarded = await proxyNeonAuth({
      method: "POST",
      rawUrl: arrived("/api/auth/sign-out"),
      headers: { origin: "https://my-branch.vercel.app", host: "my-branch.vercel.app" },
      baseUrl: BASE,
      fetchImpl: sameOrigin,
    });
    expect(forwarded.status).toBe(200);
    expect(String(sameOrigin.mock.calls[0][0])).toBe(`${BASE}/sign-out`);
    expect((sameOrigin.mock.calls[0][1]?.headers as Headers).get("origin")).toBe("https://my-branch.vercel.app");

    const callback = mockFetch();
    const googleGet = await proxyNeonAuth({
      method: "GET",
      rawUrl: arrived("/api/auth/callback/google?code=1&state=abc"),
      headers: { origin: "https://accounts.google.com", host: "helixnmbu.no" },
      baseUrl: BASE,
      fetchImpl: callback,
    });
    expect(googleGet.status).toBe(200);
    expect(String(callback.mock.calls[0][0])).toBe(`${BASE}/callback/google?code=1&state=abc`);
  });

  it("forwards a form-encoded POST byte-for-byte with its content type", async () => {
    expect(config).toEqual({ api: { bodyParser: false } });
    const form = "provider=google&callbackURL=https%3A%2F%2Fhelixnmbu.no%2Fmember%2Flogin";
    const previousBase = process.env.NEON_AUTH_BASE_URL;
    const previousHosts = process.env.AUTH_PROXY_ALLOWED_HOSTS;
    process.env.NEON_AUTH_BASE_URL = BASE;
    delete process.env.AUTH_PROXY_ALLOWED_HOSTS;
    const fetchImpl = mockFetch();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const req = {
        method: "POST",
        url: arrived("/api/auth/sign-in/social"),
        headers: {
          host: "helixnmbu.no",
          origin: "https://helixnmbu.no",
          "content-type": "application/x-www-form-urlencoded",
        },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(form.slice(0, 16));
          yield Buffer.from(form.slice(16));
        },
      };
      await handler(req as unknown as VercelRequest, { status: vi.fn(), setHeader: vi.fn(), send: vi.fn() } as unknown as VercelResponse);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousBase === undefined) delete process.env.NEON_AUTH_BASE_URL;
      else process.env.NEON_AUTH_BASE_URL = previousBase;
      if (previousHosts === undefined) delete process.env.AUTH_PROXY_ALLOWED_HOSTS;
      else process.env.AUTH_PROXY_ALLOWED_HOSTS = previousHosts;
    }
    const init = fetchImpl.mock.calls[0][1];
    const sent = init?.headers as Headers;
    expect(sent.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(Buffer.from(init?.body as Uint8Array).equals(Buffer.from(form))).toBe(true);
  });

  it("forwards callbackURL in a JSON sign-in body unchanged", async () => {
    const body = JSON.stringify({
      provider: "google",
      callbackURL: "https://helixnmbu.no/member/profile",
      errorCallbackURL: "https://helixnmbu.no/member/profile",
    });
    const fetchImpl = mockFetch();
    await proxyNeonAuth({
      method: "POST",
      rawUrl: arrived("/api/auth/sign-in/social"),
      headers: { ...sameSite, "content-type": "application/json" },
      body,
      baseUrl: BASE,
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(body);
  });
});
