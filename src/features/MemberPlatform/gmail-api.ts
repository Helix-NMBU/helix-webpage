import { memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberAccount, localMemberSignedIn } from "./local-mode";

const localMessages = [
  { id: "local-welcome", threadId: "local-welcome", from: "Jordan Example <jordan@example.invalid>", replyTo: "jordan@example.invalid", subject: "Team update", date: "2026-10-26T09:00:00Z", snippet: "Here is the plan for our next team meeting.", unread: true, starred: false, body: "Hi Alex,\nHere is the plan for our next team meeting.\nReview the schedule\nJordan", htmlBody: '<div style="font:15px/1.6 Arial,sans-serif;max-width:520px;margin:auto"><h2 style="color:#243f91">Team update</h2><p>Hi Alex,</p><p>Here is the plan for our next <strong>team meeting</strong>.</p><table style="width:100%;border-collapse:collapse"><tr style="background:#f1f4fa"><td style="padding:12px">Design review</td><td style="padding:12px">10:00</td></tr><tr><td style="padding:12px">Workshop planning</td><td style="padding:12px">11:00</td></tr></table><p><a href="https://helixnmbu.no">Review the schedule</a></p><p>Jordan</p></div>' },
  { id: "local-read", threadId: "local-read", from: "Taylor Example <taylor@example.invalid>", replyTo: "taylor@example.invalid", subject: "Workshop notes", date: "2026-10-25T10:00:00Z", snippet: "Notes from the workshop.", unread: false, starred: false, body: "Notes from the workshop.", htmlBody: "<p>Notes from the workshop.</p>" },
];
let localConnected = true;

export async function memberGmailRequest(path: string, owner: { current: string | null }, init: RequestInit = {}): Promise<Response> {
  if (isLocalMemberMode() && localMemberSignedIn()) {
    const url = new URL(path, window.location.origin);
    const action = url.searchParams.get("action") ?? path.split("/api/gmail-")[1];
    if (action === "status") return Response.json({ connected: localConnected, email: localMemberAccount.email });
    if (action === "disconnect") { localConnected = false; return Response.json({ disconnected: true }); }
    if (action === "messages") {
      const folder = url.searchParams.get("folder");
      const search = (url.searchParams.get("q") ?? "").toLowerCase();
      return Response.json({ messages: folder === "inbox" ? localMessages.filter((m) => (!url.searchParams.has("unreadOnly") || m.unread) && `${m.subject} ${m.from} ${m.body}`.toLowerCase().includes(search)) : [], nextPageToken: null });
    }
    if (action === "message") return Response.json(localMessages.find((m) => m.id === url.searchParams.get("id")) ?? {}, { status: localMessages.some((m) => m.id === url.searchParams.get("id")) ? 200 : 404 });
    if (action === "messageAction") {
      const body = JSON.parse(String(init.body)) as { action: string; id: string };
      const message = localMessages.find((m) => m.id === body.id);
      if (message && (body.action === "markRead" || body.action === "markUnread")) message.unread = body.action === "markUnread";
      else if (message) localMessages.splice(localMessages.indexOf(message), 1);
      return Response.json({ id: body.id, action: body.action });
    }
    return Response.json({ error: "This action is unavailable." }, { status: 400 });
  }
  const token = await memberSessionToken(owner);
  return fetch(path, { ...init, cache: "no-store", credentials: "include", headers: { ...init.headers, Authorization: `Bearer ${token}` } });
}
