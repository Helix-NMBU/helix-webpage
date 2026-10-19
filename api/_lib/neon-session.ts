import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { OAuth2Client } from "google-auth-library";
import { MemberCvError } from "./member-cv-error.js";
import type { WorkspaceProof } from "./helix-workspace.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let cachedKeys: { url: string; keys: JWTVerifyGetKey } | undefined;

export function authIssuer(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

export async function verifyNeonSession(token: string, env: NodeJS.ProcessEnv = process.env): Promise<{ userId: string }> {
  const baseUrl = env.NEON_AUTH_BASE_URL;
  if (!baseUrl) throw new MemberCvError(503, "Member portal server configuration is missing.");
  const issuer = authIssuer(baseUrl);
  const jwksUrl = `${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`;
  if (!cachedKeys || cachedKeys.url !== jwksUrl) cachedKeys = { url: jwksUrl, keys: createRemoteJWKSet(new URL(jwksUrl)) };
  try {
    const { payload } = await jwtVerify(token, cachedKeys.keys, { issuer, audience: issuer });
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) throw new Error("subject");
    return { userId: payload.sub };
  } catch (error) {
    if (error instanceof MemberCvError) throw error;
    throw new MemberCvError(401, "Your session has expired. Log in again.");
  }
}

export async function verifyGoogleIdToken(idToken: string, env: NodeJS.ProcessEnv = process.env): Promise<Pick<WorkspaceProof, "email" | "emailVerified" | "hd" | "googleSub"> | null> {
  const audience = env.GOOGLE_CLIENT_ID;
  if (!audience) throw new MemberCvError(503, "Member Google sign-in is not configured.");
  try {
    const payload = (await new OAuth2Client(audience).verifyIdToken({ idToken, audience })).getPayload();
    if (!payload?.sub || !payload.email || !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss ?? "")) return null;
    return { googleSub: payload.sub, email: payload.email.toLowerCase(), emailVerified: payload.email_verified === true, hd: payload.hd };
  } catch (error) {
    if (error instanceof MemberCvError) throw error;
    return null;
  }
}
