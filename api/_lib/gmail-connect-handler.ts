import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer, MemberCvError, neonCvServices, type WorkspaceIdentity } from "./member-cv-service.js";

export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
export const GMAIL_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GMAIL_OAUTH_STATE_COOKIE = "helix_gmail_oauth_state";

type GmailConnectEnv = NodeJS.ProcessEnv;
type Authenticate = (token: string) => Promise<WorkspaceIdentity>;

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function stateCookie(memberId: string, state: string, secret: string, now: number): string {
  const payload = encode(JSON.stringify({
    memberId,
    state,
    expiresAt: now + GMAIL_OAUTH_STATE_TTL_SECONDS * 1000,
  }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${GMAIL_OAUTH_STATE_COOKIE}=${payload}.${signature}; Max-Age=${GMAIL_OAUTH_STATE_TTL_SECONDS}; Path=/api; HttpOnly; SameSite=Lax; Secure`;
}

function cookieValue(header: string | undefined, name: string): string | null {
  const value = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : null;
}

export function verifyStateCookie(header: string | undefined, state: string, secret: string, now: number): { memberId: string } | null {
  const value = cookieValue(header, GMAIL_OAUTH_STATE_COOKIE);
  const [payload, signature] = value?.split(".") ?? [];
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { memberId?: unknown; state?: unknown; expiresAt?: unknown };
    if (parsed.state !== state || typeof parsed.memberId !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt < now) return null;
    return { memberId: parsed.memberId };
  } catch {
    return null;
  }
}

function configuration(env: GmailConnectEnv): { clientId: string; redirectUri: string; stateSecret: string } | null {
  const clientId = env.GMAIL_GOOGLE_CLIENT_ID?.trim();
  const redirectUri = env.GMAIL_OAUTH_REDIRECT_URI?.trim();
  const stateSecret = env.GMAIL_OAUTH_STATE_SECRET?.trim();
  if (!clientId || !redirectUri || !stateSecret || stateSecret.length < 32) return null;
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return null;
  } catch {
    return null;
  }
  return { clientId, redirectUri, stateSecret };
}

function failure(error: unknown): { status: number; message: string } {
  if (error instanceof MemberCvError) return { status: error.status, message: error.message };
  return { status: 503, message: "Gmail connection is temporarily unavailable. Try again." };
}

export function createGmailConnectHandler(
  authenticate: Authenticate = (token) => neonCvServices().authenticate(token),
  env: GmailConnectEnv = process.env,
  now = () => Date.now(),
  randomState = () => randomBytes(32).toString("base64url"),
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    const config = configuration(env);
    if (!config) return res.status(503).json({ error: "Gmail connection is not configured yet." });
    try {
      const identity = await authenticate(bearer(req.headers.authorization));
      const state = randomState();
      const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorization.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: GMAIL_MODIFY_SCOPE,
        access_type: "offline",
        include_granted_scopes: "true",
        prompt: "consent",
        state,
        login_hint: identity.email,
      }).toString();
      res.setHeader("Set-Cookie", stateCookie(identity.userId, state, config.stateSecret, now()));
      return res.status(200).json({ url: authorization.toString() });
    } catch (error) {
      const result = failure(error);
      return res.status(result.status).json({ error: result.message });
    }
  };
}
