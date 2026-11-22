import { afterEach, describe, expect, it, vi } from "vitest";
import { createFinanceGoogleAuth } from "../../../api/_lib/finance-google-auth.js";
import { createFinanceDrive } from "../../../api/_lib/finance-drive.js";
vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(async () => "runtime-identity"),
}));
const audience =
  "//iam.googleapis.com/projects/1024286200685/locations/global/workloadIdentityPools/helix-finance-invoices/providers/vercel-production";
const email = "helix-finance-invoices@helix-nmbu.iam.gserviceaccount.com";
const env = {
  VERCEL_ENV: "production",
  FINANCE_GOOGLE_WIF_AUDIENCE: audience,
  FINANCE_GOOGLE_SERVICE_ACCOUNT_EMAIL: email,
};
const accessType = "urn:ietf:params:oauth:token-type:access_token";
const driveScope = "https://www.googleapis.com/auth/drive.file";
const metadataScope = "https://www.googleapis.com/auth/drive.metadata.readonly";
function fixture(
  overrides: { sts?: unknown; iam?: unknown; status?: number } = {},
) {
  const oidc = vi.fn(async () => "vercel-production-identity");
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = vi.fn(
    async (input: URL | RequestInfo, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith("https://sts.googleapis.com/"))
        return Response.json(
          overrides.sts ?? {
            access_token: "intermediate",
            token_type: "Bearer",
            issued_token_type: accessType,
            expires_in: 300,
          },
          { status: overrides.status ?? 200 },
        );
      if (url.startsWith("https://iamcredentials.googleapis.com/"))
        return Response.json(
          overrides.iam ?? {
            accessToken: "drive-only",
            expireTime: new Date(Date.now() + 600_000).toISOString(),
          },
        );
      return Response.json({ ids: ["generatedId"] });
    },
  );
  return {
    auth: createFinanceGoogleAuth(env, fetcher as typeof fetch, oidc)!,
    fetcher,
    oidc,
    calls,
  };
}
afterEach(() => vi.useRealTimers());
describe("production invoice workload identity", () => {
  it("bounds a stalled runtime identity supplier", async () => {
    vi.useFakeTimers();
    const { auth, oidc, calls } = fixture();
    oidc.mockImplementationOnce(() => new Promise<string>(() => {}));
    const result = expect(
      auth.accessToken(Date.now() + 1200),
    ).rejects.toMatchObject({ safeError: "provider_unavailable" });
    await vi.advanceTimersByTimeAsync(1200);
    await result;
    expect(calls).toHaveLength(0);
  });
  it("passes only final credentials to Drive and starts its request timeout after authentication", async () => {
    vi.useFakeTimers();
    const { fetcher, calls } = fixture();
    const { getVercelOidcToken } = await import("@vercel/oidc");
    vi.mocked(getVercelOidcToken).mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 4000);
      return "runtime-identity";
    });
    const drive = createFinanceDrive(
      {
        ...env,
        FINANCE_INVOICE_SHARED_DRIVE_ID: "sharedDrive",
        FINANCE_INVOICE_FOLDER_ID: "invoiceFolder",
      },
      fetcher as typeof fetch,
    )!;
    expect(await drive.generateId(Date.now() + 15000)).toBe("generatedId");
    expect(calls).toHaveLength(3);
    expect(calls[2].url).toContain(
      "https://www.googleapis.com/drive/v3/files/generateIds",
    );
    expect(calls[2].init.headers).toMatchObject({
      Authorization: "Bearer drive-only",
    });
    expect(calls[2].init.signal?.aborted).toBe(false);
  });
  it("exchanges runtime identity and impersonates only the configured account with per-file writes and read-only metadata", async () => {
    const { auth, oidc, calls } = fixture();
    expect(oidc).not.toHaveBeenCalled();
    expect(await auth.accessToken()).toBe("drive-only");
    expect(oidc).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://sts.googleapis.com/v1/token");
    expect(calls[0].init.headers).not.toHaveProperty("Authorization");
    expect(
      Object.fromEntries(new URLSearchParams(String(calls[0].init.body))),
    ).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: accessType,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: "vercel-production-identity",
    });
    expect(calls[1].url).toBe(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:generateAccessToken`,
    );
    expect(calls[1].init.headers).toMatchObject({
      Authorization: "Bearer intermediate",
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      scope: [driveScope, metadataScope],
      lifetime: "600s",
    });
    expect(
      calls.every((c) => c.init.redirect === "error" && c.init.signal),
    ).toBe(true);
    await auth.accessToken();
    expect(calls).toHaveLength(2);
  });
  it("refreshes the runtime identity after final-token expiration", async () => {
    vi.useFakeTimers();
    const { auth, oidc, calls } = fixture();
    await auth.accessToken();
    vi.setSystemTime(Date.now() + 580_000);
    await auth.accessToken();
    expect(oidc).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(4);
  });
  it.each([
    { FINANCE_GOOGLE_WIF_AUDIENCE: undefined },
    { FINANCE_GOOGLE_SERVICE_ACCOUNT_EMAIL: undefined },
    { FINANCE_GOOGLE_WIF_AUDIENCE: "" },
    { FINANCE_GOOGLE_WIF_AUDIENCE: "https://attacker.invalid/provider" },
    { FINANCE_GOOGLE_SERVICE_ACCOUNT_EMAIL: "x@example.com/path" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "development" },
    { VERCEL_ENV: undefined },
  ])(
    "fails closed on partial or nonproduction configuration %j",
    (override) => {
      const config = {
        ...env,
        ...override,
        FINANCE_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          type: "service_account",
          client_email: "valid@test.gserviceaccount.com",
          private_key: "unused",
        }),
      };
      expect(createFinanceGoogleAuth(config)).toBeNull();
      expect(
        createFinanceDrive({
          ...config,
          FINANCE_INVOICE_SHARED_DRIVE_ID: "sharedDrive",
          FINANCE_INVOICE_FOLDER_ID: "invoiceFolder",
        }),
      ).toBeNull();
    },
  );
  it.each([
    {},
    {
      access_token: "x",
      token_type: "Basic",
      issued_token_type: accessType,
      expires_in: 300,
    },
    {
      access_token: "x",
      token_type: "Bearer",
      issued_token_type: "wrong",
      expires_in: 300,
    },
    {
      access_token: "x",
      token_type: "Bearer",
      issued_token_type: accessType,
      expires_in: 0,
    },
  ])(
    "rejects malformed intermediate tokens without reaching IAM %j",
    async (sts) => {
      const { auth, calls } = fixture({ sts });
      await expect(auth.accessToken()).rejects.toMatchObject({
        safeError: "provider_permission",
      });
      expect(calls).toHaveLength(1);
    },
  );
  it.each([
    {},
    { accessToken: "x", expireTime: "invalid" },
    { accessToken: "x", expireTime: "2000-01-01T00:00:00Z" },
  ])("rejects missing or expired final tokens %j", async (iam) => {
    const { auth } = fixture({ iam });
    await expect(auth.accessToken()).rejects.toMatchObject({
      safeError: "provider_permission",
    });
  });
  it("does not continue when identity or provider authorization fails", async () => {
    const { auth, oidc, calls } = fixture();
    oidc.mockRejectedValueOnce(new Error("secret details"));
    await expect(auth.accessToken()).rejects.toMatchObject({
      safeError: "provider_unavailable",
      message: "provider_unavailable",
    });
    expect(calls).toHaveLength(0);
    const denied = fixture({ status: 403 });
    await expect(denied.auth.accessToken()).rejects.toMatchObject({
      safeError: "provider_permission",
    });
    expect(denied.calls).toHaveLength(1);
  });
  it("checks the absolute deadline before identity and each network request", async () => {
    vi.useFakeTimers();
    const { auth, oidc, calls } = fixture();
    await expect(auth.accessToken(Date.now() - 1)).rejects.toMatchObject({
      safeError: "provider_unavailable",
    });
    expect(oidc).not.toHaveBeenCalled();
    oidc.mockImplementationOnce(async () => {
      vi.setSystemTime(Date.now() + 2000);
      return "expired-context";
    });
    await expect(auth.accessToken(Date.now() + 1000)).rejects.toMatchObject({
      safeError: "provider_unavailable",
    });
    expect(calls).toHaveLength(0);
  });
});
