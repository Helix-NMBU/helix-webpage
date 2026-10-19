import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import { CvRequestError } from "./repository";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;

export const memberAuthConfigured = Boolean(authUrl);

export const authClient = authUrl
  ? createAuthClient(authUrl, {
      adapter: BetterAuthVanillaAdapter({
        fetchOptions: { credentials: "include" },
      }),
    })
  : null;

export async function memberSessionToken(boundUserId: { current: string | null }): Promise<string> {
  if (!authClient) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  if (session.error || !userId) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  if (boundUserId.current && boundUserId.current !== userId) {
    throw new CvRequestError("The signed-in account changed. Sign in again to open your CV.", 401);
  }
  boundUserId.current = userId;
  const token = await authClient.token();
  if (token.error || !token.data?.token) throw new CvRequestError("Your session has ended. Sign in again to continue.", 401);
  return token.data.token;
}

export function watchMemberSession(onEnd: () => void): () => void {
  if (!authClient) return () => undefined;
  const onFocus = () => {
    void authClient.getSession().then((session) => {
      if (!session.data?.user) onEnd();
    }).catch(() => onEnd());
  };
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}

export async function signOutMember(): Promise<void> {
  if (!authClient) return;
  const result = await authClient.signOut();
  if (result.error) throw new Error("Could not sign out. Please try again.");
}

export async function confirmMemberSession(): Promise<void> {
  if (!authClient) throw new Error("Member sign-in is not configured yet. Please contact Helix.");
  const token = await authClient.token();
  if (token.error || !token.data?.token) throw new Error("Could not start your member session. Please try again.");
  const response = await fetch("/api/member-login", {
    method: "POST",
    headers: { Authorization: `Bearer ${token.data.token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Sign-in failed. Use your Helix Google Workspace account.");
}

export async function startGoogleSignIn(): Promise<void> {
  if (!authClient) throw new Error("Member sign-in is not configured yet. Please contact Helix.");
  const callbackURL = `${window.location.origin}/member/login`;
  const result = await authClient.signIn.social({
    provider: "google",
    callbackURL,
    errorCallbackURL: callbackURL,
  });
  if (result?.error) throw new Error("Google sign-in failed. Please try again.");
}
