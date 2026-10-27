import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
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
  const generation = useRef(0);
  const retryIds = useRef(new Map<string, string>());
  const allowed = Boolean(session.capabilities?.purchaseRegister && session.access === "allowed");

  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const view = await api.recovery();
      if (generation.current === current) setData(view);
    } catch (error) {
      if (generation.current !== current) return;
      setData(null);
      if (error instanceof FinanceRequestError && (error.status === 401 || error.status === 403)) session.retry();
      notify("Could not load finance recovery", error instanceof Error ? error.message : "Please try again.", {
        id: "finance-recovery-read", variant: "error", action: { label: "Try again", onClick: () => { void load(); } },
      });
    }
  }, [api, notify, session.retry]);

  useEffect(() => {
    if (allowed) void load();
    else { generation.current += 1; retryIds.current.clear(); setData(null); }
    return () => { generation.current += 1; };
  }, [allowed, load]);

  async function reconcile(action: Record<string, unknown>) {
    const key = JSON.stringify(action);
    const requestId = retryIds.current.get(key) ?? crypto.randomUUID();
    retryIds.current.set(key, requestId);
    setBusy(true);
    try {
      const result = await session.mutate({ ...action, requestId });
      retryIds.current.delete(key);
      notify("Recovery updated", result.recovery?.message ?? "The recovery record was updated.", { id: "finance-recovery", variant: "success" });
      await load();
    } catch (error) {
      notify("Could not update recovery", error instanceof Error ? error.message : "Please try again.", {
        id: "finance-recovery", variant: "error", action: { label: "Try again", onClick: () => { void reconcile(action); } },
      });
    } finally { setBusy(false); }
  }

  if (!allowed) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Delivery and upload recovery</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">Check the provider or storage outcome before recording a result. At most 50 recent records of each type are shown.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { void load(); }} disabled={busy}>Refresh recovery</Button>
        {data && data.deliveries.length === 0 && data.uploads.length === 0 ? <p>No delivery or upload records need attention.</p> : null}
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
      </CardContent>
    </Card>
  );
}
