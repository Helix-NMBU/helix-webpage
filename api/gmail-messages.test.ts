import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createGmailMessageHandler, createGmailMessagesHandler } from "./_lib/gmail-messages-handler.js";
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

function connectionStore(): GmailConnectionStore {
  return {
    memberEmail: vi.fn(async () => "member@helixnmbu.no"),
    save: vi.fn(async () => undefined),
    read: vi.fn(async () => ({ email: "member@helixnmbu.no", connectedAt: "2026-10-25T19:00:00.000Z" })),
    readCredentials: vi.fn(async () => ({ email: "member@helixnmbu.no", refreshToken: "stored-refresh-token", scope: "gmail.modify" })),
    disconnect: vi.fn(async () => null),
  };
}

const authenticate = async () => ({ userId: "member-1", googleSub: "google-1", email: "member@helixnmbu.no", name: "Member" });
const env = { GMAIL_GOOGLE_CLIENT_ID: "client-id", GMAIL_GOOGLE_CLIENT_SECRET: "client-secret" } as NodeJS.ProcessEnv;

function gmailFetch() {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
    if (url.includes("/messages?")) return Response.json({ messages: [{ id: "message-1", threadId: "thread-1" }], nextPageToken: "next" });
    if (url.endsWith("/messages/message-1?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date")) {
      return Response.json({
        id: "message-1",
        threadId: "thread-1",
        snippet: "A message preview",
        labelIds: ["SENT", "UNREAD"],
        payload: { headers: [
          { name: "From", value: "Sender <sender@example.com>" },
          { name: "Subject", value: "Hello from Gmail" },
          { name: "Date", value: "Sun, 25 Oct 2026 19:00:00 +0000" },
        ] },
      });
    }
    if (url.endsWith("/messages/message-1?format=full")) {
      return Response.json({
        id: "message-1",
        threadId: "thread-1",
        snippet: "A message preview",
        labelIds: ["SENT", "UNREAD"],
        payload: {
          headers: [
            { name: "From", value: "Sender <sender@example.com>" },
            { name: "Subject", value: "Hello from Gmail" },
            { name: "Date", value: "Sun, 25 Oct 2026 19:00:00 +0000" },
          ],
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: Buffer.from("The email body").toString("base64url") } }],
        },
      });
    }
    return Response.json({ error: "Unexpected URL" }, { status: 404 });
  };
  return { fetchImpl, calls };
}

describe("Gmail message endpoints", () => {
  it("refreshes the saved token and lists folder messages with Gmail search", async () => {
    const { res, result } = response();
    const { fetchImpl, calls } = gmailFetch();
    const handler = createGmailMessagesHandler(() => connectionStore(), authenticate, env, fetchImpl);

    await handler({
      method: "GET",
      headers: { authorization: "Bearer member-token" },
      query: { folder: "sent", q: "from:sender@example.com" },
    } as unknown as VercelRequest, res);

    expect(result()).toMatchObject({
      status: 200,
      body: {
        messages: [{ id: "message-1", subject: "Hello from Gmail", unread: true, starred: false }],
        nextPageToken: "next",
      },
    });
    const listUrl = new URL(calls.find((url) => url.includes("/messages?"))!);
    expect(listUrl.searchParams.get("labelIds")).toBe("SENT");
    expect(listUrl.searchParams.get("q")).toBe("from:sender@example.com");
  });

  it("returns the selected message body as text", async () => {
    const { res, result } = response();
    const { fetchImpl } = gmailFetch();
    const handler = createGmailMessageHandler(() => connectionStore(), authenticate, env, fetchImpl);

    await handler({
      method: "GET",
      headers: { authorization: "Bearer member-token" },
      query: { id: "message-1" },
    } as unknown as VercelRequest, res);

    expect(result()).toMatchObject({ status: 200, body: { id: "message-1", body: "The email body" } });
  });
});
