import { InvoiceEvidence } from "./InvoiceEvidence";
import type { InvoiceEvidenceActions } from "./invoice-repository";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@libs/components/ui/card";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { createFinanceApi, FinanceRequestError } from "./repository";
import type { FinanceRecoveryView } from "./types";

/** Operational records are read only while the current member holds a Finance grant. */
export function FinanceRecoveryPanel() {
  const session = useFinanceAccess();
  const notify = useNotify();
  const owner = useRef<string | null>(null);
  const api = useMemo(() => createFinanceApi(owner), []);
  const [data, setData] = useState<FinanceRecoveryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliveryPages, setDeliveryPages] = useState([""]);
  const [uploadPages, setUploadPages] = useState([""]);
  const [invoicePages, setInvoicePages] = useState([""]);
  const working = useRef(false),
    writeEpoch = useRef(0);
  const generation = useRef(0);
  const active = useRef(false);
  const retryIds = useRef(new Map<string, string>());
  const allowed = Boolean(
    session.capabilities?.purchaseRegister && session.access === "allowed",
  );
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const deliveryAfter = deliveryPages[deliveryPages.length - 1];
  const uploadAfter = uploadPages[uploadPages.length - 1];
  const invoiceAfter = invoicePages[invoicePages.length - 1];
  const scope = useMemo(
    () => Symbol("finance-recovery-page"),
    [allowed, deliveryAfter, uploadAfter, invoiceAfter],
  );
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const invoiceActions = useMemo<InvoiceEvidenceActions>(
    () => ({
      open: (documentId) =>
        session.mutate({
          action: "downloadDocument",
          documentId,
          requestId: crypto.randomUUID(),
        }),
      retry: (documentId, expectedRevision, requestId) =>
        session.mutate({
          action: "retryInvoiceTransfer",
          documentId,
          expectedRevision,
          requestId,
        }),
    }),
    [session.mutate],
  );

  const load = useCallback(async () => {
    if (
      !active.current ||
      !allowedRef.current ||
      currentScope.current !== scope
    )
      return;
    const current = ++generation.current;
    setData(null);
    try {
      const view = await api.recovery(
        deliveryAfter || undefined,
        uploadAfter || undefined,
        invoiceAfter || undefined,
      );
      if (
        active.current &&
        allowedRef.current &&
        currentScope.current === scope &&
        generation.current === current
      )
        setData(view);
    } catch (error) {
      if (
        !active.current ||
        !allowedRef.current ||
        currentScope.current !== scope ||
        generation.current !== current
      )
        return;
      setData(null);
      if (
        error instanceof FinanceRequestError &&
        (error.status === 401 || error.status === 403)
      )
        session.retry();
      notify(
        "Could not load finance recovery",
        error instanceof Error ? error.message : "Please try again.",
        {
          id: "finance-recovery-read",
          variant: "error",
          action: {
            label: "Try again",
            onClick: () => {
              if (
                active.current &&
                allowedRef.current &&
                currentScope.current === scope
              )
                void load();
            },
          },
        },
      );
    }
  }, [
    api,
    notify,
    session.retry,
    deliveryAfter,
    uploadAfter,
    invoiceAfter,
    scope,
  ]);

  useEffect(() => {
    active.current = true;
    working.current = false;
    setBusy(false);
    if (allowed) void load();
    else {
      generation.current += 1;
      retryIds.current.clear();
      setData(null);
      setDeliveryPages([""]);
      setUploadPages([""]);
      setInvoicePages([""]);
    }
    return () => {
      active.current = false;
      generation.current += 1;
      writeEpoch.current++;
    };
  }, [allowed, load]);

  async function reconcile(action: Record<string, unknown>) {
    if (
      working.current ||
      !active.current ||
      !allowedRef.current ||
      currentScope.current !== scope
    )
      return;
    const operation = ++writeEpoch.current;
    working.current = true;
    const key = JSON.stringify(action);
    const requestId = retryIds.current.get(key) ?? crypto.randomUUID();
    retryIds.current.set(key, requestId);
    setBusy(true);
    try {
      const result = await session.mutate({ ...action, requestId });
      if (
        !active.current ||
        !allowedRef.current ||
        currentScope.current !== scope ||
        writeEpoch.current !== operation
      )
        return;
      retryIds.current.delete(key);
      notify(
        "Recovery updated",
        result.recovery?.message ?? "The recovery record was updated.",
        { id: "finance-recovery", variant: "success" },
      );
      await load();
    } catch (error) {
      if (
        !active.current ||
        !allowedRef.current ||
        currentScope.current !== scope ||
        writeEpoch.current !== operation
      )
        return;
      notify(
        "Could not update recovery",
        error instanceof Error ? error.message : "Please try again.",
        {
          id: "finance-recovery",
          variant: "error",
          action: {
            label: "Try again",
            onClick: () => {
              if (
                active.current &&
                allowedRef.current &&
                currentScope.current === scope &&
                writeEpoch.current === operation
              )
                void reconcile(action);
            },
          },
        },
      );
    } finally {
      if (operation === writeEpoch.current) {
        working.current = false;
        if (active.current) setBusy(false);
      }
    }
  }

  if (!allowed) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Delivery, upload and invoice recovery</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">Check the provider or storage outcome before recording a result. Each page shows up to 50 records.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { void load(); }} disabled={busy}>Refresh recovery</Button>
        {data && data.deliveries.length === 0 && data.uploads.length === 0 && !data.invoiceTransfers?.length ? <p>No delivery, upload or invoice records need attention.</p> : null}
        <h3 className="font-medium">Deliveries</h3>
        {data?.deliveries.map((row) => (
          <div key={row.id} className="space-y-2 rounded-md border p-3">
            <p>{row.eventType} · {row.recipient ?? "Unknown recipient"} · {row.status}</p>
            <p className="text-sm text-muted-foreground">ID {row.id} · {row.attemptCount} attempts · Updated {row.updatedAt}{row.safeError ? ` · ${row.safeError}` : ""}</p>
            {row.providerMessageId ? <p className="text-sm">Provider message ID: {row.providerMessageId}</p> : null}
            <div className="flex flex-wrap gap-2">
              {row.status === "uncertain" ? ([ ["sent", "Recorded as sent"], ["not_sent", "Recorded as not sent"], ["still_unknown", "Still unknown"] ] as const).map(([value, label]) => (
                <Button key={value} type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void reconcile({ action: "retryOutbox", outboxId: row.id, reconciliation: value }); }}>{label}</Button>
              )) : <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void reconcile({ action: "retryOutbox", outboxId: row.id }); }}>Deliver</Button>}
            </div>
          </div>
        ))}
        {data ? <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy || deliveryPages.length === 1} onClick={() => setDeliveryPages((pages) => pages.slice(0, -1))}>Previous deliveries</Button>
          <span>Page {deliveryPages.length}</span>
          <Button type="button" variant="outline" size="sm" disabled={busy || !data.deliveryNextCursor} onClick={() => setDeliveryPages((pages) => [...pages, data.deliveryNextCursor!])}>Next deliveries</Button>
        </div> : null}
        <h3 className="font-medium">Uploads</h3>
        {data?.uploads.map((row) => (
          <div key={row.id} className="space-y-2 rounded-md border p-3">
            <p>Upload · {row.owner ?? "Unknown member"} · {row.status} · {row.referenced ? "Saved purchase reference found" : "No saved purchase reference"}</p>
            <p className="text-sm text-muted-foreground">ID {row.id} · Created {row.createdAt} · Expires {row.expiresAt}</p>
            {row.candidateCount > 0 ? <p>{row.candidateCount} final upload object{row.candidateCount === 1 ? " needs" : "s need"} cleanup.</p> : null}
            <div className="flex flex-wrap gap-2">
              {row.commitState === "uncertain" ? ([ ["saved", "Recorded as saved"], ["absent", "Recorded as absent"], ["still_unknown", "Still unknown"] ] as const).map(([value, label]) => (
                <Button key={value} type="button" variant="outline" size="sm" disabled={busy || (value === "saved" && !row.referenced) || (value === "absent" && row.referenced)} onClick={() => { void reconcile({ action: "cleanupUploads", uploadId: row.id, reconciliation: value }); }}>{label}</Button>
              )) : null}
              {row.candidateCount > 0 ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void reconcile({ action: "cleanupUploads", uploadId: row.id, candidateOnly: true }); }}>Clean up final objects</Button> : null}
            </div>
          </div>
        ))}
        {data ? <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy || uploadPages.length === 1} onClick={() => setUploadPages((pages) => pages.slice(0, -1))}>Previous uploads</Button>
          <span>Page {uploadPages.length}</span>
          <Button type="button" variant="outline" size="sm" disabled={busy || !data.uploadNextCursor} onClick={() => setUploadPages((pages) => [...pages, data.uploadNextCursor!])}>Next uploads</Button>
        </div> : null}
        <h3 className="font-medium">Invoice transfers</h3>
        {data?.invoiceTransfers?.map((row) => (
          <div key={row.documentId} className="space-y-2 rounded-md border p-3">
            <p className="text-sm">{row.purchaseRef}</p>
            <InvoiceEvidence
              invoice={row}
              actions={invoiceActions}
              onChanged={load}
              onAccessEnded={() => {
                generation.current++;
                setData(null);
                session.retry();
              }}
            />
            <p className="text-sm text-muted-foreground">
              {row.attempts} attempts · Updated {row.updatedAt}
              {row.safeError ? ` · ${row.safeError}` : ""}
            </p>
          </div>
        ))}
        {data ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || invoicePages.length === 1}
              onClick={() => setInvoicePages((pages) => pages.slice(0, -1))}
            >
              Previous invoices
            </Button>
            <span>Page {invoicePages.length}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !data.invoiceNextCursor}
              onClick={() =>
                setInvoicePages((pages) => [...pages, data.invoiceNextCursor!])
              }
            >
              Next invoices
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
