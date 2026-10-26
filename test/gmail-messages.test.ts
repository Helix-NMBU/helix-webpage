import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it, vi } from "vitest";
import { createGmailMessageActionHandler, createGmailMessageHandler, createGmailMessagesHandler } from "../api/_lib/gmail-messages-handler.js";
import type { GmailConnectionStore } from "../api/_lib/gmail-connection.js";
import type { EmailSignatureServices } from "../api/_lib/email-signature-service.js";
import { defaultSignatureSettings, renderSignature } from "../src/features/MemberPlatform/email-signature.js";

function signatures(): EmailSignatureServices {
  const settings = { ...defaultSignatureSettings, enabled: true, logoUrl: "https://example.test/logo.png" };
  return {
    read: vi.fn(), save: vi.fn(),
    forMember: vi.fn(async (member) => ({ settings, revision: 1, member: { ...member, role: "Mechanical lead", phone: "+47 12345678" }, signature: renderSignature(settings, { ...member, role: "Mechanical lead", phone: "+47 12345678" }) })),
  };
}

function mimeParts(raw: string): { mime: string; text: string; html: string } {
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  const parts = [...mime.matchAll(/Content-Type: text\/(plain|html); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]*?)(?=\r\n--helix-)/g)];
  return { mime, text: Buffer.from(parts.find((part) => part[1] === "plain")?.[2] ?? "", "base64").toString("utf8"), html: Buffer.from(parts.find((part) => part[1] === "html")?.[2] ?? "", "base64").toString("utf8") };
}

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

  it("asks Gmail for unread inbox messages when the unread filter is enabled", async () => {
    const { res, result } = response();
    const { fetchImpl, calls } = gmailFetch();
    const handler = createGmailMessagesHandler(() => connectionStore(), authenticate, env, fetchImpl);

    await handler({
      method: "GET",
      headers: { authorization: "Bearer member-token" },
      query: { folder: "inbox", unreadOnly: "true" },
    } as unknown as VercelRequest, res);

    expect(result()).toMatchObject({ status: 200 });
    const listUrl = new URL(calls.find((url) => url.includes("/messages?"))!);
    expect(listUrl.searchParams.getAll("labelIds")).toEqual(["INBOX", "UNREAD"]);
    expect(listUrl.searchParams.get("q")).toBe("is:unread");
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

  it("includes Cc recipients in sent Gmail messages", async () => {
    const { res, result } = response();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "access-token" });
      if (url.endsWith("/messages/send")) return Response.json({ id: "sent-message", threadId: "sent-thread" });
      return Response.json({ error: "Unexpected URL" }, { status: 404 });
    };
    const handler = createGmailMessageActionHandler(() => connectionStore(), authenticate, env, fetchImpl, signatures);

    await handler({
      method: "POST",
      headers: { authorization: "Bearer member-token" },
      body: { action: "send", mode: "new", to: "to@example.com", cc: "copy@example.com", subject: "Hello", body: "Message body" },
    } as unknown as VercelRequest, res);

    expect(result()).toMatchObject({ status: 200, body: { id: "sent-message" } });
    const sendCall = calls.find((call) => call.url.endsWith("/messages/send"));
    const raw = JSON.parse(String(sendCall?.init?.body)).raw as string;
    const parts = mimeParts(raw);
    expect(parts.mime).toContain("Cc: copy@example.com");
    expect(parts.text.replace(/\r\n/g, "\n")).toContain("Message body\n\nMember\nHelix NMBU\nMechanical lead\nTlf: +47 12345678");
    expect(parts.html).toContain('src="https://example.test/logo.png"');
    expect(parts.html).toContain("Mechanical lead");
  });

  it.each(["markRead", "markUnread"])("writes %s through Gmail's UNREAD label", async (action) => {
    const { res, result } = response();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => String(input).includes("oauth2") ? Response.json({ access_token: "access" }) : Response.json({ id: "message-1" }));
    await createGmailMessageActionHandler(() => connectionStore(), authenticate, env, fetchImpl)({ method: "POST", headers: { authorization: "Bearer token" }, body: { action, id: "message-1" } } as VercelRequest, res);
    expect(result().status).toBe(200);
    const call = fetchImpl.mock.calls.find(([url]) => String(url).endsWith("/messages/message-1/modify"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual(action === "markRead" ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] });
  });

  it("does not mark a prefetched message as read", async () => {
    const { res } = response();
    const { fetchImpl, calls } = gmailFetch();
    await createGmailMessageHandler(() => connectionStore(), authenticate, env, fetchImpl)({ method: "GET", headers: { authorization: "Bearer token" }, query: { id: "message-1" } } as unknown as VercelRequest, res);
    expect(calls.some((url) => url.endsWith("/modify"))).toBe(false);
  });

  it.each(["reply", "forward"])("sends a %s with safe HTML, a plain-text alternative, and one resolved signature", async (mode) => {
    const { res, result } = response();
    let sent: { raw: string; threadId?: string } | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("oauth2")) return Response.json({ access_token: "access" });
      if (url.endsWith("/messages/message-1?format=full")) return Response.json({
        id: "message-1", threadId: "thread-1", payload: { mimeType: "multipart/alternative", headers: [
          { name: "Subject", value: "Original subject" }, { name: "From", value: "Jordan <jordan@example.test>" },
          { name: "Message-ID", value: "<original@example.test>" }, { name: "References", value: "<earlier@example.test>" },
        ], parts: [
          { mimeType: "text/plain", body: { data: Buffer.from("Original body").toString("base64url") } },
          { mimeType: "text/html", body: { data: Buffer.from('<table><tr><td style="color:#123456" onclick="steal()">Original <b>body</b></td></tr></table><script>steal()</script><img src="javascript:steal()"><a href="javascript:steal()">bad link</a>').toString("base64url") } },
        ] },
      });
      if (url.endsWith("/messages/send")) { sent = JSON.parse(String(init?.body)); return Response.json({ id: "sent" }); }
      return Response.json({}, { status: 404 });
    };
    await createGmailMessageActionHandler(() => connectionStore(), authenticate, env, fetchImpl, signatures)({ method: "POST", headers: { authorization: "Bearer token" }, body: { action: "send", mode, to: "to@example.test", subject: "Original subject", body: "Hello <Alex> & thanks!", replyToMessageId: "message-1", quotedMessageId: "message-1" } } as VercelRequest, res);
    expect(result().status).toBe(200);
    const parts = mimeParts(sent!.raw);
    expect(parts.text).toContain("Original body");
    expect(parts.html).toContain("Hello &lt;Alex&gt; &amp; thanks!");
    expect(parts.html).toContain("<table>");
    expect(parts.html).toContain('color:#123456');
    expect(parts.html).not.toMatch(/script|onclick|javascript:/i);
    expect(parts.html.match(/Mechanical lead/g)).toHaveLength(1);
    expect(parts.html.indexOf("Mechanical lead")).toBeLessThan(parts.html.indexOf("<blockquote"));
    if (mode === "reply") {
      expect(sent!.threadId).toBe("thread-1");
      expect(parts.mime).toContain("In-Reply-To: <original@example.test>");
      expect(parts.mime).toContain("References: <earlier@example.test> <original@example.test>");
    } else {
      expect(sent!.threadId).toBeUndefined();
      expect(parts.mime).toContain("Subject: Fwd: Original subject");
    }
  });

  it("keeps pagination when a message becomes read between listing and metadata", async () => {
    const { res, result } = response();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("oauth2")) return Response.json({ access_token: "access" });
      if (url.includes("/messages?")) return Response.json({ messages: [{ id: "read-now" }], nextPageToken: "more-unread" });
      return Response.json({ id: "read-now", labelIds: ["INBOX"], payload: {} });
    };
    await createGmailMessagesHandler(() => connectionStore(), authenticate, env, fetchImpl)({ method: "GET", headers: { authorization: "Bearer token" }, query: { folder: "inbox", unreadOnly: "true" } } as unknown as VercelRequest, res);
    expect(result()).toMatchObject({ status: 200, body: { messages: [], nextPageToken: "more-unread" } });
  });
});
