import { getVercelOidcToken } from "@vercel/oidc";
import { importPKCS8, SignJWT } from "jose";
import { InvoiceTransferError } from "./finance-transfer-error.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN = "https://oauth2.googleapis.com/token";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

/** Server-controlled credentials only. Never accept delegation or provider URLs from a request. */
export function createFinanceGoogleAuth(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  oidcToken: () => Promise<string> = getVercelOidcToken,
): { accessToken(deadline?: number): Promise<string> } | null {
  const audience = env.FINANCE_GOOGLE_WIF_AUDIENCE;
  const email = env.FINANCE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const federated = audience !== undefined || email !== undefined;
  let credential: {
    type?: string;
    client_email?: string;
    private_key?: string;
    private_key_id?: string;
    token_uri?: string;
    subject?: string;
    sub?: string;
  } = {};
  if (federated) {
    if (
      env.VERCEL_ENV !== "production" ||
      !audience ||
      !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]{4,32}\/providers\/[a-z0-9-]{4,32}$/.test(
        audience,
      ) ||
      !email ||
      !/^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(
        email,
      )
    )
      return null;
  } else {
    try {
      credential = JSON.parse(
        env.FINANCE_GOOGLE_SERVICE_ACCOUNT_JSON ?? "null",
      );
    } catch {
      return null;
    }
    if (
      !credential ||
      credential.type !== "service_account" ||
      !credential.client_email?.endsWith(".gserviceaccount.com") ||
      !credential.private_key ||
      credential.subject ||
      credential.sub ||
      (credential.token_uri && credential.token_uri !== TOKEN)
    )
      return null;
  }
  let cached: { token: string; until: number } | undefined;
  function timeout(deadline?: number) {
    if (deadline && deadline <= Date.now())
      throw new InvoiceTransferError("provider_unavailable");
    return AbortSignal.timeout(
      Math.max(1, Math.min(5000, (deadline ?? Date.now() + 5000) - Date.now())),
    );
  }
  async function post(
    url: string,
    body: BodyInit,
    headers: Record<string, string>,
    deadline?: number,
  ) {
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      signal: timeout(deadline),
      headers,
      body,
    });
    if (!response.ok)
      throw new InvoiceTransferError(
        response.status === 401 || response.status === 403
          ? "provider_permission"
          : "provider_unavailable",
      );
    return response;
  }
  return {
    async accessToken(deadline) {
      if (deadline && deadline <= Date.now())
        throw new InvoiceTransferError("provider_unavailable");
      if (cached && cached.until > Date.now() + 30_000) return cached.token;
      try {
        if (federated) {
          // The SDK may refresh runtime identity; it shares the transfer deadline.
          let timer: ReturnType<typeof setTimeout> | undefined;
          const limit = Math.max(
            1,
            Math.min(5000, (deadline ?? Date.now() + 5000) - Date.now()),
          );
          let subject: string;
          try {
            subject = await Promise.race([
              oidcToken(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(new InvoiceTransferError("provider_unavailable")),
                  limit,
                );
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
          if (typeof subject !== "string" || !subject.trim())
            throw new InvoiceTransferError("provider_permission");
          const exchanged = await post(
            "https://sts.googleapis.com/v1/token",
            new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
              audience: audience!,
              scope: "https://www.googleapis.com/auth/cloud-platform",
              requested_token_type: ACCESS_TOKEN_TYPE,
              subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
              subject_token: subject,
            }),
            { "Content-Type": "application/x-www-form-urlencoded" },
            deadline,
          );
          const token = (await exchanged.json()) as {
            access_token?: string;
            token_type?: string;
            issued_token_type?: string;
            expires_in?: number;
          };
          if (
            !token.access_token ||
            token.token_type?.toLowerCase() !== "bearer" ||
            token.issued_token_type !== ACCESS_TOKEN_TYPE ||
            !Number.isFinite(token.expires_in) ||
            Number(token.expires_in) <= 0
          )
            throw new InvoiceTransferError("provider_permission");
          // The intermediate token can call IAM only under the service-account binding.
          // Only the final, drive.file-scoped token is returned to the Drive adapter.
          const generated = await post(
            `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email!)}:generateAccessToken`,
            JSON.stringify({ scope: [DRIVE_SCOPE], lifetime: "600s" }),
            {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token.access_token}`,
            },
            deadline,
          );
          const value = (await generated.json()) as {
            accessToken?: string;
            expireTime?: string;
          };
          const until = Date.parse(value.expireTime ?? "");
          if (
            typeof value.accessToken !== "string" ||
            !value.accessToken ||
            !Number.isFinite(until) ||
            until <= Date.now() + 30_000
          )
            throw new InvoiceTransferError("provider_permission");
          cached = {
            token: value.accessToken,
            until: Math.min(until, Date.now() + 600_000),
          };
        } else {
          const key = await importPKCS8(credential.private_key!, "RS256");
          const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
            .setProtectedHeader({
              alg: "RS256",
              ...(credential.private_key_id
                ? { kid: credential.private_key_id }
                : {}),
            })
            .setIssuer(credential.client_email!)
            .setAudience(TOKEN)
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(key);
          const response = await post(
            TOKEN,
            new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion,
            }),
            { "Content-Type": "application/x-www-form-urlencoded" },
            deadline,
          );
          const value = (await response.json()) as {
            access_token?: string;
            expires_in?: number;
            scope?: string;
            token_type?: string;
          };
          if (
            !value.access_token ||
            (value.scope && value.scope !== DRIVE_SCOPE) ||
            (value.token_type && value.token_type.toLowerCase() !== "bearer")
          )
            throw new InvoiceTransferError("provider_permission");
          cached = {
            token: value.access_token,
            until:
              Date.now() +
              Math.min(Number(value.expires_in) || 300, 3600) * 1000,
          };
        }
        return cached.token;
      } catch (e) {
        if (e instanceof InvoiceTransferError) throw e;
        throw new InvoiceTransferError("provider_unavailable");
      }
    },
  };
}
