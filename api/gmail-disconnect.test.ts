import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createGmailDisconnectHandler } from "./_lib/gmail-disconnect-handler.js";
import type { GmailConnectionStore } from "./_lib/gmail-connection.js";

function response() {
  let status = 200;
  let body: unknown;
  const res = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => { status = code; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body }) };
}

function store(refreshToken: string | null): GmailConnectionStore {
  return {
    memberEmail: vi.fn(async () => "member@helixnmbu.no"),
    save: vi.fn(async () => undefined),
    read: vi.fn(async () => null),
    disconnect: vi.fn(async () => refreshToken),
  };
}

describe("POST /api/gmail-disconnect", () => {
  it("removes the connection and revokes the Google token", async () => {
    const { res, result } = response();
    const fetchImpl = vi.fn(async () => Response.json({}));
    const handler = createGmailDisconnectHandler(
      () => store("refresh-token"),
      async () => ({ userId: "member-1", googleSub: "google-1", email: "member@helixnmbu.no", name: "Member" }),
      fetchImpl,
    );

    await handler({ method: "POST", headers: { authorization: "Bearer member-token" } } as VercelRequest, res);

    expect(result()).toEqual({ status: 200, body: { disconnected: true } });
    expect(fetchImpl).toHaveBeenCalledWith("https://oauth2.googleapis.com/revoke", expect.objectContaining({
      method: "POST",
      body: new URLSearchParams({ token: "refresh-token" }),
    }));
  });

  it("requires a POST", async () => {
    const { res, result } = response();
    const handler = createGmailDisconnectHandler(vi.fn(), vi.fn());

    await handler({ method: "GET", headers: {} } as VercelRequest, res);

    expect(result()).toMatchObject({ status: 405, body: { error: "Method not allowed." } });
  });
});
