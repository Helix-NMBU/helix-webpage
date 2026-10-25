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

async function gmailRequest<T>(path: string, token: string, fetchImpl: Fetch): Promise<T> {
  const response = await fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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
      const pageToken = queryString(req.query.pageToken);
      if (pageToken.length > 4096) throw new MemberCvError(400, "The Gmail page token is invalid.");
      const result = await withGmail(req, getStore, authenticate, env, fetchImpl, async (token) => {
        const params = new URLSearchParams({ maxResults: "25" });
        for (const id of filter.labelIds ?? []) params.append("labelIds", id);
        const query = [filter.q, search].filter(Boolean).join(" ");
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
      return res.status(200).json({ ...details, body: messageBody(message) });
    } catch (error) {
      const result = failure(error);
      return res.status(result.status).json({ error: result.message });
    }
  };
}
