import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createGmailStatusHandler } from "./gmail-status.js";
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

function store(connection: Awaited<ReturnType<GmailConnectionStore["read"]>>): GmailConnectionStore {
  return {
    memberEmail: vi.fn(async () => "member@helixnmbu.no"),
    save: vi.fn(async () => undefined),
    read: vi.fn(async () => connection),
  };
}

describe("GET /api/gmail-status", () => {
  it("returns the connected Gmail account for the authenticated member", async () => {
    const { res, result } = response();
    const handler = createGmailStatusHandler(
      () => store({ email: "member@helixnmbu.no", connectedAt: "2026-10-25T19:00:00.000Z" }),
      async () => ({ userId: "member-1", googleSub: "google-1", email: "member@helixnmbu.no", name: "Member" }),
    );

    await handler({ method: "GET", headers: { authorization: "Bearer member-token" } } as VercelRequest, res);

    expect(result()).toEqual({
      status: 200,
      body: { connected: true, email: "member@helixnmbu.no", connectedAt: "2026-10-25T19:00:00.000Z" },
    });
  });

  it("returns a safe disconnected result when no connection exists", async () => {
    const { res, result } = response();
    const handler = createGmailStatusHandler(
      () => store(null),
      async () => ({ userId: "member-1", googleSub: "google-1", email: "member@helixnmbu.no", name: "Member" }),
    );

    await handler({ method: "GET", headers: { authorization: "Bearer member-token" } } as VercelRequest, res);

    expect(result()).toEqual({ status: 200, body: { connected: false } });
  });
});
