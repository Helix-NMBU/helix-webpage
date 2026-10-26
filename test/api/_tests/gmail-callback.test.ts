import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createGmailCallbackHandler } from "../../../api/_lib/gmail-callback-handler.js";
import { stateCookie } from "../../../api/_lib/gmail-connect-handler.js";
import type { GmailConnectionStore } from "../../../api/_lib/gmail-connection.js";

function response() {
  let status = 200;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
    status: vi.fn((code: number) => { status = code; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
    redirect: vi.fn((_code: number, location: string) => { headers.Location = location; return res; }),
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) };
}

const env = {
  GMAIL_GOOGLE_CLIENT_ID: "gmail-client.apps.googleusercontent.com",
  GMAIL_GOOGLE_CLIENT_SECRET: "gmail-secret",
  GMAIL_OAUTH_REDIRECT_URI: "http://localhost:5190/api/gmail-callback",
  GMAIL_OAUTH_STATE_SECRET: "a-state-secret-that-is-long-enough-for-tests",
};

function store(): GmailConnectionStore {
  return {
    memberEmail: vi.fn(async () => "member@helixnmbu.no"),
    save: vi.fn(async () => undefined),
    read: vi.fn(async () => null),
    readCredentials: vi.fn(async () => null),
    disconnect: vi.fn(async () => null),
  };
}

describe("GET /api/gmail-callback", () => {
  it("exchanges the code, verifies the mailbox identity, and saves the connection", async () => {
    const saved = store();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "refresh", scope: "gmail.modify" }))
      .mockResolvedValueOnce(Response.json({ emailAddress: "member@helixnmbu.no" }));
    const handler = createGmailCallbackHandler(env, fetchImpl, () => saved, () => 1_700_000_000_000);
    const cookie = stateCookie("member-1", "state-1", env.GMAIL_OAUTH_STATE_SECRET, 1_700_000_000_000);
    const { res, result } = response();

    await handler({ method: "GET", query: { code: "auth-code", state: "state-1" }, headers: { cookie } } as unknown as VercelRequest, res);

    expect(result().headers.Location).toBe("/mail?gmail=connected");
    expect(saved.save).toHaveBeenCalledWith("member-1", "member@helixnmbu.no", "refresh", "gmail.modify");
  });

  it("rejects a callback with a missing or invalid state", async () => {
    const { res, result } = response();
    const handler = createGmailCallbackHandler(env, vi.fn(), () => store());

    await handler({ method: "GET", query: { code: "auth-code", state: "wrong" }, headers: {} } as unknown as VercelRequest, res);

    expect(result()).toMatchObject({ status: 400, body: { error: "The Gmail connection request expired. Start again." } });
  });

  it("rejects connecting a different Gmail account", async () => {
    const saved = store();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "refresh" }))
      .mockResolvedValueOnce(Response.json({ emailAddress: "different@helixnmbu.no" }));
    const handler = createGmailCallbackHandler(env, fetchImpl, () => saved, () => 1_700_000_000_000);
    const cookie = stateCookie("member-1", "state-1", env.GMAIL_OAUTH_STATE_SECRET, 1_700_000_000_000);
    const { res, result } = response();

    await handler({ method: "GET", query: { code: "auth-code", state: "state-1" }, headers: { cookie } } as unknown as VercelRequest, res);

    expect(result()).toMatchObject({ status: 403, body: { error: "Connect the Gmail account belonging to your Helix member account." } });
    expect(saved.save).not.toHaveBeenCalled();
  });
});
