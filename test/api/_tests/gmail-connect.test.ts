import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createGmailConnectHandler, GMAIL_MODIFY_SCOPE, GMAIL_OAUTH_STATE_COOKIE } from "../../../api/_lib/gmail-connect-handler.js";

function response() {
  let status = 200;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
    status: vi.fn((code: number) => { status = code; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) };
}

const env = {
  GMAIL_GOOGLE_CLIENT_ID: "gmail-client.apps.googleusercontent.com",
  GMAIL_OAUTH_REDIRECT_URI: "http://localhost:5190/api/gmail-callback",
  GMAIL_OAUTH_STATE_SECRET: "a-state-secret-that-is-long-enough-for-tests",
};

describe("POST /api/gmail-connect", () => {
  it("creates a signed OAuth handoff for the verified member", async () => {
    const { res, result } = response();
    const handler = createGmailConnectHandler(
      async (token) => {
        expect(token).toBe("member-token");
        return { userId: "member-1", googleSub: "google-1", email: "member@helixnmbu.no", name: "Member" };
      },
      env,
      () => 1_700_000_000_000,
      () => "fixed-state",
    );

    await handler({ method: "POST", headers: { authorization: "Bearer member-token" } } as VercelRequest, res);

    const outcome = result();
    expect(outcome.status).toBe(200);
    expect(outcome.headers["Set-Cookie"]).toContain(`${GMAIL_OAUTH_STATE_COOKIE}=`);
    const url = new URL((outcome.body as { url: string }).url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe(env.GMAIL_GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(env.GMAIL_OAUTH_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe(GMAIL_MODIFY_SCOPE);
    expect(url.searchParams.get("state")).toBe("fixed-state");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("fails closed when the server-side Gmail configuration is incomplete", async () => {
    const { res, result } = response();
    const authenticate = vi.fn();
    const handler = createGmailConnectHandler(authenticate, { ...env, GMAIL_OAUTH_STATE_SECRET: "short" });

    await handler({ method: "POST", headers: {} } as VercelRequest, res);

    expect(result()).toMatchObject({ status: 503, body: { error: "Gmail connection is not configured yet." } });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("requires a POST", async () => {
    const { res, result } = response();
    const handler = createGmailConnectHandler(vi.fn(), env);

    await handler({ method: "GET", headers: {} } as VercelRequest, res);

    expect(result()).toMatchObject({ status: 405, body: { error: "Method not allowed." } });
  });
});
