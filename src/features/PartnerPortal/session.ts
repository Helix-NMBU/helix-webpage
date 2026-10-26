import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";

// Always use the existing same-origin Neon proxy, including its cookie handling.
// Keep partner login independent of the Google-only member onboarding endpoint.
export function createPartnerAuthClient(origin: string) {
  return createAuthClient(new URL("/api/auth", origin).href, {
    adapter: BetterAuthVanillaAdapter({ fetchOptions: { credentials: "include" } }),
  });
}
type PartnerAuthClient = ReturnType<typeof createPartnerAuthClient>;
let client: PartnerAuthClient | undefined;
export function partnerAuthClient(): PartnerAuthClient {
  return client ??= createPartnerAuthClient(window.location.origin);
}

export class PartnerRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function authFailure(error: unknown, fallback: string): PartnerRequestError {
  const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 0;
  return new PartnerRequestError(fallback, status);
}

export async function sendPartnerOtp(email: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const response = await fetchImpl("/api/partner?action=request-otp", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!response.ok) throw new PartnerRequestError("Could not request a sign-in code. Try again shortly.", response.status);
  } catch (error) {
    if (error instanceof PartnerRequestError) throw error;
    throw authFailure(error, "Could not request a sign-in code. Try again shortly.");
  }
}

// Subscribing also starts Better Auth's cross-tab session refresh manager.
// Hide private data during revalidation, before a changed identity is resolved.
export function watchPartnerAuthSession(invalidate: () => void, reload: (authenticated?: boolean) => void, auth = partnerAuthClient()): () => void {
  return auth.useSession.subscribe((state) => {
    invalidate();
    if (!state.isPending && !state.isRefetching) reload(Boolean(state.data?.user?.id));
  });
}

export async function verifyPartnerOtp(email: string, otp: string, auth = partnerAuthClient()): Promise<void> {
  try {
    const result = await auth.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: otp.trim() });
    if (result.error) throw authFailure(result.error, "The code could not be verified. Check it or request a new code.");
  } catch (error) {
    if (error instanceof PartnerRequestError) throw error;
    throw authFailure(error, "The code could not be verified. Check it or request a new code.");
  }
}

export async function hasPartnerAuthSession(auth = partnerAuthClient()): Promise<boolean> {
  try {
    const result = await auth.getSession({ fetchOptions: { headers: { "X-Force-Fetch": "true" } } });
    if (result.error) {
      const failure = authFailure(result.error, "Could not check your session. Try again.");
      if (failure.status === 401 || failure.status === 403) return false;
      throw failure;
    }
    return Boolean(result.data?.user?.id);
  } catch (error) {
    const failure = error instanceof PartnerRequestError ? error : authFailure(error, "Could not check your session. Try again.");
    if (failure.status === 401 || failure.status === 403) return false;
    throw failure;
  }
}

export async function partnerSessionToken(auth = partnerAuthClient()): Promise<string> {
  try {
    const result = await auth.token({ fetchOptions: { headers: { "X-Force-Fetch": "true" } } });
    if (result.error) throw authFailure(result.error, "Your session could not be verified. Sign in again.");
    if (!result.data?.token) throw new PartnerRequestError("Your session has ended. Sign in again.", 401);
    return result.data.token;
  } catch (error) {
    if (error instanceof PartnerRequestError) throw error;
    throw authFailure(error, "Your session could not be verified. Sign in again.");
  }
}

export async function signOutPartner(auth = partnerAuthClient()): Promise<void> {
  try {
    const result = await auth.signOut();
    if (result.error) throw authFailure(result.error, "Could not sign out. Try again.");
  } catch (error) {
    if (error instanceof PartnerRequestError) throw error;
    throw authFailure(error, "Could not sign out. Try again.");
  }
}
