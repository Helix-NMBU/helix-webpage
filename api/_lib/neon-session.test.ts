import { createServer, type Server } from "node:http";
import { generateKeyPair, exportJWK, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyGoogleIdToken, verifyNeonSession } from "./neon-session.js";

const userId = "cfccf73f-0043-4a02-86c8-e86d4d2f02fd";
const clientId = "helix-google-client";

type SignedKey = { privateKey: CryptoKey; jwk: JWK };

async function keyPair(alg: "EdDSA" | "RS256", kid: string): Promise<SignedKey> {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.alg = alg;
  jwk.kid = kid;
  jwk.use = "sig";
  return { privateKey, jwk };
}

function sign(
  key: SignedKey,
  claims: { iss: string; aud: string; sub?: string; exp?: number | string; extra?: Record<string, unknown> },
) {
  const jwt = new SignJWT(claims.extra ?? {});
  jwt.setProtectedHeader({ alg: key.jwk.alg ?? "EdDSA", kid: key.jwk.kid });
  jwt.setIssuer(claims.iss);
  jwt.setAudience(claims.aud);
  if (claims.sub) jwt.setSubject(claims.sub);
  if (claims.exp !== undefined) jwt.setExpirationTime(claims.exp);
  return jwt.sign(key.privateKey);
}

describe("Neon and Google token verification", () => {
  let server: Server;
  let origin = "";
  let neonEnv: NodeJS.ProcessEnv;
  let googleJwks = "";
  let ed: SignedKey;
  let rsa: SignedKey;
  let stranger: SignedKey;

  beforeAll(async () => {
    ed = await keyPair("EdDSA", "neon-ed");
    rsa = await keyPair("RS256", "google-rsa");
    stranger = await keyPair("EdDSA", "unknown");
    const neonJwks = { keys: [ed.jwk, { ...rsa.jwk, kid: "neon-rsa" }] };
    const googleKeys = { keys: [rsa.jwk, { ...ed.jwk, kid: "google-ed" }] };
    server = createServer((request, response) => {
      const path = request.url?.split("?")[0] ?? "";
      const body = path.endsWith("/.well-known/jwks.json") ? neonJwks : path === "/certs" ? googleKeys : null;
      response.writeHead(body ? 200 : 404, { "content-type": "application/json" });
      response.end(body ? JSON.stringify(body) : "");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("JWKS server did not bind");
    origin = `http://127.0.0.1:${address.port}`;
    neonEnv = { NEON_AUTH_BASE_URL: `${origin}/neondb/auth` };
    googleJwks = `${origin}/certs`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  function neonToken(overrides: Partial<{ iss: string; aud: string; sub: string; exp: number | string; key: SignedKey }> = {}) {
    return sign(overrides.key ?? ed, {
      iss: overrides.iss ?? origin,
      aud: overrides.aud ?? origin,
      sub: overrides.sub === undefined ? userId : overrides.sub,
      exp: overrides.exp === undefined ? "2m" : overrides.exp,
    });
  }

  it("accepts an EdDSA Neon session and rejects the website origin, issuer, audience, expiry, subject and unknown or non-EdDSA keys", async () => {
    await expect(verifyNeonSession(await neonToken(), neonEnv)).resolves.toEqual({ userId });
    const website = "https://helix.example";
    await expect(verifyNeonSession(await neonToken({ iss: website, aud: website }), neonEnv)).rejects.toMatchObject({ status: 401 });
    await expect(verifyNeonSession(await neonToken({ iss: "https://evil.example" }), neonEnv)).rejects.toMatchObject({ status: 401 });
    await expect(verifyNeonSession(await neonToken({ aud: "https://evil.example" }), neonEnv)).rejects.toMatchObject({ status: 401 });
    await expect(verifyNeonSession(await neonToken({ exp: Math.floor(Date.now() / 1000) - 60 }), neonEnv)).rejects.toMatchObject({ status: 401 });
    await expect(verifyNeonSession(await sign(ed, { iss: origin, aud: origin, exp: "2m" }), neonEnv)).rejects.toMatchObject({ status: 401 });
    await expect(verifyNeonSession(await sign(ed, { iss: origin, aud: origin, sub: userId }), neonEnv)).rejects.toMatchObject({ status: 401 });
    await expect(verifyNeonSession(await neonToken({ key: stranger }), neonEnv)).rejects.toMatchObject({ status: 401 });
    const rsaSigned = await sign(
      { privateKey: rsa.privateKey, jwk: { ...rsa.jwk, kid: "neon-rsa" } },
      { iss: origin, aud: origin, sub: userId, exp: "2m" },
    );
    await expect(verifyNeonSession(rsaSigned, neonEnv)).rejects.toMatchObject({ status: 401 });
  });

  it("accepts an RS256 Google ID token and rejects issuer, audience, expiry, an unknown key and EdDSA", async () => {
    const env = { GOOGLE_CLIENT_ID: clientId };
    const claims = { email: "Ase@helixnmbu.no", email_verified: true, hd: "helixnmbu.no" };
    const valid = await sign(rsa, { iss: "https://accounts.google.com", aud: clientId, sub: "google-sub", exp: "2m", extra: claims });
    await expect(verifyGoogleIdToken(valid, env, googleJwks)).resolves.toEqual({
      googleSub: "google-sub",
      email: "ase@helixnmbu.no",
      emailVerified: true,
      hd: "helixnmbu.no",
    });
    const bareIssuer = await sign(rsa, { iss: "accounts.google.com", aud: clientId, sub: "google-sub", exp: "2m", extra: claims });
    await expect(verifyGoogleIdToken(bareIssuer, env, googleJwks)).resolves.toMatchObject({ email: "ase@helixnmbu.no" });
    await expect(verifyGoogleIdToken(await sign(rsa, { iss: "https://evil.example", aud: clientId, sub: "google-sub", exp: "2m", extra: claims }), env, googleJwks)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await sign(rsa, { iss: "https://accounts.google.com", aud: "other-client", sub: "google-sub", exp: "2m", extra: claims }), env, googleJwks)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await sign(rsa, { iss: "https://accounts.google.com", aud: clientId, sub: "google-sub", exp: Math.floor(Date.now() / 1000) - 60, extra: claims }), env, googleJwks)).resolves.toBeNull();
    await expect(verifyGoogleIdToken(await sign(stranger, { iss: "https://accounts.google.com", aud: clientId, sub: "google-sub", exp: "2m", extra: claims }), env, googleJwks)).resolves.toBeNull();
    const eddsa = await sign(
      { privateKey: ed.privateKey, jwk: { ...ed.jwk, kid: "google-ed" } },
      { iss: "https://accounts.google.com", aud: clientId, sub: "google-sub", exp: "2m", extra: claims },
    );
    await expect(verifyGoogleIdToken(eddsa, env, googleJwks)).resolves.toBeNull();
  });
});
