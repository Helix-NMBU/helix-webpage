import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { BankSnapshot } from "./types";

export function BankSnapshotEditor() {
  const session = useFinanceAccess();
  const notify = useNotify();
  const [snapshot, setSnapshot] = useState<BankSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [baseRevision, setBaseRevision] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  const load = useCallback(async () => {
    try { setSnapshot(await session.bankSnapshot()); setLoaded(true); }
    catch (error) {
      notify("Could not load bank balance", error instanceof Error ? error.message : "Please try again.", {
        id: "bank-snapshot-load", variant: "error", href: null, action: { label: "Try again", onClick: () => { void load(); } },
      });
    }
  }, [session.bankSnapshot, notify]);
  useEffect(() => { void load(); }, [load, session.viewVersion]);
  useEffect(() => { session.setFormDirty("bank-snapshot", editing); return () => session.setFormDirty("bank-snapshot", false); }, [editing, session.setFormDirty]);
  function begin() {
    setAmount(snapshot?.amountNok ?? "");
    setDate(snapshot?.asOfDate ?? "");
    setBaseRevision(snapshot?.revision ?? 0);
    request.current = null;
    setEditing(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !loaded) return;
    const key = JSON.stringify([amount, date, baseRevision]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setSaving(true);
    try {
      await session.mutate({ action: "setBankSnapshot", amountNok: amount, asOfDate: date, expectedRevision: baseRevision, requestId: request.current.id });
      request.current = null;
      setEditing(false);
      await load();
      notify("Bank balance saved", "The combined bank balance was updated.", { variant: "success", href: null });
    } catch (error) {
      notify("Could not save bank balance", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, action: { label: "Reload balance", onClick: () => { request.current = null; void session.bankSnapshot().then(value => { setSnapshot(value); setBaseRevision(value?.revision ?? 0); }).catch(() => { void load(); }); } },
      });
    } finally { setSaving(false); }
  }
  if (!loaded) return null;
  return <Card>
    <CardHeader><CardTitle>Combined bank balance</CardTitle><CardDescription>Manually entered total across Helix bank accounts{snapshot ? ` · As of ${snapshot.asOfDate}` : ". No balance entered yet."}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {snapshot ? <p className="text-xl tabular-nums">NOK {snapshot.amountNok}</p> : null}
      {editing ? <form onSubmit={event => { void save(event); }} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="bank-amount">Combined balance (NOK)</Label><Input id="bank-amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="bank-date">As of date</Label><Input id="bank-date" type="date" value={date} onChange={event => setDate(event.target.value)} required /></div>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={saving}>Save balance</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button></div>
      </form> : <Button variant="outline" onClick={begin}>Update balance</Button>}
    </CardContent>
  </Card>;
}
