import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { PurchaseRegister } from "./PurchaseRegister";
import { requiresLateReason } from "./request-domain";
import type {
  BudgetChoiceItem,
  BudgetChoiceSystem,
  FinanceExportFile,
  FinanceMutation,
  HeadDecisionQueueItem,
  OwnRequestSummary,
  PurchaseInput,
  PurchaseLineInput,
  RequestDraftLine,
} from "./types";

type UploadState = { localId: string; uploadId: string; name: string; status: "uploading" | "ready" | "failed" };

function emptyPurchaseLine(): PurchaseLineInput {
  return { systemId: "", description: "", quantity: "1", amountNok: "", unbudgeted: false };
}

function emptyPurchase(today: string, buyerName: string): PurchaseInput {
  return {
    buyerName,
    supplierName: "",
    paymentMethod: "team_account",
    purchaseDate: today,
    justification: "",
    documentKind: "receipt",
    documentNumber: "",
    invoiceDueDate: "",
    refundAccount: "",
    refundPhone: "",
    lines: [emptyPurchaseLine()],
    uploadIds: [],
  };
}

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

const emptyRequestLine = (): RequestDraftLine => ({ budgetItemId: "", description: "", estimatedNok: "" });

export function PurchasesBoard() {
  const session = useFinanceAccess();
  const notify = useNotify();
  const purchases = session.purchases;
  const requests = useRequestIds();
  const purchaseRequests = useRequestIds();
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
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const unpaidOnlyRef = useRef(false);
  const buyerDefault = "Member Example";
  const [purchase, setPurchase] = useState<PurchaseInput>(() => emptyPurchase(session.today ?? "", buyerDefault));
  const budgetChoices = session.budgets?.choices ?? { systems: [], items: [] };
  const itemsBySystem = useMemo(() => {
    const map = new Map<string, BudgetChoiceItem[]>();
    for (const item of budgetChoices.items) {
      if (item.status === "cancelled") continue;
      const list = map.get(item.systemId) ?? [];
      list.push(item);
      map.set(item.systemId, list);
    }
    return map;
  }, [budgetChoices.items]);
  const detail = purchases?.detail;
  const approvedLinkLines = useMemo(() => {
    if (!detail?.approvedRevisionId) return [];
    return detail.revisions.find((revision) => revision.id === detail.approvedRevisionId)?.lines ?? [];
  }, [detail]);
  if (!purchases) return null;
  const today = session.today ?? new Date().toISOString().slice(0, 10);
  const canDecide = Boolean(session.capabilities?.decideRequests);
  const canRegister = Boolean(session.capabilities?.registerActual);
  const canExport = Boolean(session.capabilities?.purchaseRegister);
  const budgetsLoaded = session.budgets?.budgetStatus === "approved";
  const systems = budgetChoices.systems.filter((row) => row.active);
  const choices = purchases.choices?.items ?? [];
  const register = purchases.register ?? [];
  const canReview = Boolean(session.capabilities?.paymentsVoidReview);

  function purchaseLoadOptions(requestRecordId: string | null) {
    return {
      ...(requestRecordId ? { requestRecordId } : {}),
      ...(unpaidOnlyRef.current ? { unpaidOnly: true } : {}),
    };
  }

  function updatePurchaseLine(index: number, patch: Partial<PurchaseLineInput>) {
    setPurchase((current) => {
      const lines = current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line));
      const next = lines[index];
      if (patch.systemId && patch.systemId !== current.lines[index]?.systemId) {
        lines[index] = { ...next, budgetItemId: undefined, unbudgeted: false };
      }
      return { ...current, lines };
    });
  }

  async function uploadFile(file: File) {
    if (uploads.length >= 15) {
      notify("Too many files", "You can attach at most 15 files.", { id: "purchase-files", variant: "error" });
      return;
    }
    const entry: UploadState = { localId: crypto.randomUUID(), uploadId: "", name: file.name, status: "uploading" };
    setUploads((current) => [...current, entry]);
    try {
      const authorized = await session.mutate({
        action: "authorizeUpload",
        requestId: crypto.randomUUID(),
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
      });
      const uploadId = authorized.id;
      if (!authorized.uploadUrl || !uploadId) throw new Error("Upload authorization failed.");
      const response = await fetch(authorized.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!response.ok) throw new Error("Upload failed.");
      setUploads((current) => current.map((row) => row.localId === entry.localId ? { ...row, uploadId } : row));
      const finalizeRequestId = crypto.randomUUID();
      const finalize = async () => {
        setUploads((current) => current.map((row) => row.localId === entry.localId ? { ...row, status: "uploading" } : row));
        try {
          await session.mutate({ action: "finalizeUpload", requestId: finalizeRequestId, uploadId });
          setUploads((current) => current.map((row) => row.localId === entry.localId ? { ...row, status: "ready" } : row));
          notify("File uploaded", `${file.name} is ready to submit.`, { id: `purchase-upload-${entry.localId}`, variant: "success" });
        } catch (error) {
          setUploads((current) => current.map((row) => row.localId === entry.localId ? { ...row, status: "failed" } : row));
          notify("Could not finalize file", error instanceof Error ? error.message : "Try again.", {
            id: `purchase-upload-${entry.localId}`,
            variant: "error",
            action: { label: "Try again", onClick: () => { void finalize(); } },
          });
        }
      };
      await finalize();
    } catch (error) {
      setUploads((current) => current.filter((row) => row.localId !== entry.localId));
      notify("Upload failed", error instanceof Error ? error.message : "Try again.", { id: "purchase-upload", variant: "error" });
    }
  }

  function saveCsv(file: FinanceExportFile) {
    if (!file.csv) return;
    const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPrivateExport(exportId: string) {
    const saved = await session.mutate({ action: "downloadExport", requestId: crypto.randomUUID(), exportId });
    if (!saved.downloadUrl) throw new Error("The export download was not prepared.");
    const link = document.createElement("a");
    link.href = saved.downloadUrl;
    link.rel = "noopener";
    link.click();
  }

  async function exportRegister() {
    try {
      const saved = await session.mutate({ action: "exportPurchases", requestId: crypto.randomUUID() });
      const file = saved.exportFile;
      if (file?.delivery === "inline" && file.csv) {
        notify("Purchase export ready", "The export is ready to save.", {
          id: "finance-export",
          variant: "success",
          action: { label: "Save file", onClick: () => saveCsv(file) },
        });
        return;
      }
      if (file?.exportId) {
        const exportId = file.exportId;
        notify("Purchase export ready", "The export is in private storage. Download it while you are signed in.", {
          id: "finance-export",
          variant: "success",
          action: { label: "Download", onClick: () => { void downloadPrivateExport(exportId).catch((error: unknown) => notify("Could not download export", error instanceof Error ? error.message : "Try again.", { id: "finance-export", variant: "error" })); } },
        });
        return;
      }
      notify("Purchase export ready", "The export completed.", { id: "finance-export", variant: "success" });
    } catch (error) {
      notify("Could not export purchases", error instanceof Error ? error.message : "Try again.", {
        id: "finance-export",
        variant: "error",
        action: { label: "Try again", onClick: () => { void exportRegister(); } },
      });
    }
  }

  async function deliverNotifications() {
    try {
      const saved = await session.mutate({ action: "retryOutbox", requestId: crypto.randomUUID() });
      const recovery = saved.recovery;
      const uncertain = (recovery?.uncertain ?? 0) > 0;
      notify(uncertain ? "Delivery needs reconciliation" : "Notification delivery finished", recovery?.message ?? "No finance notifications were waiting.", {
        id: "finance-delivery",
        variant: uncertain || (recovery?.failed ?? 0) > 0 ? "warning" : "success",
      });
    } catch (error) {
      notify("Could not deliver notifications", error instanceof Error ? error.message : "Try again.", {
        id: "finance-delivery",
        variant: "error",
        action: { label: "Try again", onClick: () => { void deliverNotifications(); } },
      });
    }
  }

  async function cleanUploads() {
    try {
      const saved = await session.mutate({ action: "cleanupUploads", requestId: crypto.randomUUID() });
      const recovery = saved.recovery;
      const uncertain = (recovery?.uncertain ?? 0) > 0;
      notify(uncertain ? "Cleanup needs reconciliation" : "Upload cleanup finished", recovery?.message ?? "No expired uploads were ready for cleanup.", {
        id: "finance-cleanup",
        variant: uncertain ? "warning" : "success",
      });
    } catch (error) {
      notify("Could not clean up uploads", error instanceof Error ? error.message : "Try again.", {
        id: "finance-cleanup",
        variant: "error",
        action: { label: "Try again", onClick: () => { void cleanUploads(); } },
      });
    }
  }

  async function registerPurchase(event: FormEvent) {
    event.preventDefault();
    if (!canRegister) return;
    setSaving(true);
    const payload: PurchaseInput = {
      ...purchase,
      requestRecordId: detail?.status === "approved" ? detail.id : purchase.requestRecordId ?? undefined,
      uploadIds: uploads.filter((row) => row.status === "ready").map((row) => row.uploadId),
    };
    try {
      const check = await session.mutate({ action: "checkPurchase", requestId: crypto.randomUUID(), purchase: payload });
      if (check.errors.length) {
        notify("Check the form", check.errors[0]?.message ?? "Fix the highlighted fields.", { id: "purchase-check", variant: "error" });
        return;
      }
      for (const warning of check.warnings) notify("Purchase warning", warning.message, { id: `purchase-warning-${warning.message}`, variant: "warning" });
      const saved = await session.mutate({
        action: "registerPurchase",
        requestId: purchaseRequests.idFor(JSON.stringify(payload)),
        purchase: payload,
      });
      purchaseRequests.finish();
      for (const warning of saved.warnings) notify("Purchase saved", warning.message, { id: `purchase-saved-${warning.message}`, variant: "warning" });
      notify("Purchase registered", saved.id ? "Reference saved." : "Your purchase was saved.", { id: "purchase-saved", variant: "success" });
      setPurchase(emptyPurchase(session.today ?? "", purchase.buyerName));
      setUploads([]);
      await session.loadPage("purchases", purchaseLoadOptions(selectedId));
      if (!budgetsLoaded) await session.loadPage("budgets");
    } catch (error) {
      notify("Could not register purchase", error instanceof Error ? error.message : "Please try again.", { id: "purchase-save", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  function openNew() {
    setSelectedId(null);
    setEditor({
      revision: 0,
      supplierName: "",
      justification: "",
      plannedDate: today,
      lateReason: "",
      lines: [emptyRequestLine()],
    });
    void session.loadPage("purchases", purchaseLoadOptions(null));
  }

  function openRequest(row: OwnRequestSummary) {
    setSelectedId(row.id);
    void session.loadPage("purchases", purchaseLoadOptions(row.id)).then(() => {
      const loaded = session.purchases?.detail;
      if (!loaded) return;
      setEditor({
        requestRecordId: loaded.id,
        revision: loaded.revision,
        supplierName: loaded.supplierName ?? "",
        justification: loaded.justification ?? "",
        plannedDate: loaded.plannedDate ?? today,
        lateReason: loaded.lateReason ?? "",
        lines: loaded.draftLines.length ? loaded.draftLines : [emptyRequestLine()],
      });
    });
  }

  async function run(key: string, action: FinanceMutation, success: string) {
    setSaving(true);
    try {
      await session.mutate({ ...action, requestId: requests.idFor(key) });
      requests.finish();
      notify("Request saved", success, { id: "request-saved", variant: "success" });
      await session.loadPage("purchases", purchaseLoadOptions(selectedId));
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
      await session.loadPage("purchases", purchaseLoadOptions(null));
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
    <div className="space-y-10">
      {canRegister ? (
        <form className="space-y-6 rounded-lg border p-6" onSubmit={registerPurchase}>
          <div>
            <h2 className="text-xl font-medium">Register a purchase</h2>
            <p className="text-sm text-muted-foreground">Line amount is the total in NOK including VAT; quantity is descriptive only.</p>
          </div>
          {!budgetsLoaded ? (
            <p className="text-sm text-muted-foreground">An approved season budget is required before you can register purchases.</p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Buyer name" value={purchase.buyerName} onChange={(value) => setPurchase((current) => ({ ...current, buyerName: value }))} />
            <Field label="Supplier name" value={purchase.supplierName} onChange={(value) => setPurchase((current) => ({ ...current, supplierName: value }))} />
            <Field label="Purchase date" type="date" value={purchase.purchaseDate} onChange={(value) => setPurchase((current) => ({ ...current, purchaseDate: value }))} />
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={purchase.paymentMethod} onValueChange={(value) => setPurchase((current) => ({ ...current, paymentMethod: value as PurchaseInput["paymentMethod"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team_account">Team account</SelectItem>
                  <SelectItem value="outlay">Outlay</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Justification</Label>
              <Textarea value={purchase.justification} onChange={(event) => setPurchase((current) => ({ ...current, justification: event.target.value }))} rows={3} />
            </div>
            {purchase.paymentMethod === "outlay" ? (
              <>
                <Field label="Refund account (11 digits)" value={purchase.refundAccount ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, refundAccount: value, refundPhone: "" }))} />
                <Field label="Refund phone (8 digits)" value={purchase.refundPhone ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, refundPhone: value, refundAccount: "" }))} />
              </>
            ) : null}
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={purchase.documentKind} onValueChange={(value) => setPurchase((current) => ({ ...current, documentKind: value as PurchaseInput["documentKind"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {purchase.documentKind === "invoice" || purchase.paymentMethod === "invoice" ? (
              <Field label="Invoice due date" type="date" value={purchase.invoiceDueDate ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, invoiceDueDate: value }))} />
            ) : null}
            <Field label="Document number (optional)" value={purchase.documentNumber ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, documentNumber: value }))} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Lines</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setPurchase((current) => ({ ...current, lines: [...current.lines, emptyPurchaseLine()] }))}>Add line</Button>
            </div>
            {purchase.lines.map((line, index) => (
              <LineEditor
                key={index}
                index={index}
                line={line}
                systems={systems}
                items={line.systemId ? itemsBySystem.get(line.systemId) ?? [] : []}
                requestLines={detail?.status === "approved" ? approvedLinkLines : []}
                onChange={(patch) => updatePurchaseLine(index, patch)}
                onRemove={() => setPurchase((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }))}
                removable={purchase.lines.length > 1}
              />
            ))}
          </div>
          <div className="space-y-3">
            <Label>Supporting files (1 to 15, max 10 MB each)</Label>
            <Input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file);
            }} />
            {uploads.length ? (
              <ul className="text-sm text-muted-foreground">
                {uploads.map((file) => <li key={file.localId}>{file.name} — {file.status}</li>)}
              </ul>
            ) : null}
          </div>
          <Button type="submit" disabled={saving || !budgetsLoaded}>{saving ? "Saving…" : "Register purchase"}</Button>
        </form>
      ) : null}
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
            <CardDescription>
              Open approval · approved {detail.approvedNok ?? "—"} · fulfilled {detail.fulfilledNok} · remaining {detail.remainingNok}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(detail.fulfillments?.length ?? 0) > 0 ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">Linked purchases</p>
                {detail.fulfillments?.map((row) => (
                  <div key={row.publicRef} className="rounded-md border p-3">
                    <p>{row.publicRef} · {row.purchaseDate} · {row.totalNok}</p>
                    <ul className="mt-1 text-muted-foreground">
                      {row.lines.map((line, index) => (
                        <li key={`${row.publicRef}-${index}`}>{line.description}: {line.amountNok}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
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
                <Button type="button" variant="outline" size="sm" onClick={() => setEditor({ ...editor, lines: [...editor.lines, emptyRequestLine()] })}>Add line</Button>
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
      {canExport ? (
        <section className="space-y-3">
          <h2 className="text-xl font-medium">Finance tools</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void exportRegister()}>Export purchases</Button>
            <Button type="button" variant="outline" onClick={() => void deliverNotifications()}>Deliver notifications</Button>
            <Button type="button" variant="outline" onClick={() => void cleanUploads()}>Clean up expired uploads</Button>
          </div>
        </section>
      ) : null}
      {session.capabilities?.purchaseRegister ? (
        <PurchaseRegister
          register={register}
          unpaidCount={purchases.unpaidCount ?? register.filter((row) => row.unpaid).length}
          unpaidOnly={unpaidOnly}
          today={today}
          canAct={canReview}
          onToggleUnpaid={(next) => {
            unpaidOnlyRef.current = next;
            setUnpaidOnly(next);
            void session.loadPage("purchases", {
              ...(selectedId ? { requestRecordId: selectedId } : {}),
              ...(next ? { unpaidOnly: true } : {}),
            });
          }}
          onMutate={session.mutate}
          onChanged={() => session.loadPage("purchases", purchaseLoadOptions(selectedId))}
        />
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function LineEditor({
  index,
  line,
  systems,
  items,
  requestLines,
  onChange,
  onRemove,
  removable,
}: {
  index: number;
  line: PurchaseLineInput;
  systems: BudgetChoiceSystem[];
  items: BudgetChoiceItem[];
  requestLines: Array<{ id: string; budgetItemId: string; description: string; approvedNok: string | null }>;
  onChange: (patch: Partial<PurchaseLineInput>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
      <p className="md:col-span-2 text-sm font-medium">Line {index + 1}</p>
      <div className="space-y-2">
        <Label>System</Label>
        <Select value={line.systemId} onValueChange={(value) => onChange({ systemId: value })}>
          <SelectTrigger><SelectValue placeholder="Choose system" /></SelectTrigger>
          <SelectContent>
            {systems.map((system) => <SelectItem key={system.id} value={system.id}>{system.code} — {system.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Budget item</Label>
        <Select
          value={line.unbudgeted ? "__unbudgeted" : line.budgetItemId ?? ""}
          onValueChange={(value) => onChange(value === "__unbudgeted" ? { unbudgeted: true, budgetItemId: undefined } : { unbudgeted: false, budgetItemId: value })}
          disabled={!line.systemId}
        >
          <SelectTrigger><SelectValue placeholder="Choose item" /></SelectTrigger>
          <SelectContent>
            {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.publicRef} — {item.description}</SelectItem>)}
            <SelectItem value="__unbudgeted">Not in the budget</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Field label="Description" value={line.description} onChange={(value) => onChange({ description: value })} />
      <Field label="Quantity (descriptive)" value={line.quantity} onChange={(value) => onChange({ quantity: value })} />
      <Field label="Line total (NOK)" value={line.amountNok} onChange={(value) => onChange({ amountNok: value })} />
      {requestLines.length > 0 ? (
        <div className="space-y-2 md:col-span-2">
          <Label>Approved request line (optional)</Label>
          <Select
            value={line.requestLineId ?? "__none"}
            onValueChange={(value) => {
              if (value === "__none") {
                onChange({ requestLineId: undefined });
                return;
              }
              const match = requestLines.find((row) => row.id === value);
              onChange({ requestLineId: value, budgetItemId: match?.budgetItemId, unbudgeted: false });
            }}
          >
            <SelectTrigger><SelectValue placeholder="Link to approval line" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No request link</SelectItem>
              {requestLines.map((row) => (
                <SelectItem key={row.id} value={row.id}>{row.description} · {row.approvedNok ?? "—"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center gap-2 md:col-span-2">
        <Checkbox checked={line.unbudgeted === true} onCheckedChange={(checked) => onChange({ unbudgeted: checked === true, budgetItemId: checked === true ? undefined : line.budgetItemId })} id={`unbudgeted-${index}`} />
        <Label htmlFor={`unbudgeted-${index}`}>Not in the budget</Label>
        {removable ? <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Remove line</Button> : null}
      </div>
    </div>
  );
}
