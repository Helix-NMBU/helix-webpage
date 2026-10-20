import { describe, expect, it, vi } from "vitest";
import { CvRequestError } from "./repository";
import {
  MEMBER_AUTH_UNAVAILABLE,
  claimNeonAuthSession,
  confirmMemberSession,
  memberAuthFailure,
  memberLoadFailure,
  googleSignInRequest,
  memberSignInCallbackUrl,
  resolveMemberAuthUrl,
  sessionTokenFromAuth,
} from "./session";

describe("member auth URL", () => {
  it("keeps an absolute Neon URL and expands the same-origin proxy path", () => {
    const neon = "https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth";
    expect(resolveMemberAuthUrl(`${neon}/`, "https://preview.example")).toBe(neon);
    expect(resolveMemberAuthUrl("/api/auth", "https://preview.example")).toBe("https://preview.example/api/auth");
    expect(resolveMemberAuthUrl("/api/auth", "https://helix.example/")).toBe("https://helix.example/api/auth");
  });
});

describe("Google sign-in callback", () => {
  const origin = "https://helix.example";

  it("sends an absolute callback on the current origin pointing at the profile by default", () => {
    const request = googleSignInRequest(undefined, origin);
    expect(request).toEqual({
      provider: "google",
      callbackURL: "https://helix.example/member/profile",
      errorCallbackURL: "https://helix.example/member/profile",
    });
    expect(request.callbackURL).toBe(new URL("/member/profile", origin).href);
    expect(memberSignInCallbackUrl(null, origin)).toBe("https://helix.example/member/profile");
  });

  it("keeps a safe same-origin member return path", () => {
    expect(memberSignInCallbackUrl("/member/opportunities?tab=open", origin)).toBe(
      "https://helix.example/member/opportunities?tab=open",
    );
    expect(memberSignInCallbackUrl({ from: "/member/profile" }, origin)).toBe(
      "https://helix.example/member/profile",
    );
    expect(googleSignInRequest({ redirect: "/member/profile" }, origin).callbackURL).toBe(
      "https://helix.example/member/profile",
    );
  });

  it("falls back to the profile for a missing, protocol-relative, absolute, or backslash return", () => {
    const profile = "https://helix.example/member/profile";
    for (const source of [undefined, "//evil.com", "https://evil.com", "/\\evil.com"]) {
      expect(memberSignInCallbackUrl(source, origin), String(source)).toBe(profile);
      expect(googleSignInRequest(source, origin).callbackURL, String(source)).toBe(profile);
    }
  });
});

describe("member auth failures", () => {
  it("redirects to login for 401 and 403 and shows a generic error for 400", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const token = vi.fn(async () => ({ data: { token: "unused" } }));
    const unauthorized = await sessionTokenFromAuth({
      getSession: async () => ({ data: null, error: { status: 401, message: "Unauthorized" } }),
      token,
    }, { current: null }).catch((error: unknown) => error);
    const forbidden = await sessionTokenFromAuth({
      getSession: async () => ({ data: { user: { id: "member" } } }),
      token: async () => ({ data: null, error: { status: 403, message: "Forbidden" } }),
    }, { current: null }).catch((error: unknown) => error);
    const invalid = await sessionTokenFromAuth({
      getSession: async () => ({ data: null, error: { status: 400, message: "HTTP 400 INVALID_HOSTNAME" } }),
      token,
    }, { current: null }).catch((error: unknown) => error);

    expect(memberLoadFailure(unauthorized)).toEqual({ redirectTo: "/member/login" });
    expect(unauthorized).toMatchObject({ status: 401 });
    expect(memberLoadFailure(forbidden)).toEqual({ redirectTo: "/member/login" });
    expect(forbidden).toMatchObject({ status: 403 });
    expect(memberLoadFailure(invalid)).toEqual({ message: MEMBER_AUTH_UNAVAILABLE });
    expect(invalid).toMatchObject({ status: 400, message: MEMBER_AUTH_UNAVAILABLE });
    expect(JSON.stringify(invalid)).not.toContain("INVALID_HOSTNAME");
    expect(logged).toHaveBeenCalledWith("Member auth request failed.", {
      status: 400,
      detail: "HTTP 400 INVALID_HOSTNAME",
    });
    expect(token).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("logs a network failure instead of treating it as signed out", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = memberAuthFailure(new TypeError("Failed to fetch"));
    expect(failure).toBeInstanceOf(CvRequestError);
    expect(memberLoadFailure(failure)).toEqual({ message: MEMBER_AUTH_UNAVAILABLE });
    expect(failure.status).not.toBe(401);
    expect(logged).toHaveBeenCalledWith("Member auth request failed.", {
      status: null,
      detail: "Failed to fetch",
    });
    logged.mockRestore();
  });
});

describe("member session claim", () => {
  it("exchanges a callback verifier once and skips a page without one", async () => {
    let release: (value: { data: { user: { id: string } } }) => void = () => undefined;
    const getSession = vi.fn(() => new Promise<{ data: { user: { id: string } } }>((resolve) => { release = resolve; }));
    await expect(claimNeonAuthSession({ getSession }, "")).resolves.toBe(false);
    expect(getSession).not.toHaveBeenCalled();
    const search = "?neon_auth_session_verifier=once";
    const first = claimNeonAuthSession({ getSession }, search);
    const second = claimNeonAuthSession({ getSession }, search);
    expect(getSession).toHaveBeenCalledTimes(1);
    release({ data: { user: { id: "member" } } });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("logs a failed verifier exchange without the verifier", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "verifier-secret";
    await expect(claimNeonAuthSession({
      getSession: async () => ({ error: { status: 401, message: secret } }),
    }, `?neon_auth_session_verifier=${secret}`)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", {
      reason: "verifier_exchange_failed",
      status: 401,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
    logged.mockRestore();
  });

  it("logs before showing the member-session error when no token is available", async () => {
    const order: string[] = [];
    const logged = vi.spyOn(console, "error").mockImplementation(() => { order.push("log"); });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      order.push(String(input));
      expect(init?.credentials).toBe("include");
      return new Response(JSON.stringify({ error: "hidden" }), { status: 401 });
    });
    const failure = await confirmMemberSession({
      token: async () => ({ error: { status: 400 } }),
    }, fetchImpl).catch((error: unknown) => error);
    expect(order).toEqual(["/api/auth/token", "/api/member-login", "log"]);
    expect(failure).toEqual(new Error("Could not start your member session. Please try again."));
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", { reason: "no_token", status: 401 });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("hidden");
    logged.mockRestore();
  });

  it("posts the bearer token, and falls back to the session cookie when token() fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bearer = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      expect(init?.headers).toEqual({ Authorization: "Bearer member-jwt" });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    await confirmMemberSession({ token: async () => ({ data: { token: "member-jwt" } }) }, bearer);
    const cookie = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/auth/token") {
        expect(init?.credentials).toBe("include");
        return Response.json({ token: "cookie-jwt" });
      }
      expect(init).toMatchObject({ headers: { Authorization: "Bearer cookie-jwt" }, credentials: "include" });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    await confirmMemberSession({ token: async () => { throw new Error("secret-token"); } }, cookie);
    expect(cookie.mock.calls.map(([input]) => String(input))).toEqual(["/api/auth/token", "/api/member-login"]);
    expect(logged).not.toHaveBeenCalled();
    expect(JSON.stringify(bearer.mock.calls)).not.toContain("secret-token");
    logged.mockRestore();
  });
});
