import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCvRepository, CvRequestError } from "./repository";
import {
  MEMBER_AUTH_UNAVAILABLE,
  claimNeonAuthSession,
  confirmMemberSession,
  ensureMemberLanding,
  loginAction,
  memberAuthFailure,
  memberLandingFrame,
  memberLoadFailure,
  memberPageCopy,
  googleSignInRequest,
  memberSignInCallbackUrl,
  clearMemberLanding,
  MEMBER_TOKEN_REFRESH_MARGIN_MS,
  resolveMemberAuthUrl,
  sessionTokenFromAuth,
  watchMemberSession,
} from "./session";

function memberJwt(expSeconds: number, subject = "member"): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ exp: expSeconds, sub: subject })}.sig`;
}

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
  beforeEach(() => clearMemberLanding());

  it("redirects to login for 401 and 403 and shows a generic error for 400", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const token = vi.fn(async () => ({ data: { token: "unused" } }));
    const memberLogin = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect([String(input), init?.method]).toEqual(["/api/member-login", "POST"]);
      return new Response(JSON.stringify({ error: "Log in to continue." }), { status: 401 });
    });
    const unauthorized = await sessionTokenFromAuth({
      getSession: async () => ({ data: null, error: { status: 401, message: "Unauthorized" } }),
      token,
    }, { current: null }, memberLogin).catch((error: unknown) => error);
    clearMemberLanding();
    const forbidden = await sessionTokenFromAuth({
      getSession: async () => ({ data: { user: { id: "member" } } }),
      token: async () => ({ data: null, error: { status: 403, message: "Forbidden" } }),
    }, { current: null }, memberLogin).catch((error: unknown) => error);
    clearMemberLanding();
    const invalid = await sessionTokenFromAuth({
      getSession: async () => ({ data: null, error: { status: 400, message: "HTTP 400 INVALID_HOSTNAME" } }),
      token,
    }, { current: null }, memberLogin).catch((error: unknown) => error);

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
    expect(memberLogin.mock.calls.map(([input, init]) => [String(input), init?.method])).toEqual([
      ["/api/member-login", "POST"],
      ["/api/member-login", "POST"],
    ]);
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
  beforeEach(() => {
    clearMemberLanding();
    vi.unstubAllGlobals();
  });

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

  it.each([true, false])("carries the verified account into the landing with session reader %s", async (withSessionReader) => {
    const account = { name: "Åse Hansen", email: "ase@helixnmbu.no", role: "Member" };
    const token = vi.fn(async () => ({ data: { token: "member-jwt" } }));
    const client = withSessionReader
      ? { token, getSession: async () => ({ data: { user: { id: "member", name: "Untrusted client name" } } }) }
      : { token };
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, email: account.email, account }));
    const landing = await ensureMemberLanding(client, fetchImpl);
    expect(landing.phase).toBe("signed-in");
    expect(landing.account).toEqual(account);
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

  it("still calls the member endpoint when no token is available, then shows the generic message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      if (String(input) === "/api/member-login") {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({});
      }
      return new Response(JSON.stringify({ error: "Log in to continue." }), { status: 401 });
    });
    const failure = await confirmMemberSession({
      token: async () => ({ error: { status: 400 } }),
    }, fetchImpl).catch((error: unknown) => error);
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual(["/api/auth/token", "/api/member-login"]);
    expect(failure).toEqual(new Error("Could not start your member session. Please try again."));
    expect(logged).not.toHaveBeenCalled();
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
    clearMemberLanding();
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

  it("shows loading then signed-in, and does not repeat the landing after a remount or route change", async () => {
    const location = new URL("https://helix.example/member/profile?neon_auth_session_verifier=once");
    const replaceState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
      const next = new URL(String(url), location.origin);
      location.pathname = next.pathname;
      location.search = next.search;
      location.hash = next.hash;
    });
    vi.stubGlobal("window", { location });
    vi.stubGlobal("history", { state: { idx: 1 }, replaceState });
    let release: (value: { data: { user: { id: string } } }) => void = () => undefined;
    let searchAtClaim = "";
    const getSession = vi.fn(() => {
      searchAtClaim = window.location.search;
      return new Promise<{ data: { user: { id: string } } }>((resolve) => { release = resolve; });
    });
    const tokenValue = memberJwt(Math.floor(Date.now() / 1000) + 60 * 60);
    const token = vi.fn(async () => {
      expect(window.location.search).not.toContain("neon_auth_session_verifier");
      return { data: { token: tokenValue } };
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/member-login");
      expect(init).toMatchObject({ method: "POST", headers: { Authorization: `Bearer ${tokenValue}` } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = { getSession, token };
    const search = "?neon_auth_session_verifier=once";
    const frames = [memberPageCopy(memberLandingFrame(null))];
    expect(loginAction(null)).toBe("loading");
    const first = ensureMemberLanding(client, fetchImpl, search);
    const second = ensureMemberLanding(client, fetchImpl, search);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(searchAtClaim).toContain("neon_auth_session_verifier=once");
    expect(window.location.search).not.toContain("neon_auth_session_verifier");
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    release({ data: { user: { id: "member" } } });
    const [started, remounted] = await Promise.all([first, second]);
    frames.push(memberPageCopy(memberLandingFrame(started)));
    expect(started).toBe(remounted);
    expect(loginAction(started)).toBe("profile");
    expect(frames).toEqual(["Verifying your Helix account…", "Build your CV"]);
    expect(frames).not.toContain("Sign in to build your CV");
    expect(window.location.search).not.toContain("neon_auth_session_verifier");
    expect(replaceState).toHaveBeenCalledWith({ idx: 1 }, "", "/member/profile");
    const jwt = await sessionTokenFromAuth(client, { current: null }, fetchImpl);
    const changedRoute = await ensureMemberLanding(client, fetchImpl, "");
    frames.push(memberPageCopy(memberLandingFrame(changedRoute)));
    expect(jwt).toBe(tokenValue);
    expect(frames).toEqual(["Verifying your Helix account…", "Build your CV", "Build your CV"]);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(token).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(memberLoginCount(fetchImpl)).toBe(1);
  });

  it("sends the claimed verifier after the address bar is cleared, and still posts member login once", async () => {
    const location = new URL("https://helix.example/member/profile?tab=cv&neon_auth_session_verifier=once");
    const replaceState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
      const next = new URL(String(url), location.origin);
      location.pathname = next.pathname;
      location.search = next.search;
      location.hash = next.hash;
    });
    vi.stubGlobal("window", { location });
    vi.stubGlobal("history", { state: { idx: 1 }, replaceState });
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      expect(window.location.search).not.toContain("neon_auth_session_verifier");
      if (url.includes("/get-session")) return Response.json({ user: { id: "member" } });
      if (url.includes("/api/member-login")) return Response.json({ ok: true });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const getSession = vi.fn(async () => {
      await Promise.resolve();
      await fetch("/api/auth/get-session", { credentials: "include" });
      return { data: { user: { id: "member" } } };
    });
    const token = vi.fn(async () => ({ data: { token: "member-jwt" } }));
    const pending = ensureMemberLanding({ getSession, token }, fetchImpl, location.search);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?tab=cv");
    expect(calls).toEqual([]);
    await pending;
    expect(calls.filter((call) => call.includes("/get-session"))).toEqual([
      "GET https://helix.example/api/auth/get-session?neon_auth_session_verifier=once",
    ]);
    expect(memberLoginCount(fetchImpl)).toBe(1);
    await ensureMemberLanding({ getSession, token }, fetchImpl, "?neon_auth_session_verifier=once");
    await sessionTokenFromAuth({ getSession, token }, { current: null }, fetchImpl);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(memberLoginCount(fetchImpl)).toBe(1);
  });

  it("refreshes an expiring token on the next request without a 401 loop", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      const issued: string[] = [];
      const firstToken = memberJwt(Math.floor(Date.now() / 1000) + 120);
      const freshToken = memberJwt(Math.floor(Date.now() / 1000) + 60 * 60);
      const token = vi.fn(async () => {
        const next = issued.length === 0 ? firstToken : freshToken;
        issued.push(next);
        return { data: { token: next } };
      });
      const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("/api/member-login");
        expect(init).toMatchObject({ method: "POST", headers: { Authorization: `Bearer ${firstToken}` } });
        return Response.json({ ok: true });
      });
      const client = {
        getSession: async () => ({ data: { user: { id: "member" } } }),
        token,
      };
      const bound = { current: null };
      const first = await sessionTokenFromAuth(client, bound, fetchImpl);
      expect(first).toBe(firstToken);
      expect(loginAction(await ensureMemberLanding(client, fetchImpl))).toBe("profile");
      vi.setSystemTime(Date.now() + MEMBER_TOKEN_REFRESH_MARGIN_MS + 30_000);
      const second = await sessionTokenFromAuth(client, bound, fetchImpl);
      expect(second).toBe(freshToken);
      expect(token).toHaveBeenCalledTimes(2);
      expect(memberLoginCount(fetchImpl)).toBe(1);
      expect(loginAction(await ensureMemberLanding(client, fetchImpl))).toBe("profile");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a signed-in landing on 401 so login stays signed out", async () => {
    const getSession = vi.fn(async () => ({ data: { user: { id: "member" } } }));
    const token = vi.fn(async () => ({ data: { token: memberJwt(Math.floor(Date.now() / 1000) + 60 * 60) } }));
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const client = { getSession, token };
    const landing = await ensureMemberLanding(client, fetchImpl);
    expect(loginAction(landing)).toBe("profile");
    const failure = new CvRequestError("Your session has ended. Sign in again to continue.", 401);
    expect(memberLoadFailure(failure)).toEqual({ redirectTo: "/member/login" });
    const after = await ensureMemberLanding(client, fetchImpl);
    expect(loginAction(after)).toBe("form");
    expect(loginAction(await ensureMemberLanding(client, fetchImpl))).toBe("form");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(memberLoginCount(fetchImpl)).toBe(1);
  });

  it("retries an unavailable landing on the next call", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let attempt = 0;
    const getSession = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return { data: null, error: { status: 400, message: "HTTP 400 INVALID_HOSTNAME" } };
      return { data: { user: { id: "member" } } };
    });
    const token = vi.fn(async () => ({ data: { token: memberJwt(Math.floor(Date.now() / 1000) + 60 * 60) } }));
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
    const client = { getSession, token };
    const first = await ensureMemberLanding(client, fetchImpl);
    expect(first.phase).toBe("unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
    const second = await ensureMemberLanding(client, fetchImpl);
    expect(second.phase).toBe("signed-in");
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(memberLoginCount(fetchImpl)).toBe(1);
    expect(loginAction(second)).toBe("profile");
    logged.mockRestore();
  });

  it("ends the session when get-session has no user", async () => {
    const onEnd = vi.fn();
    let user: { id: string } | null = { id: "member" };
    const getSession = vi.fn(async () => ({ data: { user } }));
    const listeners = new Map<string, EventListener>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: EventListener) => { listeners.set(type, listener); },
      removeEventListener: (type: string, listener: EventListener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    });
    const stop = watchMemberSession(onEnd, { getSession });
    listeners.get("focus")?.(new Event("focus"));
    await Promise.resolve();
    expect(onEnd).not.toHaveBeenCalled();
    user = null;
    listeners.get("focus")?.(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onEnd).toHaveBeenCalledOnce();
    const after = await ensureMemberLanding({ getSession }, vi.fn());
    expect(loginAction(after)).toBe("form");
    stop();
    expect(listeners.has("focus")).toBe(false);
  });

  it("locks the loaded account when a fresh focus check finds another member", async () => {
    const onEnd = vi.fn();
    let user = { id: "member-a" };
    const getSession = vi.fn(async () => ({ data: { user } }));
    const listeners = stubFocusWindow();
    const stop = watchMemberSession(onEnd, { getSession }, { current: "member-a" });
    listeners.get("focus")?.(new Event("focus"));
    await Promise.resolve();
    expect(onEnd).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledWith({ fetchOptions: { headers: { "X-Force-Fetch": "true" } } });

    user = { id: "member-b" };
    listeners.get("focus")?.(new Event("focus"));
    await Promise.resolve();
    expect(onEnd).toHaveBeenCalledOnce();
    listeners.get("focus")?.(new Event("focus"));
    expect(getSession).toHaveBeenCalledTimes(2);
    expect((await ensureMemberLanding({ getSession }, vi.fn())).phase).toBe("signed-out");
    stop();
    expect(listeners.has("focus")).toBe(false);
  });

  it.each(["save", "preview", "publish"] as const)("does not send %s with a different member's refreshed JWT", async (action) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const expires = Math.floor(Date.now() / 1000);
      const firstToken = memberJwt(expires + 120, "member-a");
      const token = vi.fn()
        .mockResolvedValueOnce({ data: { token: firstToken } })
        .mockResolvedValue({ data: { token: memberJwt(expires + 3600, "member-b") } });
      const client = { getSession: async () => ({ data: { user: { id: "member-a" } } }), token };
      const bootstrap = vi.fn(async () => Response.json({ ok: true }));
      const bound = { current: null as string | null };
      await expect(sessionTokenFromAuth(client, bound, bootstrap)).resolves.toBe(firstToken);
      expect(bound.current).toBe("member-a");
      vi.setSystemTime(Date.now() + 90_000);

      const request = vi.fn();
      const repository = createCvRepository(() => sessionTokenFromAuth(client, bound, bootstrap), request);
      const pending = action === "preview"
        ? repository.preview({ action, expectedRevision: 0 })
        : repository.mutate({ action, expectedRevision: 0 });
      await expect(pending).rejects.toMatchObject({ status: 401 });
      await expect(repository.mutate({ action: "save", expectedRevision: 0 })).rejects.toMatchObject({ status: 401 });
      expect(request).not.toHaveBeenCalled();
      expect(token).toHaveBeenCalledTimes(2);
      expect((await ensureMemberLanding(client, bootstrap)).phase).toBe("signed-out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an in-flight save when focus detects a switch before JWT refresh completes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let stop: () => void = () => undefined;
    try {
      const listeners = stubFocusWindow();
      let user = { id: "member-a" };
      const getSession = vi.fn(async () => ({ data: { user } }));
      const expires = Math.floor(Date.now() / 1000);
      let release!: (value: { data: { token: string } }) => void;
      const refreshing = new Promise<{ data: { token: string } }>((resolve) => { release = resolve; });
      const token = vi.fn()
        .mockResolvedValueOnce({ data: { token: memberJwt(expires + 120, "member-a") } })
        .mockReturnValueOnce(refreshing);
      const client = { getSession, token };
      const bootstrap = vi.fn(async () => Response.json({ ok: true }));
      const bound = { current: null as string | null };
      await sessionTokenFromAuth(client, bound, bootstrap);
      stop = watchMemberSession(vi.fn(), client, bound);
      vi.setSystemTime(Date.now() + 90_000);
      const request = vi.fn();
      const repository = createCvRepository(() => sessionTokenFromAuth(client, bound, bootstrap), request);
      const pending = repository.mutate({ action: "save", expectedRevision: 0 });
      const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
      await Promise.resolve();
      expect(token).toHaveBeenCalledTimes(2);
      user = { id: "member-b" };
      listeners.get("focus")?.(new Event("focus"));
      await Promise.resolve();
      // Even a delayed token for A cannot revive the rejected form session.
      release({ data: { token: memberJwt(expires + 3600, "member-a") } });
      await rejected;
      expect(request).not.toHaveBeenCalled();
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it("ignores a focus response after its watcher has been disposed", async () => {
    const listeners = stubFocusWindow();
    const onEnd = vi.fn();
    let release!: (value: { data: { user: { id: string } } }) => void;
    const getSession = vi.fn(() => new Promise<{ data: { user: { id: string } } }>((resolve) => { release = resolve; }));
    const stop = watchMemberSession(onEnd, { getSession }, { current: "member-a" });
    listeners.get("focus")?.(new Event("focus"));
    stop();
    release({ data: { user: { id: "member-b" } } });
    await Promise.resolve();
    expect(onEnd).not.toHaveBeenCalled();
    expect(listeners.has("focus")).toBe(false);
  });
});

function stubFocusWindow(): Map<string, EventListener> {
  const listeners = new Map<string, EventListener>();
  vi.stubGlobal("window", {
    location: { search: "" },
    addEventListener: (type: string, listener: EventListener) => { listeners.set(type, listener); },
    removeEventListener: (type: string, listener: EventListener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  });
  return listeners;
}

function memberLoginCount(fetchImpl: { mock: { calls: unknown[][] } }): number {
  return fetchImpl.mock.calls.filter((call) => {
    const [input, init] = call as [RequestInfo | URL, RequestInit | undefined];
    return String(input).includes("/api/member-login") && (init?.method ?? "GET") === "POST";
  }).length;
}
