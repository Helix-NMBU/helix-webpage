import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GMAIL_MODIFY_SCOPE, GMAIL_OAUTH_STATE_COOKIE, verifyStateCookie } from "./gmail-connect-handler.js";
import { createGmailConnectionStore, type GmailConnectionStore } from "./gmail-connection.js";
import { MemberCvError } from "./member-cv-error.js";

type OAuthTokenResponse = { access_token?: unknown; refresh_token?: unknown; scope?: unknown };
type GmailProfileResponse = { emailAddress?: unknown };

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function config(env: NodeJS.ProcessEnv): { clientId: string; clientSecret: string; redirectUri: string; stateSecret: string } | null {
  const clientId = env.GMAIL_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GMAIL_OAUTH_REDIRECT_URI?.trim();
  const stateSecret = env.GMAIL_OAUTH_STATE_SECRET?.trim();
  if (!clientId || !clientSecret || !redirectUri || !stateSecret || stateSecret.length < 32) return null;
  return { clientId, clientSecret, redirectUri, stateSecret };
}

function clearStateCookie(): string {
  return `${GMAIL_OAUTH_STATE_COOKIE}=; Max-Age=0; Path=/api; HttpOnly; SameSite=Lax; Secure`;
}

async function exchangeCode(code: string, configuration: NonNullable<ReturnType<typeof config>>, fetchImpl: typeof fetch): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: configuration.clientId, client_secret: configuration.clientSecret, redirect_uri: configuration.redirectUri, grant_type: "authorization_code" }),
  });
  const body = await response.json().catch(() => null) as OAuthTokenResponse | null;
  if (!response.ok || typeof body?.access_token !== "string" || typeof body.refresh_token !== "string") throw new MemberCvError(502, "Google did not return a reusable Gmail connection.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token, scope: typeof body.scope === "string" ? body.scope : GMAIL_MODIFY_SCOPE };
}

async function gmailProfile(accessToken: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => null) as GmailProfileResponse | null;
  if (!response.ok || typeof body?.emailAddress !== "string" || !body.emailAddress.trim()) throw new MemberCvError(502, "Google did not return the connected Gmail account.");
  return body.emailAddress.trim().toLowerCase();
}

export function createGmailCallbackHandler(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  getStore: () => GmailConnectionStore = () => createGmailConnectionStore(),
  now = () => Date.now(),
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Set-Cookie", clearStateCookie());
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    const configuration = config(env);
    if (!configuration) return res.status(503).json({ error: "Gmail connection is not configured yet." });
    const state = queryValue(req.query.state);
    const code = queryValue(req.query.code);
    const oauthError = queryValue(req.query.error);
    if (oauthError) return res.redirect(302, "/mail?gmail=denied");
    if (!state || !code) return res.status(400).json({ error: "The Gmail connection response was incomplete." });
    const verifiedState = verifyStateCookie(req.headers.cookie, state, configuration.stateSecret, now());
    if (!verifiedState) return res.status(400).json({ error: "The Gmail connection request expired. Start again." });
    try {
      const store = getStore();
      const memberEmail = await store.memberEmail(verifiedState.memberId);
      if (!memberEmail) return res.status(403).json({ error: "The member account could not be found." });
      const tokens = await exchangeCode(code, configuration, fetchImpl);
      const gmailEmail = await gmailProfile(tokens.accessToken, fetchImpl);
      if (gmailEmail !== memberEmail) return res.status(403).json({ error: "Connect the Gmail account belonging to your Helix member account." });
      await store.save(verifiedState.memberId, gmailEmail, tokens.refreshToken, tokens.scope);
      return res.redirect(302, "/mail?gmail=connected");
    } catch (error) {
      const status = error instanceof MemberCvError ? error.status : 503;
      const message = error instanceof MemberCvError ? error.message : "Gmail connection could not be completed. Try again.";
      console.error("Gmail OAuth callback failed.", { status });
      return res.status(status).json({ error: message });
    }
  };
}
