import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import { CvRequestError } from "./repository";

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

export function memberLoadFailure(failure: unknown): { redirectTo: "/member/login" } | { message: string } {
  if (failure instanceof CvRequestError && (failure.status === 401 || failure.status === 403)) {
    return { redirectTo: "/member/login" };
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

let pendingClaim: { verifier: string; promise: Promise<boolean> } | null = null;

// Google returns to Neon, which redirects here with a one-time verifier.
// neon-js copies that verifier onto get-session, and the response Set-Cookie
// is what puts the session on this origin. Any landing page has to run it.
export function claimNeonAuthSession(
  client: SessionReader | null = authClient,
  search?: string,
): Promise<boolean> {
  const current = search ?? (typeof window === "undefined" ? "" : window.location.search);
  const verifier = verifierFrom(current);
  if (!client || !verifier) return Promise.resolve(false);
  if (pendingClaim?.verifier === verifier) return pendingClaim.promise;
  const promise = client.getSession().then((session) => {
    if (session.error || !session.data?.user) {
      console.error("Member session bootstrap failed.", {
        reason: "verifier_exchange_failed",
        status: authStatus(session.error),
      });
      return false;
    }
    return true;
  }).catch((error: unknown) => {
    console.error("Member session bootstrap failed.", {
      reason: "verifier_exchange_failed",
      status: authStatus(error),
    });
    return false;
  }).finally(() => {
    if (pendingClaim?.verifier === verifier) pendingClaim = null;
  });
  pendingClaim = { verifier, promise };
  return promise;
}

export async function sessionTokenFromAuth(
  client: { getSession: () => Promise<AuthCall>; token: () => Promise<AuthCall> },
  boundUserId: { current: string | null },
): Promise<string> {
  await claimNeonAuthSession(client);
  let session: AuthCall;
  try {
    session = await client.getSession();
  } catch (error) {
    throw memberAuthFailure(error);
  }
  if (session.error) throw memberAuthFailure(session.error);
  const userId = session.data?.user?.id;
  if (!userId) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  if (boundUserId.current && boundUserId.current !== userId) {
    throw new CvRequestError("The signed-in account changed. Sign in again to open your CV.", 401);
  }
  boundUserId.current = userId;
  let token: AuthCall;
  try {
    token = await client.token();
  } catch (error) {
    throw memberAuthFailure(error);
  }
  if (token.error) throw memberAuthFailure(token.error);
  if (!token.data?.token) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  return token.data.token;
}

export async function memberSessionToken(boundUserId: { current: string | null }): Promise<string> {
  if (!authClient) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  return sessionTokenFromAuth(authClient, boundUserId);
}

export function watchMemberSession(onEnd: () => void): () => void {
  if (!authClient) return () => undefined;
  const onFocus = () => {
    void authClient.getSession().then((session) => {
      if (session.error) {
        const failure = memberAuthFailure(session.error);
        if (failure.status === 401 || failure.status === 403) onEnd();
        return;
      }
      if (!session.data?.user) onEnd();
    }).catch((error: unknown) => {
      memberAuthFailure(error);
    });
  };
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}

export async function signOutMember(): Promise<void> {
  if (!authClient) return;
  const result = await authClient.signOut();
  if (result.error) throw new Error("Could not sign out. Please try again.");
}

export async function confirmMemberSession(
  client: ({ token: () => Promise<AuthCall> } & Partial<SessionReader>) | null = authClient,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!client) throw new Error("Member sign-in is not configured yet. Please contact Helix.");
  if (client.getSession) await claimNeonAuthSession({ getSession: client.getSession });
  let jwt: string | null = null;
  try {
    const token = await client.token();
    if (!token.error && token.data?.token) jwt = token.data.token;
  } catch {
    jwt = null;
  }
  // The session cookie is stored for /api/auth, so this origin reads it there.
  if (!jwt) {
    const exchanged = await fetchImpl("/api/auth/token", { method: "GET", credentials: "include" });
    const exchangedBody = await exchanged.json().catch(() => null);
    const exchangedToken = exchangedBody && typeof exchangedBody === "object" && "token" in exchangedBody
      ? exchangedBody.token
      : undefined;
    if (exchanged.ok && typeof exchangedToken === "string" && exchangedToken) jwt = exchangedToken;
  }
  const response = await fetchImpl("/api/member-login", {
    method: "POST",
    credentials: "include",
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Member session bootstrap failed.", {
      reason: jwt ? "member_login_rejected" : "no_token",
      status: response.status,
    });
    const rejected = typeof body.error === "string" ? body.error : "Sign-in failed. Use your Helix Google Workspace account.";
    throw new Error(jwt ? rejected : "Could not start your member session. Please try again.");
  }
}

const MEMBER_PROFILE_PATH = "/member/profile";

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
  const fallback = new URL(MEMBER_PROFILE_PATH, origin).href;
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
  if (target.pathname !== "/member" && !target.pathname.startsWith("/member/")) return fallback;
  return new URL(`${target.pathname}${target.search}${target.hash}`, origin).href;
}

export function googleSignInRequest(source: unknown, origin: string): {
  provider: "google";
  callbackURL: string;
  errorCallbackURL: string;
} {
  const callbackURL = memberSignInCallbackUrl(source, origin);
  return { provider: "google", callbackURL, errorCallbackURL: callbackURL };
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
