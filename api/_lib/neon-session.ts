import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { MemberCvError } from "./member-cv-error.js";
import type { WorkspaceProof } from "./helix-workspace.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
let cachedKeys: { url: string; keys: JWTVerifyGetKey } | undefined;

export function authIssuer(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

function jwks(url: string): JWTVerifyGetKey {
  if (!cachedKeys || cachedKeys.url !== url) cachedKeys = { url, keys: createRemoteJWKSet(new URL(url)) };
  return cachedKeys.keys;
}

// Issuer and audience are the Neon Auth origin. The browser may reach Neon
// through the same-origin /api/auth proxy; the token is still minted there.
export async function verifyNeonSession(token: string, env: NodeJS.ProcessEnv = process.env): Promise<{ userId: string }> {
  const baseUrl = env.NEON_AUTH_BASE_URL;
  if (!baseUrl) throw new MemberCvError(503, "Member portal server configuration is missing.");
  const issuer = authIssuer(baseUrl);
  try {
    const { payload } = await jwtVerify(token, jwks(`${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`), {
      issuer,
      audience: issuer,
      algorithms: ["EdDSA"],
      requiredClaims: ["exp", "sub"],
    });
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) throw new Error("subject");
    return { userId: payload.sub };
  } catch (error) {
    if (error instanceof MemberCvError) throw error;
    throw new MemberCvError(401, "Your session has expired. Log in again.");
  }
}

export async function verifyGoogleIdToken(
  idToken: string,
  env: NodeJS.ProcessEnv = process.env,
  jwksUrl = GOOGLE_JWKS_URL,
): Promise<Pick<WorkspaceProof, "email" | "emailVerified" | "hd" | "googleSub"> | null> {
  const audience = env.GOOGLE_CLIENT_ID;
  if (!audience) throw new MemberCvError(503, "Member Google sign-in is not configured.");
  try {
    const { payload } = await jwtVerify(idToken, jwks(jwksUrl), {
      issuer: GOOGLE_ISSUERS,
      audience,
      algorithms: ["RS256"],
    });
    const email = payload.email;
    if (typeof payload.sub !== "string" || typeof email !== "string" || !email) return null;
    return {
      googleSub: payload.sub,
      email: email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      hd: typeof payload.hd === "string" ? payload.hd : undefined,
    };
  } catch (error) {
    if (error instanceof MemberCvError) throw error;
    return null;
  }
}
