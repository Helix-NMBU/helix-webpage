import { useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { requiresLateReason } from "./request-domain";
import type { FinanceMutation, HeadDecisionQueueItem, OwnRequestSummary, RequestDraftLine } from "./types";

function useRequestIds() {
  const pending = useRef<{ key: string; id: string } | null>(null);
  return {
    idFor(key: string) {
      if (pending.current?.key === key) return pending.current.id;
      const id = crypto.randomUUID();
      pending.current = { key, id };
      return id;
    },
    finish() { pending.current = null; },
  };
}

const emptyLine = (): RequestDraftLine => ({ budgetItemId: "", description: "", estimatedNok: "" });

export function PurchasesBoard() {
  const session = useFinanceAccess();
  const notify = useNotify();
  const purchases = session.purchases;
  const requests = useRequestIds();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{
    requestRecordId?: string;
    revision: number;
    supplierName: string;
    justification: string;
    plannedDate: string;
    lateReason: string;
    lines: RequestDraftLine[];
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [releasedNok, setReleasedNok] = useState("0.00");
  if (!purchases) return null;
  const today = session.today ?? new Date().toISOString().slice(0, 10);
  const detail = purchases.detail;
  const canDecide = Boolean(session.capabilities?.decideRequests);
  const choices = purchases.choices?.items ?? [];

  function openNew() {
    setSelectedId(null);
    setEditor({
      revision: 0,
      supplierName: "",
      justification: "",
      plannedDate: today,
      lateReason: "",
      lines: [emptyLine()],
    });
    void session.loadPage("purchases");
  }

  function openRequest(row: OwnRequestSummary) {
    setSelectedId(row.id);
    void session.loadPage("purchases", { requestRecordId: row.id }).then(() => {
      const loaded = session.purchases?.detail;
      if (!loaded) return;
      setEditor({
        requestRecordId: loaded.id,
        revision: loaded.revision,
        supplierName: loaded.supplierName ?? "",
        justification: loaded.justification ?? "",
        plannedDate: loaded.plannedDate ?? today,
        lateReason: loaded.lateReason ?? "",
        lines: loaded.draftLines.length ? loaded.draftLines : [emptyLine()],
      });
    });
  }

  async function run(key: string, action: FinanceMutation, success: string) {
    setSaving(true);
    try {
      await session.mutate({ ...action, requestId: requests.idFor(key) });
      requests.finish();
      notify("Request saved", success, { id: "request-saved", variant: "success" });
      await session.loadPage("purchases", selectedId ? { requestRecordId: selectedId } : undefined);
      return true;
    } catch (error) {
      requests.finish();
      notify("Could not save the request", error instanceof Error ? error.message : "Please try again.", { id: "request-save", variant: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const body = {
      supplierName: editor.supplierName,
      justification: editor.justification,
      plannedDate: editor.plannedDate,
      lateReason: editor.lateReason || null,
      lines: editor.lines.filter((line) => line.budgetItemId && line.estimatedNok),
    };
    await run("save", {
      action: "saveRequest",
      requestId: requests.idFor("save"),
      requestRecordId: editor.requestRecordId,
      expectedRevision: editor.requestRecordId ? editor.revision : undefined,
      request: body,
    } as FinanceMutation, "The draft was saved.");
  }

  async function submitCurrent() {
    if (!editor) return;
    const body = {
      supplierName: editor.supplierName,
      justification: editor.justification,
      plannedDate: editor.plannedDate,
      lateReason: editor.lateReason || null,
      lines: editor.lines.filter((line) => line.budgetItemId && line.estimatedNok),
    };
    if (!editor.requestRecordId) {
      const saved = await run("save", {
        action: "saveRequest",
        requestId: requests.idFor("save"),
        request: body,
      } as FinanceMutation, "The draft was saved.");
      if (!saved) return;
      await session.loadPage("purchases");
      const own = session.purchases?.ownRequests ?? [];
      const created = own.length > 0 ? own[own.length - 1] : undefined;
      if (!created) return;
      editor.requestRecordId = created.id;
      editor.revision = 0;
    }
    const action = detail?.status === "rejected" ? "reviseRequest" : "submitRequest";
    await run("submit", {
      action,
      requestId: requests.idFor("submit"),
      requestRecordId: editor.requestRecordId,
      expectedRevision: editor.revision,
      request: body,
    } as FinanceMutation, "The request was submitted.");
  }

  async function decide(item: HeadDecisionQueueItem, decision: "approved" | "rejected") {
    await run(`decide-${item.id}`, {
      action: "decideRequest",
      requestId: requests.idFor(`decide-${item.id}`),
      requestRecordId: item.id,
      revisionId: item.revisionId,
      decision,
      reason: decisionReason,
    } as FinanceMutation, "The decision was recorded.");
    setDecisionReason("");
  }

  const showEditor = editor && (!detail || ["draft", "rejected"].includes(detail.status));
  const lateRequired = editor ? requiresLateReason(editor.plannedDate, today) : false;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={openNew}>New request</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
          <CardDescription>Track drafts, submissions and approvals for this season.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Planned</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.ownRequests.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Button type="button" variant="link" className="h-auto p-0" onClick={() => openRequest(row)}>{row.publicRef}</Button>
                  </TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.plannedDate ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.remainingNok}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canDecide && (purchases.decisionQueue?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Head decision queue</CardTitle>
            <CardDescription>Approve or reject the current submitted revision.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="decision-reason">Decision reason</Label>
              <Textarea id="decision-reason" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} rows={2} />
            </div>
            {purchases.decisionQueue?.map((item) => (
              <div key={item.revisionId} className="rounded-md border p-4 space-y-2">
                <p className="font-medium">{item.publicRef} · {item.supplierName}</p>
                <p className="text-sm text-muted-foreground">{item.justification}</p>
                <p className="text-sm">Planned {item.plannedDate} · estimated {item.totalEstimatedNok}</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={saving || decisionReason.trim().length < 3} onClick={() => decide(item, "approved")}>Approve</Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving || decisionReason.trim().length < 3} onClick={() => decide(item, "rejected")}>Reject</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {detail && detail.status === "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>{detail.publicRef}</CardTitle>
            <CardDescription>Open approval · remaining {detail.remainingNok}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="close-reason">Closure reason</Label>
              <Textarea id="close-reason" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} rows={2} />
            </div>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="released-nok">Released amount (NOK)</Label>
              <Input id="released-nok" value={releasedNok} onChange={(event) => setReleasedNok(event.target.value)} />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => run("close", {
                action: "closeRequest",
                requestId: requests.idFor("close"),
                requestRecordId: detail.id,
                expectedRevision: detail.revision,
                reason: closeReason,
                releasedNok,
              } as FinanceMutation, "The approval was closed.")}
            >
              Close approval
            </Button>
          </CardContent>
        </Card>
      )}

      {showEditor && editor && (
        <Card>
          <CardHeader>
            <CardTitle>{editor.requestRecordId ? "Edit request" : "New request"}</CardTitle>
            <CardDescription>Link each line to an approved budget item. Receipts are not required before purchase.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveDraft}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input id="supplier" value={editor.supplierName} onChange={(event) => setEditor({ ...editor, supplierName: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planned">Planned purchase date</Label>
                  <Input id="planned" type="date" value={editor.plannedDate} onChange={(event) => setEditor({ ...editor, plannedDate: event.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="justification">Justification</Label>
                <Textarea id="justification" value={editor.justification} onChange={(event) => setEditor({ ...editor, justification: event.target.value })} rows={3} />
              </div>
              {lateRequired && (
                <div className="space-y-2">
                  <Label htmlFor="late-reason">Late reason</Label>
                  <Textarea id="late-reason" value={editor.lateReason} onChange={(event) => setEditor({ ...editor, lateReason: event.target.value })} rows={2} />
                </div>
              )}
              <div className="space-y-3">
                <p className="text-sm font-medium">Estimated lines</p>
                {editor.lines.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-3">
                    <Select value={line.budgetItemId} onValueChange={(value) => {
                      const lines = [...editor.lines];
                      lines[index] = { ...lines[index], budgetItemId: value };
                      setEditor({ ...editor, lines });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Budget item" /></SelectTrigger>
                      <SelectContent>
                        {choices.map((choice) => (
                          <SelectItem key={choice.id} value={choice.id}>{choice.publicRef} · {choice.description}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input placeholder="Description" value={line.description} onChange={(event) => {
                      const lines = [...editor.lines];
                      lines[index] = { ...lines[index], description: event.target.value };
                      setEditor({ ...editor, lines });
                    }} />
                    <Input placeholder="Amount NOK" value={line.estimatedNok} onChange={(event) => {
                      const lines = [...editor.lines];
                      lines[index] = { ...lines[index], estimatedNok: event.target.value };
                      setEditor({ ...editor, lines });
                    }} />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setEditor({ ...editor, lines: [...editor.lines, emptyLine()] })}>Add line</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" disabled={saving}>Save draft</Button>
                <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => submitCurrent()}>Submit</Button>
                {detail?.status === "submitted" && (
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => run("withdraw", {
                    action: "withdrawRequest",
                    requestId: requests.idFor("withdraw"),
                    requestRecordId: detail.id,
                    expectedRevision: detail.revision,
                  } as FinanceMutation, "The request was withdrawn.")}>Withdraw</Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {detail && detail.revisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revision history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.revisions.map((revision) => (
              <div key={revision.id} className="rounded-md border p-3">
                <p className="font-medium">Revision {revision.revisionNumber}</p>
                {revision.decision && <p>Decision: {revision.decision.decision} — {revision.decision.reason}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
