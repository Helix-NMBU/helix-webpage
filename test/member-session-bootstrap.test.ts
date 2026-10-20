import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyNeonAuth } from "../api/_lib/auth-proxy.js";
import { createMemberLoginHandler, sessionTokenFromRequest } from "../api/member-login.js";
import type { CvServices } from "../api/_lib/member-cv-service.js";

const BASE = "https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth";
const VERIFIER = "one-time-verifier";
const CHALLENGE = "challenge-value";
const SESSION = "session-value";
const JWT = "signed-member-jwt";

describe("member session bootstrap", () => {
  it("exchanges a callback verifier, stores the session on our origin, and upserts the member", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/get-session")) {
        expect(url).toBe(`${BASE}/get-session?neon_auth_session_verifier=${VERIFIER}`);
        const sent = init?.headers as Headers;
        expect(sent.get("cookie")).toBe(`__Secure-neon-auth.session_challenge=${CHALLENGE}`);
        const headers = new Headers();
        headers.append(
          "set-cookie",
          `__Secure-neon-auth.session_token=${SESSION}; Domain=neon.tech; Path=/neondb/auth; HttpOnly; SameSite=Lax`,
        );
        return new Response(JSON.stringify({ session: { id: "sess-1" }, user: { id: "user-1" } }), {
          status: 200,
          headers,
        });
      }
      if (url.endsWith("/token")) {
        expect(init?.headers).toEqual({
          cookie: `__Secure-neon-auth.session_token=${SESSION}; __Secure-neon-auth.session_token.0=chunk`,
        });
        return Response.json({ token: JWT });
      }
      throw new Error(`unexpected ${url}`);
    });

    const exchange = await proxyNeonAuth({
      method: "GET",
      rawUrl: `/api/auth?__path=get-session&path=get-session&neon_auth_session_verifier=${VERIFIER}`,
      headers: {
        origin: "https://helix.example",
        host: "helix.example",
        cookie: `theme=dark; __Secure-neon-auth.session_challenge=${CHALLENGE}; _vercel_jwt=preview-secret`,
      },
      baseUrl: BASE,
      fetchImpl,
    });

    expect(exchange.status).toBe(200);
    const setCookie = exchange.headers.getSetCookie();
    expect(setCookie).toEqual([
      `__Secure-neon-auth.session_token=${SESSION}; Path=/api/auth; HttpOnly; SameSite=Lax; Secure`,
    ]);
    expect(setCookie[0]).not.toMatch(/domain=/i);
    const stored = setCookie[0].split(";")[0];

    const authenticate = vi.fn(async (token: string) => {
      expect(token).toBe(JWT);
      return { userId: "member-1", googleSub: "google-sub", email: "ase@helixnmbu.no", name: "Åse" };
    });
    const handler = createMemberLoginHandler(
      () => ({ authenticate }) as unknown as CvServices,
      (headers) => sessionTokenFromRequest(headers, { NEON_AUTH_BASE_URL: BASE }, fetchImpl),
    );
    let status: number | undefined;
    let result: unknown;
    const res = {
      setHeader: vi.fn(),
      status: (code: number) => { status = code; return res; },
      json: (value: unknown) => { result = value; return res; },
    };
    await handler({
      method: "POST",
      headers: { cookie: `theme=dark; ${stored}; __Secure-neon-auth.session_token.0=chunk` },
    } as VercelRequest, res as unknown as VercelResponse);

    expect(status).toBe(200);
    expect(result).toEqual({ ok: true, email: "ase@helixnmbu.no" });
    expect(authenticate).toHaveBeenCalledOnce();
    expect(logged).not.toHaveBeenCalled();
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("preview-secret");
    logged.mockRestore();
  });
});
