import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "../../libs/components/ui/badge";
import { Button } from "../../libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../libs/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../libs/components/ui/dialog";
import { Input } from "../../libs/components/ui/input";
import { Label } from "../../libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../libs/components/ui/select";
import { Textarea } from "../../libs/components/ui/textarea";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { RequestAdmin, RequestDetail, RequestHistory, RequestList, RequestSummary } from "./request-types";
import type { SponsorContext } from "./types";
import {
  REQUEST_BODY_LIMIT, REQUEST_TITLE_LIMIT, REQUEST_TYPES, REQUEST_TYPE_LABELS, REQUEST_STATUSES, REQUEST_STATUS_LABELS,
  assertRequestTransition, isTerminalRequest, validateRequestDraft, validateRequestReply, type RequestStatus, type RequestType,
} from "./requests";

type Transport = <T>(action: string, options?: RequestInit & { query?: Record<string, string> }) => Promise<T>;
export type RequestsPanelProps = { context: SponsorContext; request: Transport; heading?: string };
function message(error: unknown) { return error instanceof Error ? error.message : "Could not load requests. Try again."; }
function date(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
function historyText(event: RequestHistory): string {
  if (event.kind === "created") return "Submitted the request";
  if (event.kind === "assigned") return `Assigned to ${event.assignedAdminEmail}`;
  if (event.kind === "reply") return event.fromStatus !== event.toStatus ? "Replied and returned the request to review" : "Added a reply";
  return `Changed status to ${event.toStatus ? REQUEST_STATUS_LABELS[event.toStatus] : "Unknown"}`;
}
function allowedStatuses(current: RequestStatus): RequestStatus[] {
  return REQUEST_STATUSES.filter(status => { try { assertRequestTransition(current, status, "admin"); return true; } catch { return false; } });
}

export default function RequestsPanel({ context, request, heading = "Collaboration requests" }: RequestsPanelProps) {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [administrators, setAdministrators] = useState<RequestAdmin[]>([]);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();
  const [newOpen, setNewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [type, setType] = useState<RequestType>("general_collaboration");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const sequence = useRef(0);
  const admin = context.role === "admin";
  const currentAdmin = administrators.find(item => item.email === context.email);
  const ownsRequest = admin && Boolean(currentAdmin && detail?.assignedAdminId === currentAdmin.id);
  const closed = detail ? isTerminalRequest(detail.status) : true;

  useEffect(() => {
    let current = true;
    sequence.current += 1;
    setDetail(null); setRequests([]); setAdministrators([]); setReply("");
    setNewOpen(false); setCancelOpen(false); setTitle(""); setBody(""); setLoading(true); setBusy(false); setOpening(false);
    void request<RequestList>("requests").then(result => {
      if (current) { setRequests(result.requests); setAdministrators(result.administrators); }
    }).catch(cause => { if (current) notify("Could not load requests", message(cause), { variant: "error", href: null, action: { label: "Try again", onClick: () => { void refresh(); } } }); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; sequence.current += 1; };
  }, [context.authUserId, context.organizationId, context.role, context.contactId, context.portal, request, notify]);

  async function refresh(version = sequence.current) {
    const result = await request<RequestList>("requests");
    if (sequence.current === version) { setRequests(result.requests); setAdministrators(result.administrators); }
  }
  async function refreshAfterMutation(version: number) {
    try { await refresh(version); }
    catch (cause) {
      if (sequence.current === version) notify("Request saved, but the list could not refresh", message(cause), {
        variant: "warning", href: null,
        action: { label: "Refresh requests", onClick: () => { void refresh().catch(error => notify("Could not refresh requests", message(error), { variant: "error", href: null })); } },
      });
    }
  }
  async function open(id: string) {
    const version = ++sequence.current;
    setOpening(true); if (detail?.id !== id) setReply("");
    try {
      const result = await request<{ request: RequestDetail }>("request", { query: { id } });
      if (sequence.current === version) setDetail(result.request);
    } catch (cause) { if (sequence.current === version) notify("Could not open request", message(cause), { variant: "error", href: null, action: { label: "Try again", onClick: () => { void open(id); } } }); }
    finally { if (sequence.current === version) setOpening(false); }
  }
  async function create(event: FormEvent) {
    const version = sequence.current;
    event.preventDefault(); setBusy(true);
    let committed = false;
    try {
      const draft = validateRequestDraft({ type, title, body });
      const result = await request<{ request: RequestDetail }>("requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (sequence.current !== version) return;
      setDetail(result.request); setNewOpen(false); setCancelOpen(false); setTitle(""); setBody(""); setReply(""); setFilter("all");
      notify("Request submitted", "Helix will follow up in this shared conversation.", { variant: "success", href: null });
      committed = true;
    } catch (cause) { if (sequence.current === version) notify("Could not submit request", message(cause), { variant: "error", href: null }); } finally { if (sequence.current === version) setBusy(false); }
    if (committed) await refreshAfterMutation(version);
  }
  async function mutate(operation: "reply" | "status" | "assign", extra: Record<string, unknown>) {
    if (!detail) return;
    const version = sequence.current;
    setBusy(true);
    let committed = false;
    try {
      if (operation === "reply") extra = { body: validateRequestReply(extra.body) };
      const result = await request<{ request: RequestDetail }>("request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detail.id, expectedRevision: detail.revision, operation, ...extra }),
      });
      if (sequence.current !== version) return;
      setDetail(result.request); if (operation === "reply") setReply("");
      setCancelOpen(false);
      notify(operation === "reply" ? "Reply added" : "Request updated", "The shared request history has been updated.", { variant: "success", href: null });
      committed = true;
    } catch (cause) { if (sequence.current === version) notify("Could not update request", message(cause), { variant: "error", href: null, action: { label: "Reload request", onClick: () => { void open(detail.id); } } }); } finally { if (sequence.current === version) setBusy(false); }
    if (committed) await refreshAfterMutation(version);
  }
  const visible = requests.filter(item => filter === "all" || item.status === filter);

  return <section className="space-y-6" aria-labelledby="requests-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="requests-heading" className="text-xl font-semibold">{heading}</h2><p className="text-sm text-muted-foreground">{admin ? "Manage sponsor enquiries and shared conversations." : "Send an enquiry to Helix and follow its progress."}</p></div>
      {!admin && context.portal && <Button onClick={() => { setNewOpen(true); }} disabled={busy}>New request</Button>}
    </div>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
      <Card className="min-w-0"><CardHeader><CardTitle>Requests</CardTitle><Label htmlFor="request-status-filter">Status</Label>
        <Select value={filter} onValueChange={setFilter}><SelectTrigger id="request-status-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{REQUEST_STATUSES.map(status => <SelectItem key={status} value={status}>{REQUEST_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select>
      </CardHeader><CardContent>
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading requests...</p> : visible.length ? <ul className="space-y-2">{visible.map(item => <li key={item.id}>
          <Button variant={detail?.id === item.id ? "secondary" : "ghost"} className="h-auto w-full items-start justify-start whitespace-normal px-3 py-3 text-left" disabled={busy || opening} onClick={() => { void open(item.id); }}>
            <span className="min-w-0 space-y-2"><span className="block break-words font-medium">{item.title}</span>{admin && <span className="block text-xs text-muted-foreground">{item.organizationName}</span>}<Badge variant="outline">{REQUEST_STATUS_LABELS[item.status]}</Badge><span className="block text-xs text-muted-foreground">{date(item.updatedAt)}</span></span>
          </Button>
        </li>)}</ul> : <p className="text-sm text-muted-foreground">{requests.length ? "No requests match this status." : admin ? "No sponsor requests yet." : "You have no requests yet. Create one to start a conversation with Helix."}</p>}
      </CardContent></Card>
      <Card className="min-w-0">{opening ? <CardContent><p role="status">Loading conversation...</p></CardContent> : detail ? <>
        <CardHeader><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{REQUEST_STATUS_LABELS[detail.status]}</Badge><span className="text-xs text-muted-foreground">{REQUEST_TYPE_LABELS[detail.type]}</span></div><CardTitle className="break-words text-xl">{detail.title}</CardTitle><CardDescription>{detail.organizationName} · Submitted {date(detail.createdAt)}</CardDescription></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1"><p className="text-sm font-medium">{detail.authorEmail}</p><p className="whitespace-pre-wrap break-words text-sm">{detail.body}</p></div>
          <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-medium">Follow-up</h3><p className="break-words text-sm text-muted-foreground">{detail.assignedAdminName ? `Assigned to ${detail.assignedAdminName}` : "Waiting for a Helix administrator to take ownership."}</p>
            {admin && !closed && <div className="space-y-2"><Label htmlFor="request-assignee">Assign administrator</Label><Select value={detail.assignedAdminId ?? ""} onValueChange={id => { void mutate("assign", { assigneeId: id }); }} disabled={busy}><SelectTrigger id="request-assignee"><SelectValue placeholder="Choose an administrator" /></SelectTrigger><SelectContent>{administrators.map(item => <SelectItem key={item.id} value={item.id}>{item.email}</SelectItem>)}</SelectContent></Select>
              {!ownsRequest && currentAdmin && <Button variant="outline" disabled={busy} onClick={() => { void mutate("assign", { assigneeId: currentAdmin.id }); }}>Assign to me</Button>}
              {ownsRequest && <><Label htmlFor="request-next-status">Change status</Label><Select value="" onValueChange={status => { void mutate("status", { status }); }} disabled={busy}><SelectTrigger id="request-next-status"><SelectValue placeholder="Choose the next status" /></SelectTrigger><SelectContent>{allowedStatuses(detail.status).map(status => <SelectItem key={status} value={status}>{REQUEST_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></>}
            </div>}
          </div>
          <div className="space-y-4 border-t pt-4"><h3 className="text-sm font-medium">Conversation</h3>{detail.replies.length ? detail.replies.map(item => <article key={item.id} className="space-y-1 rounded-lg border p-3"><p className="break-words text-sm font-medium">{item.authorEmail} {item.actor === "admin" && <Badge variant="secondary">Helix</Badge>}</p><p className="text-xs text-muted-foreground">{date(item.createdAt)}</p><p className="whitespace-pre-wrap break-words text-sm">{item.body}</p></article>) : <p className="text-sm text-muted-foreground">No replies yet.</p>}
            {closed ? <p className="text-sm text-muted-foreground">This request is closed. Submit a new request to continue.</p> : admin && !ownsRequest ? <p className="text-sm text-muted-foreground">Assign this request to yourself before replying or changing status.</p> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate("reply", { body: reply }); }}><Label htmlFor="request-reply">Shared reply</Label><Textarea id="request-reply" value={reply} onChange={event => setReply(event.target.value)} required maxLength={REQUEST_BODY_LIMIT} rows={4} disabled={busy} /><p className="text-xs text-muted-foreground">Everyone with access to this request can read your reply.</p><Button type="submit" disabled={busy || !reply.trim()}>{busy ? "Saving..." : "Send reply"}</Button></form>}
            {!admin && !closed && <Button variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel request</Button>}
          </div>
          <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-medium">History</h3><ol className="space-y-3">{detail.history.map(event => <li key={event.id} className="text-sm"><p className="break-words">{historyText(event)}</p><p className="break-words text-xs text-muted-foreground">{event.actorEmail} · {date(event.createdAt)}</p></li>)}</ol></div>
        </CardContent>
      </> : <CardContent><p className="text-sm text-muted-foreground">Select a request to view its conversation and progress.</p></CardContent>}</Card>
    </div>
    <Dialog open={newOpen} onOpenChange={value => { if (!busy) setNewOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>New collaboration request</DialogTitle><DialogDescription>Tell Helix what you would like to discuss.</DialogDescription></DialogHeader><form onSubmit={event => { void create(event); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="new-request-type">Request type</Label><Select value={type} onValueChange={value => setType(value as RequestType)} disabled={busy}><SelectTrigger id="new-request-type"><SelectValue /></SelectTrigger><SelectContent>{REQUEST_TYPES.map(value => <SelectItem key={value} value={value}>{REQUEST_TYPE_LABELS[value]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="new-request-title">Title</Label><Input id="new-request-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={REQUEST_TITLE_LIMIT} disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="new-request-message">Message</Label><Textarea id="new-request-message" value={body} onChange={event => setBody(event.target.value)} required maxLength={REQUEST_BODY_LIMIT} rows={6} disabled={busy} /></div>
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setNewOpen(false)}>Close</Button><Button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit request"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={cancelOpen} onOpenChange={value => { if (!busy) setCancelOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Cancel this request?</DialogTitle><DialogDescription>The conversation will become read-only. You can submit a new request later.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCancelOpen(false)}>Keep request</Button><Button disabled={busy} onClick={() => { void mutate("status", { status: "cancelled" }); }}>{busy ? "Cancelling..." : "Cancel request"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
