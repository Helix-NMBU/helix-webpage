import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import type { SponsorContext } from "./types";

export class SponsorRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
type SessionResult = { data?: { user?: { id?: string } | null } | null; error?: unknown };
export interface SponsorSessionClient {
  getSession(options?: { fetchOptions?: { headers?: Record<string, string> } }): Promise<SessionResult>;
  signOut(): Promise<{ error?: unknown }>;
}

function authUrl(): string | null {
  const configured = import.meta.env.VITE_NEON_AUTH_URL?.trim();
  if (!configured || typeof window === "undefined") return null;
  try { return new URL(configured, window.location.origin).href.replace(/\/$/, ""); }
  catch { return null; }
}
const url = authUrl();
export const sponsorAuthClient: SponsorSessionClient | null = url
  ? createAuthClient(url, { adapter: BetterAuthVanillaAdapter({ fetchOptions: { credentials: "include" } }) })
  : null;
let boundUserId: string | null = null;

function statusOf(error: unknown): number {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 503;
}
function sessionError(error: unknown): SponsorRequestError {
  const status = statusOf(error);
  return new SponsorRequestError(status === 401 || status === 403 ? "Your session has ended. Sign in again." : "Could not verify your session. Try again.", status);
}
function tokenSubject(token: string): string | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part + "=".repeat((4 - part.length % 4) % 4))) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

export async function sponsorToken(
  expectedUserId: string | null = boundUserId,
  client: SponsorSessionClient | null = sponsorAuthClient,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!client) throw new SponsorRequestError("Sponsor sign-in is not configured.", 503);
  let session: SessionResult;
  try { session = await client.getSession({ fetchOptions: { headers: { "X-Force-Fetch": "true" } } }); }
  catch (error) { throw sessionError(error); }
  if (session.error) throw sessionError(session.error);
  const current = session.data?.user?.id;
  if (!current || (expectedUserId && current !== expectedUserId)) throw new SponsorRequestError("Your account changed. Sign in again.", 401);
  let response: Response;
  try { response = await fetchImpl("/api/auth/token", { credentials: "include", cache: "no-store" }); }
  catch { throw new SponsorRequestError("Could not verify your session. Try again.", 503); }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw sessionError({ status: response.status });
  const token = result && typeof result === "object" && "token" in result ? result.token : null;
  // This is an account-switch guard only. The server verifies the JWT signature.
  if (typeof token !== "string" || tokenSubject(token) !== current) throw new SponsorRequestError("Your account changed. Sign in again.", 401);
  return token;
}

export async function sponsorRequest<T>(action: string, options: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const { query = {}, ...init } = options;
  const token = await sponsorToken();
  let response: Response;
  try {
    const params = new URLSearchParams({ ...query, action });
    response = await fetch(`/api/sponsor?${params}`, {
      ...init, credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${token}` },
    });
  } catch { throw new SponsorRequestError("Could not reach the sponsor portal. Try again.", 503); }
  const result = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new SponsorRequestError(result?.error ?? "Could not complete this request.", response.status);
  return result as T;
}

export async function loadSponsorSession(): Promise<SponsorContext> {
  if (!sponsorAuthClient) throw new SponsorRequestError("Sponsor sign-in is not configured.", 503);
  boundUserId = null;
  // Let Neon claim the callback verifier while it is still in the URL. This must
  // not invoke the member-only bootstrap, which rejects external sponsors.
  try {
    const session = await sponsorAuthClient.getSession({ fetchOptions: { headers: { "X-Force-Fetch": "true" } } });
    if (session.error) throw session.error;
  } catch (error) { throw sessionError(error); }
  const current = new URL(window.location.href);
  if (current.searchParams.has("neon_auth_session_verifier")) {
    current.searchParams.delete("neon_auth_session_verifier");
    history.replaceState(history.state, "", `${current.pathname}${current.search}${current.hash}`);
  }
  const context = await sponsorRequest<SponsorContext>("session");
  boundUserId = context.authUserId;
  return context;
}

export async function requestSponsorLogin(email: string): Promise<string> {
  const response = await fetch("/api/sponsor?action=login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
  });
  const result = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  if (!response.ok) throw new SponsorRequestError(result?.error ?? "Could not request a sign-in link.", response.status);
  return result?.message ?? "If your invitation is active, a sign-in link will arrive shortly.";
}

export async function sponsorSignOut(): Promise<void> {
  if (!sponsorAuthClient) throw new SponsorRequestError("Sponsor sign-in is not configured.", 503);
  const result = await sponsorAuthClient.signOut();
  if (result.error) throw sessionError(result.error);
  boundUserId = null;
}

export function watchSponsorSession(expectedUserId: string, onEnd: () => void, onUnavailable?: () => void): () => void {
  let active = true;
  const check = () => {
    void sponsorToken(expectedUserId).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof SponsorRequestError && (error.status === 401 || error.status === 403)) { active = false; onEnd(); }
      else onUnavailable?.();
    });
  };
  window.addEventListener("focus", check);
  return () => { active = false; window.removeEventListener("focus", check); };
}
