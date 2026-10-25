import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer, neonCvServices, type WorkspaceIdentity } from "./member-cv-service.js";
import { createGmailConnectionStore, type GmailConnectionStore } from "./gmail-connection.js";
import { MemberCvError } from "./member-cv-error.js";

type GmailApiMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    mimeType?: string;
    headers?: Array<{ name?: string; value?: string }>;
    body?: { data?: string };
    parts?: GmailApiMessage["payload"][];
  };
};

type GmailMessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
};

type GmailMessageAction = {
  action?: unknown;
  id?: unknown;
  mode?: unknown;
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  body?: unknown;
  replyToMessageId?: unknown;
};

type GmailEnv = NodeJS.ProcessEnv;
type Fetch = typeof fetch;

function queryString(value: string | string[] | undefined): string {
  return (typeof value === "string" ? value : "").trim();
}

function folderQuery(folder: string): { labelIds?: string[]; q?: string; includeSpamTrash?: boolean } {
  switch (folder) {
    case "inbox": return { labelIds: ["INBOX"] };
    case "sent": return { labelIds: ["SENT"] };
    case "starred": return { labelIds: ["STARRED"] };
    case "drafts": return { labelIds: ["DRAFT"] };
    case "spam": return { labelIds: ["SPAM"], includeSpamTrash: true };
    case "trash": return { labelIds: ["TRASH"], includeSpamTrash: true };
    case "archive": return { q: "-in:inbox -in:sent -in:trash -in:drafts -in:spam" };
    default: throw new MemberCvError(400, "Choose a valid Gmail folder.");
  }
}

async function accessToken(refreshToken: string, env: GmailEnv, fetchImpl: Fetch): Promise<string> {
  const clientId = env.GMAIL_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new MemberCvError(503, "Gmail connection is not configured yet.");
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const body = await response.json().catch(() => null) as { access_token?: unknown; error?: unknown } | null;
  if (response.status === 400 && body?.error === "invalid_grant") {
    throw new MemberCvError(401, "Your Gmail access has expired. Reconnect Gmail in Settings.");
  }
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new MemberCvError(502, "Google could not authorize access to your Gmail messages.");
  }
  return body.access_token;
}

async function gmailRequest<T>(path: string, token: string, fetchImpl: Fetch, init: RequestInit = {}): Promise<T> {
  const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
  });
  const body = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (response.status === 401 || response.status === 403) {
    throw new MemberCvError(401, "Google denied access to Gmail. Reconnect Gmail in Settings and approve mail access.");
  }
  if (!response.ok || !body) {
    console.error("Gmail API request failed.", { status: response.status });
    throw new MemberCvError(502, "Google could not load your Gmail messages. Try again.");
  }
  return body;
}

function header(message: GmailApiMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function summary(message: GmailApiMessage): GmailMessageSummary {
  if (!message.id) throw new MemberCvError(502, "Google returned a message without an ID.");
  return {
    id: message.id,
    threadId: message.threadId ?? message.id,
    from: header(message, "From") || "Unknown sender",
    subject: header(message, "Subject") || "(No subject)",
    date: header(message, "Date") || message.internalDate || "",
    snippet: message.snippet ?? "",
    unread: message.labelIds?.includes("UNREAD") ?? false,
    starred: message.labelIds?.includes("STARRED") ?? false,
  };
}

function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function collectBodies(payload: GmailApiMessage["payload"], mimeType: "text/plain" | "text/html"): string[] {
  if (!payload) return [];
  const body = payload.body?.data && payload.mimeType === mimeType ? [decodeBody(payload.body.data)] : [];
  return [...body, ...(payload.parts ?? []).flatMap((part) => collectBodies(part, mimeType))];
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function messageBody(message: GmailApiMessage): string {
  const plainText = collectBodies(message.payload, "text/plain").join("\n\n").trim();
  if (plainText) return plainText.slice(0, 100_000);
  const html = collectBodies(message.payload, "text/html").join("\n\n");
  return html ? htmlToText(html).slice(0, 100_000) : message.snippet ?? "";
}

function messageHtml(message: GmailApiMessage): string {
  return collectBodies(message.payload, "text/html").join("\n").slice(0, 200_000);
}

function requestBody(value: unknown): GmailMessageAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as GmailMessageAction;
}

function validMessageId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\s/]/.test(value);
}

function recipientAddresses(value: unknown): string[] {
  if (typeof value !== "string" || value.length > 1200) throw new MemberCvError(400, "Enter a valid recipient email address.");
  const addresses = value.split(/[;,]/).map((part) => {
    const bracketed = part.match(/<([^<>]+)>/)?.[1];
    return (bracketed ?? part).trim();
  }).filter(Boolean);
  if (!addresses.length || addresses.length > 20 || addresses.some((address) => !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(address))) {
    throw new MemberCvError(400, "Enter valid recipient email addresses.");
  }
  return addresses;
}

function optionalRecipientAddresses(value: unknown): string[] {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return [];
  return recipientAddresses(value);
}

function safeReferences(value: string): string[] {
  return value.match(/<[^<>\s\r\n]+>/g) ?? [];
}

function mimeSubject(subject: string): string {
  const normalized = subject.replace(/[\r\n]+/g, " ").trim();
  if (normalized.length > 998) throw new MemberCvError(400, "Enter a subject under 999 characters.");
  return /[^\x20-\x7e]/.test(normalized)
    ? `=?UTF-8?B?${Buffer.from(normalized, "utf8").toString("base64")}?=`
    : normalized;
}

function base64Lines(value: string): string {
  return Buffer.from(value.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n")
    .trimEnd();
}

function failure(error: unknown): { status: number; message: string } {
  if (error instanceof MemberCvError) return { status: error.status, message: error.message };
  return { status: 503, message: "Could not load Gmail messages. Try again." };
}

async function withGmail<T>(
  req: VercelRequest,
  getStore: () => GmailConnectionStore,
  authenticate: (token: string) => Promise<WorkspaceIdentity>,
  env: GmailEnv,
  fetchImpl: Fetch,
  run: (token: string) => Promise<T>,
): Promise<T> {
  const identity = await authenticate(bearer(req.headers.authorization));
  const connection = await getStore().readCredentials(identity.userId);
  if (!connection) throw new MemberCvError(409, "Connect Gmail in Settings to view your messages.");
  const token = await accessToken(connection.refreshToken, env, fetchImpl);
  return run(token);
}

export function createGmailMessagesHandler(
  getStore: () => GmailConnectionStore = () => createGmailConnectionStore(),
  authenticate: (token: string) => Promise<WorkspaceIdentity> = (token) => neonCvServices().authenticate(token),
  env: GmailEnv = process.env,
  fetchImpl: Fetch = fetch,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    try {
      const folder = queryString(req.query.folder) || "inbox";
      const filter = folderQuery(folder);
      const search = queryString(req.query.q).slice(0, 500);
      const unreadOnly = folder === "inbox" && queryString(req.query.unreadOnly) === "true";
      const pageToken = queryString(req.query.pageToken);
      if (pageToken.length > 4096) throw new MemberCvError(400, "The Gmail page token is invalid.");
      const result = await withGmail(req, getStore, authenticate, env, fetchImpl, async (token) => {
        const params = new URLSearchParams({ maxResults: "25" });
        for (const id of filter.labelIds ?? []) params.append("labelIds", id);
        if (unreadOnly) params.append("labelIds", "UNREAD");
        const query = [filter.q, unreadOnly ? "is:unread" : "", search].filter(Boolean).join(" ");
        if (query) params.set("q", query);
        if (pageToken) params.set("pageToken", pageToken);
        if (filter.includeSpamTrash) params.set("includeSpamTrash", "true");
        const listing = await gmailRequest<{ messages?: Array<{ id?: string; threadId?: string }>; nextPageToken?: string }>(`messages?${params}`, token, fetchImpl);
        const ids = (listing.messages ?? []).filter((item): item is { id: string; threadId?: string } => typeof item.id === "string");
        const messages = await Promise.all(ids.map(async ({ id }) => {
          const full = await gmailRequest<GmailApiMessage>(`messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, token, fetchImpl);
          return summary(full);
        }));
        return { messages, nextPageToken: listing.nextPageToken ?? null };
      });
      return res.status(200).json(result);
    } catch (error) {
      const result = failure(error);
      return res.status(result.status).json({ error: result.message });
    }
  };
}

export function createGmailMessageHandler(
  getStore: () => GmailConnectionStore = () => createGmailConnectionStore(),
  authenticate: (token: string) => Promise<WorkspaceIdentity> = (token) => neonCvServices().authenticate(token),
  env: GmailEnv = process.env,
  fetchImpl: Fetch = fetch,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    const id = queryString(req.query.id);
    if (!id || id.length > 512 || /[\s/]/.test(id)) return res.status(400).json({ error: "A valid Gmail message ID is required." });
    try {
      const message = await withGmail(req, getStore, authenticate, env, fetchImpl, async (token) =>
        gmailRequest<GmailApiMessage>(`messages/${encodeURIComponent(id)}?format=full`, token, fetchImpl));
      const details = summary(message);
      return res.status(200).json({
        ...details,
        body: messageBody(message),
        htmlBody: messageHtml(message),
        replyTo: header(message, "Reply-To") || header(message, "From"),
        rfcMessageId: header(message, "Message-ID"),
      });
    } catch (error) {
      const result = failure(error);
      return res.status(result.status).json({ error: result.message });
    }
  };
}

export function createGmailMessageActionHandler(
  getStore: () => GmailConnectionStore = () => createGmailConnectionStore(),
  authenticate: (token: string) => Promise<WorkspaceIdentity> = (token) => neonCvServices().authenticate(token),
  env: GmailEnv = process.env,
  fetchImpl: Fetch = fetch,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const input = requestBody(req.body);
      const action = typeof input.action === "string" ? input.action : "";
      const result = await withGmail(req, getStore, authenticate, env, fetchImpl, async (token) => {
        if (action === "archive" || action === "junk") {
          if (!validMessageId(input.id)) throw new MemberCvError(400, "A valid Gmail message ID is required.");
          const labels = action === "archive"
            ? { removeLabelIds: ["INBOX"] }
            : { addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] };
          await gmailRequest(`messages/${encodeURIComponent(input.id)}/modify`, token, fetchImpl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(labels),
          });
          return { action, id: input.id };
        }
        if (action === "trash") {
          if (!validMessageId(input.id)) throw new MemberCvError(400, "A valid Gmail message ID is required.");
          await gmailRequest(`messages/${encodeURIComponent(input.id)}/trash`, token, fetchImpl, { method: "POST" });
          return { action, id: input.id };
        }
        if (action !== "send") throw new MemberCvError(400, "Choose a valid Gmail action.");
        if (input.mode !== "new" && input.mode !== "reply" && input.mode !== "forward") throw new MemberCvError(400, "Choose New message, Reply, or Forward.");
        if (typeof input.body !== "string" || input.body.length > 100_000) throw new MemberCvError(400, "The message body is too long.");
        const to = recipientAddresses(input.to);
        const cc = optionalRecipientAddresses(input.cc);
        let subject = typeof input.subject === "string" ? input.subject : "";
        if (subject.length > 998) throw new MemberCvError(400, "The subject is too long.");
        let threadId: string | undefined;
        let replyHeaders: string[] = [];
        if (input.mode === "reply") {
          if (!validMessageId(input.replyToMessageId)) throw new MemberCvError(400, "Select a message to reply to.");
          const original = await gmailRequest<GmailApiMessage>(`messages/${encodeURIComponent(input.replyToMessageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`, token, fetchImpl);
          threadId = original.threadId;
          subject = header(original, "Subject");
          const messageId = header(original, "Message-ID");
          const references = [...safeReferences(header(original, "References")), ...safeReferences(messageId)];
          if (messageId) replyHeaders.push(`In-Reply-To: ${messageId}`);
          if (references.length) replyHeaders.push(`References: ${[...new Set(references)].join(" ")}`);
          if (!threadId || !messageId) throw new MemberCvError(502, "Google could not identify the conversation to reply to.");
        } else if (input.mode === "forward" && subject && !/^fwd?:/i.test(subject)) {
          subject = `Fwd: ${subject}`;
        }
        const encodedSubject = mimeSubject(subject);
        const headers = [
          `To: ${to.join(", ")}`,
          ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
          `Subject: ${encodedSubject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          ...replyHeaders,
        ];
        const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${base64Lines(input.body)}`, "utf8").toString("base64url");
        const sent = await gmailRequest<{ id?: string; threadId?: string }>("messages/send", token, fetchImpl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
        });
        return { action, id: sent.id ?? null, threadId: sent.threadId ?? threadId ?? null };
      });
      return res.status(200).json(result);
    } catch (error) {
      const result = failure(error);
      return res.status(result.status).json({ error: result.message });
    }
  };
}
