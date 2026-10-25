import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import { CvRequestError } from "./repository";
import { isMemberPlatform, memberPaths } from "../MemberPlatform/routes";
import { readMemberAccount, type MemberAccount } from "../MemberPlatform/account";

// neon-js rejects a protocol-less base URL. `/api/auth` is expanded to the
// current origin so one value works for every preview and production host.
export function resolveMemberAuthUrl(configured: string, origin?: string): string | null {
  const trimmed = configured.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  if (!base) return null;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return new URL(path, base).href.replace(/\/$/, "");
}

const authUrl = import.meta.env.VITE_NEON_AUTH_URL
  ? resolveMemberAuthUrl(import.meta.env.VITE_NEON_AUTH_URL)
  : null;

export const memberAuthConfigured = Boolean(authUrl);

export const authClient = authUrl
  ? createAuthClient(authUrl, {
      adapter: BetterAuthVanillaAdapter({
        fetchOptions: { credentials: "include" },
      }),
    })
  : null;

export const MEMBER_AUTH_UNAVAILABLE = "Could not load your CV.";

type AuthCall = {
  data?: { user?: { id?: string } | null; token?: string } | null;
  error?: unknown;
};

function authStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = error.status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

function authErrorDetail(error: unknown): { status: number | null; detail: string } {
  const status = authStatus(error);
  if (error instanceof Error) return { status, detail: error.message };
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return { status, detail: error.message };
  }
  return { status, detail: "Auth request failed." };
}

// 401 and 403 are a signed-out session. Every other auth failure stays on the
// page with a generic message so a 400 from the proxy cannot loop back to login.
export function memberAuthFailure(error: unknown): CvRequestError {
  const status = authStatus(error);
  if (status === 401 || status === 403) {
    return new CvRequestError("Your session has ended. Sign in again to continue.", status);
  }
  console.error("Member auth request failed.", authErrorDetail(error));
  return new CvRequestError(MEMBER_AUTH_UNAVAILABLE, status ?? 0);
}

export function memberLoadFailure(failure: unknown): { redirectTo: string } | { message: string } {
  if (failure instanceof CvRequestError && (failure.status === 401 || failure.status === 403)) {
    rejectMemberSession();
    return { redirectTo: memberPaths().login };
  }
  if (failure instanceof CvRequestError) return { message: failure.message };
  console.error("Member CV load failed.", failure instanceof Error ? failure.message : failure);
  return { message: MEMBER_AUTH_UNAVAILABLE };
}

export const NEON_AUTH_SESSION_VERIFIER_PARAM = "neon_auth_session_verifier";

type SessionReader = { getSession: () => Promise<AuthCall> };

function verifierFrom(search: string): string | null {
  const value = new URLSearchParams(search).get(NEON_AUTH_SESSION_VERIFIER_PARAM)?.trim();
  return value || null;
}

export type MemberFrame = "loading" | "signed-in" | "signed-out";

export type MemberLanding = {
  account?: MemberAccount | null;
  phase: "signed-in" | "signed-out" | "unavailable";
  token: string | null;
  userId: string | null;
  status: number | null;
  error: string | null;
};

type MemberClient = Partial<SessionReader> & { token?: () => Promise<AuthCall> };

// Refresh a cached Neon JWT this long before exp. The verifier exchange stays
// cached; the JWT does not.
export const MEMBER_TOKEN_REFRESH_MARGIN_MS = 60_000;

type JwtRead = { token: string | null; status: number | null };

// In-flight or settled verifier exchange and member bootstrap. A failed
// "unavailable" result is dropped so the next call can retry. The JWT is cached
// separately and only while it is outside the refresh margin.
let landingPromise: Promise<MemberLanding> | null = null;
let jwtCache: { token: string; refreshAt: number } | null = null;
let jwtFlight: Promise<JwtRead> | null = null;
let sessionRejected = false;

function signedOutLanding(): MemberLanding {
  return {
    phase: "signed-out",
    token: null,
    userId: null,
    status: 401,
    error: "Your session has ended. Sign in again to continue.",
  };
}

export function clearMemberLanding(): void {
  landingPromise = null;
  jwtCache = null;
  jwtFlight = null;
  sessionRejected = false;
}

function rejectMemberSession(): void {
  landingPromise = null;
  jwtCache = null;
  jwtFlight = null;
  sessionRejected = true;
}

function jwtExpiryMs(token: string): number | null {
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function rememberJwt(token: string): void {
  const exp = jwtExpiryMs(token);
  if (exp === null) {
    jwtCache = null;
    return;
  }
  const refreshAt = exp - MEMBER_TOKEN_REFRESH_MARGIN_MS;
  if (refreshAt <= Date.now()) {
    jwtCache = null;
    return;
  }
  jwtCache = { token, refreshAt };
}

export function memberLandingFrame(landing: MemberLanding | null): MemberFrame {
  if (!landing) return "loading";
  if (landing.phase === "signed-in") return "signed-in";
  return "signed-out";
}

export function loginAction(landing: MemberLanding | null): "loading" | "profile" | "form" {
  const frame = memberLandingFrame(landing);
  if (frame === "loading") return "loading";
  if (frame === "signed-in") return "profile";
  return "form";
}

export function memberPageCopy(frame: MemberFrame): "Verifying your Helix account…" | "Sign in to build your CV" | "Build your CV" {
  if (frame === "loading") return "Verifying your Helix account…";
  if (frame === "signed-out") return "Sign in to build your CV";
  return "Build your CV";
}

function currentSearch(search?: string): string {
  if (search !== undefined) return search;
  return typeof window === "undefined" ? "" : window.location.search;
}

// neon-js keeps attaching a verifier that is still in the URL, and skips its
// session cache while that param is present. Remove it once this landing has
// copied it so later reads use the cookie.
export function stripNeonAuthVerifier(): void {
  if (typeof window === "undefined" || typeof history === "undefined" || typeof history.replaceState !== "function") return;
  const current = new URL(window.location.href);
  if (!current.searchParams.has(NEON_AUTH_SESSION_VERIFIER_PARAM)) return;
  current.searchParams.delete(NEON_AUTH_SESSION_VERIFIER_PARAM);
  history.replaceState(history.state, "", `${current.pathname}${current.search}${current.hash}`);
}

// neon-js reads the verifier from window.location inside an awaited request
// hook. The address bar is cleared before that await, so the one get-session
// fetch still has to carry the value that was just claimed.
function holdVerifierForSessionFetch(verifier: string): () => void {
  const current = globalThis.fetch;
  if (!current) return () => undefined;
  let armed = true;
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input);
    if (!armed || !raw.includes("/get-session") || raw.includes(`${NEON_AUTH_SESSION_VERIFIER_PARAM}=`)) {
      return current(input, init);
    }
    armed = false;
    const url = new URL(raw, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    url.searchParams.set(NEON_AUTH_SESSION_VERIFIER_PARAM, verifier);
    const next = input instanceof Request ? new Request(url, input) : url;
    return current(next, init);
  }) as typeof fetch;
  globalThis.fetch = wrapped;
  return () => {
    if (globalThis.fetch === wrapped) globalThis.fetch = current;
  };
}

const MEMBER_LOGIN_PATH = "/api/member-login";

// A missing session used to stop in the browser. The member endpoint is what
// writes the server log, so this call still happens when there is no JWT.
async function postMemberSession(
  fetchImpl: typeof fetch,
  jwt?: string,
): Promise<Response | null> {
  try {
    return await fetchImpl(MEMBER_LOGIN_PATH, {
      method: "POST",
      credentials: "include",
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    });
  } catch {
    console.error("Member session bootstrap failed.", { reason: "no_session_cookie", status: null });
    return null;
  }
}

async function fetchMemberJwt(client: MemberClient, fetchImpl: typeof fetch): Promise<JwtRead> {
  if (client.token) {
    try {
      const token = await client.token();
      if (!token.error && token.data?.token) return { token: token.data.token, status: null };
      const status = authStatus(token.error);
      if (status === 401 || status === 403) return { token: null, status };
    } catch (error) {
      const status = authStatus(error);
      if (status === 401 || status === 403) return { token: null, status };
    }
  }
  try {
    const exchanged = await fetchImpl("/api/auth/token", { method: "GET", credentials: "include" });
    const body = await exchanged.json().catch(() => null);
    const value = body && typeof body === "object" && "token" in body ? body.token : undefined;
    if (exchanged.ok && typeof value === "string" && value) return { token: value, status: null };
    return { token: null, status: exchanged.status === 401 || exchanged.status === 403 ? exchanged.status : null };
  } catch {
    return { token: null, status: null };
  }
}

async function readMemberJwt(client: MemberClient, fetchImpl: typeof fetch): Promise<JwtRead> {
  if (jwtCache && Date.now() < jwtCache.refreshAt) return { token: jwtCache.token, status: null };
  if (!jwtFlight) {
    jwtFlight = fetchMemberJwt(client, fetchImpl).then((result) => {
      if (result.token) rememberJwt(result.token);
      else if (result.status === 401 || result.status === 403) jwtCache = null;
      return result;
    }).finally(() => {
      jwtFlight = null;
    });
  }
  return jwtFlight;
}

async function runMemberLanding(
  client: MemberClient | null,
  fetchImpl: typeof fetch,
  search: string | undefined,
): Promise<MemberLanding> {
  const verifier = verifierFrom(currentSearch(search));
  const hadVerifier = Boolean(verifier);
  if (!client) return { phase: "unavailable", token: null, userId: null, status: null, error: "Member sign-in is not configured yet. Please contact Helix." };
  if (!client.getSession) {
    // Nothing else may observe the verifier while the JWT read is in flight.
    stripNeonAuthVerifier();
    const jwt = await readMemberJwt(client, fetchImpl);
    const response = await postMemberSession(fetchImpl, jwt.token ?? undefined);
    if (!response) return { phase: "unavailable", token: jwt.token, userId: null, status: jwt.status, error: "Could not start your member session. Please try again." };
    if (response.ok && jwt.token) {
      const body = await response.json().catch(() => ({}));
      return { phase: "signed-in", token: jwt.token, userId: null, status: response.status, error: null, account: readMemberAccount(body?.account) };
    }
    const body = await response.json().catch(() => ({}));
    const message = typeof body.error === "string" ? body.error : "Could not start your member session. Please try again.";
    const status = jwt.status === 401 || jwt.status === 403 ? jwt.status : response.status;
    return { phase: status === 401 || status === 403 || !jwt.token ? "signed-out" : "unavailable", token: jwt.token, userId: null, status, error: message };
  }
  const restoreFetch = verifier ? holdVerifierForSessionFetch(verifier) : () => undefined;
  let pendingSession: Promise<AuthCall>;
  try {
    pendingSession = client.getSession();
  } catch (error) {
    stripNeonAuthVerifier();
    restoreFetch();
    const failure = memberAuthFailure(error);
    if (hadVerifier) {
      console.error("Member session bootstrap failed.", { reason: "verifier_exchange_failed", status: failure.status || null });
    }
    if (failure.status === 401 || failure.status === 403) await postMemberSession(fetchImpl);
    return { phase: failure.status === 401 || failure.status === 403 ? "signed-out" : "unavailable", token: null, userId: null, status: failure.status || null, error: failure.message };
  }
  // Claimed. Drop it before this function yields, so a re-render cannot start another exchange.
  stripNeonAuthVerifier();
  let session: AuthCall;
  try {
    session = await pendingSession;
  } catch (error) {
    const failure = memberAuthFailure(error);
    if (hadVerifier) {
      console.error("Member session bootstrap failed.", { reason: "verifier_exchange_failed", status: failure.status || null });
    }
    if (failure.status === 401 || failure.status === 403) await postMemberSession(fetchImpl);
    return { phase: failure.status === 401 || failure.status === 403 ? "signed-out" : "unavailable", token: null, userId: null, status: failure.status || null, error: failure.message };
  } finally {
    restoreFetch();
  }
  if (session.error) {
    const failure = memberAuthFailure(session.error);
    if (hadVerifier) {
      console.error("Member session bootstrap failed.", { reason: "verifier_exchange_failed", status: failure.status || null });
    }
    if (failure.status === 401 || failure.status === 403) await postMemberSession(fetchImpl);
    return { phase: failure.status === 401 || failure.status === 403 ? "signed-out" : "unavailable", token: null, userId: null, status: failure.status || null, error: failure.message };
  }
  const userId = session.data?.user?.id ?? null;
  if (!userId) {
    await postMemberSession(fetchImpl);
    return { phase: "signed-out", token: null, userId: null, status: null, error: null };
  }
  const jwt = await readMemberJwt(client, fetchImpl);
  const response = await postMemberSession(fetchImpl, jwt.token ?? undefined);
  if (!response) return { phase: "unavailable", token: jwt.token, userId, status: jwt.status, error: "Could not start your member session. Please try again." };
  if (response.ok && jwt.token) {
    const body = await response.json().catch(() => ({}));
    return { phase: "signed-in", token: jwt.token, userId, status: response.status, error: null, account: readMemberAccount(body?.account) };
  }
  const body = await response.json().catch(() => ({}));
  const message = typeof body.error === "string" ? body.error : "Could not start your member session. Please try again.";
  const status = jwt.status === 401 || jwt.status === 403 ? jwt.status : response.status;
  const signedOut = status === 401 || status === 403 || !jwt.token;
  return { phase: signedOut ? "signed-out" : "unavailable", token: jwt.token, userId, status, error: message };
}

// The one-time verifier exchange and member bootstrap share this promise,
// including StrictMode's second mount. The JWT is read again for each request
// once it is inside the refresh margin. A 401 or 403 drops the cache so login
// cannot send the member back to the profile on a stale signed-in result.
export function ensureMemberLanding(
  client: MemberClient | null = authClient,
  fetchImpl: typeof fetch = fetch,
  search?: string,
): Promise<MemberLanding> {
  if (sessionRejected) return Promise.resolve(signedOutLanding());
  if (!landingPromise) {
    let run: Promise<MemberLanding>;
    run = runMemberLanding(client, fetchImpl, search).then((landing) => {
      if (sessionRejected) {
        if (landingPromise === run) landingPromise = null;
        return signedOutLanding();
      }
      if (landing.phase === "unavailable" && landingPromise === run) landingPromise = null;
      if (landing.phase !== "signed-in") jwtCache = null;
      return landing;
    });
    landingPromise = run;
  }
  return landingPromise;
}

// Google returns to Neon, which redirects here with a one-time verifier.
// neon-js copies that verifier onto get-session. Only a landing that still
// has the param needs to exchange it.
export function claimNeonAuthSession(
  client: MemberClient | null = authClient,
  search?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!client || !verifierFrom(currentSearch(search))) return Promise.resolve(false);
  return ensureMemberLanding(client, fetchImpl, search).then((landing) => landing.phase === "signed-in" || Boolean(landing.userId));
}

export async function sessionTokenFromAuth(
  client: MemberClient,
  boundUserId: { current: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (sessionRejected) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  const landing = await ensureMemberLanding(client, fetchImpl);
  if (landing.phase === "signed-in") {
    const jwt = await readMemberJwt(client, fetchImpl);
    if (jwt.token) {
      if (boundUserId.current && landing.userId && boundUserId.current !== landing.userId) {
        rejectMemberSession();
        throw new CvRequestError("The signed-in account changed. Sign in again to open your CV.", 401);
      }
      if (landing.userId) boundUserId.current = landing.userId;
      return jwt.token;
    }
    if (jwt.status === 401 || jwt.status === 403) {
      rejectMemberSession();
      throw new CvRequestError(landing.error ?? "Your session has ended. Sign in again to continue.", jwt.status);
    }
    throw new CvRequestError(landing.error ?? MEMBER_AUTH_UNAVAILABLE, jwt.status ?? 0);
  }
  if (landing.status === 401 || landing.status === 403 || landing.phase === "signed-out") {
    rejectMemberSession();
    throw new CvRequestError(landing.error ?? "Your session has ended. Sign in again to continue.", landing.status === 403 ? 403 : 401);
  }
  throw new CvRequestError(landing.error ?? MEMBER_AUTH_UNAVAILABLE, landing.status ?? 0);
}

export async function memberSessionToken(boundUserId: { current: string | null }): Promise<string> {
  if (!authClient) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  return sessionTokenFromAuth(authClient, boundUserId);
}

export function watchMemberSession(onEnd: () => void, client: MemberClient | null = authClient): () => void {
  if (!client?.getSession) return () => undefined;
  const readSession = client.getSession.bind(client);
  const onFocus = () => {
    void readSession().then((session) => {
      if (session.error) {
        const failure = memberAuthFailure(session.error);
        if (failure.status === 401 || failure.status === 403) {
          rejectMemberSession();
          onEnd();
        }
        return;
      }
      if (!session.data?.user?.id) {
        rejectMemberSession();
        onEnd();
      }
    }).catch((error: unknown) => {
      memberAuthFailure(error);
    });
  };
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}

export async function signOutMember(): Promise<void> {
  clearMemberLanding();
  if (!authClient) return;
  const result = await authClient.signOut();
  if (result.error) throw new Error("Could not sign out. Please try again.");
}

export async function confirmMemberSession(
  client: MemberClient | null = authClient,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!client) throw new Error("Member sign-in is not configured yet. Please contact Helix.");
  const landing = await ensureMemberLanding(client, fetchImpl);
  if (landing.phase === "signed-in") return;
  if (!landing.token || landing.status === 401 || landing.phase === "signed-out") {
    throw new Error("Could not start your member session. Please try again.");
  }
  throw new Error(landing.error ?? "Sign-in failed. Use your Helix Google Workspace account.");
}

function returnCandidate(source: unknown): string | null {
  if (typeof source === "string") return source;
  if (!source || typeof source !== "object") return null;
  if ("redirect" in source && typeof source.redirect === "string") return source.redirect;
  if ("next" in source && typeof source.next === "string") return source.next;
  if (!("from" in source)) return null;
  const from = source.from;
  if (typeof from === "string") return from;
  if (!from || typeof from !== "object" || !("pathname" in from) || typeof from.pathname !== "string") return null;
  const search = "search" in from && typeof from.search === "string" ? from.search : "";
  const hash = "hash" in from && typeof from.hash === "string" ? from.hash : "";
  return `${from.pathname}${search}${hash}`;
}

// A return path must be a single-slash path. `new URL` then has to stay on this origin.
export function memberSignInCallbackUrl(source: unknown, origin: string): string {
  const paths = memberPaths(origin);
  const fallback = new URL(paths.home, origin).href;
  const path = returnCandidate(source)?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  let target: URL;
  let allowedOrigin: string;
  try {
    target = new URL(path, origin);
    allowedOrigin = new URL(origin).origin;
  } catch {
    return fallback;
  }
  if (target.origin !== allowedOrigin) return fallback;
  if (isMemberPlatform(origin)) {
    if (target.pathname === "/member/profile") target.pathname = paths.profile;
    if (![paths.home, paths.profile].includes(target.pathname)) return fallback;
  } else if (target.pathname !== "/member" && !target.pathname.startsWith("/member/")) return fallback;
  return new URL(`${target.pathname}${target.search}${target.hash}`, origin).href;
}

export function googleSignInRequest(source: unknown, origin: string): {
  provider: "google";
  callbackURL: string;
  errorCallbackURL: string;
} {
  const callbackURL = memberSignInCallbackUrl(source, origin);
  const errorCallbackURL = isMemberPlatform(origin) ? new URL(memberPaths(origin).login, origin).href : callbackURL;
  return { provider: "google", callbackURL, errorCallbackURL };
}

export async function startGoogleSignIn(returnTo?: unknown): Promise<void> {
  if (!authClient) throw new Error("Member sign-in is not configured yet. Please contact Helix.");
  let result: { error?: unknown } | undefined;
  try {
    result = await authClient.signIn.social(googleSignInRequest(returnTo, window.location.origin));
  } catch (error) {
    console.error("Member auth sign-in failed.", authErrorDetail(error));
    throw new Error("Google sign-in failed. Please try again.");
  }
  if (result?.error) {
    console.error("Member auth sign-in failed.", authErrorDetail(result.error));
    throw new Error("Google sign-in failed. Please try again.");
  }
}
