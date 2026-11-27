import { useId, useRef, useState, type FormEvent } from "react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Card, CardAction, CardContent, CardHeader } from "@libs/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { INCOME_CATEGORIES, INCOME_METHODS, INCOME_REASON_MAX, type IncomeReceipt } from "./income-receipts";
import { projectBudgetMoney } from "./project-budget-diff";

const receiptDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const incomeHeadingId = (receipt: IncomeReceipt) => `income-source-${receipt.id}`;

function VoidIncomeDialog({ receipt, seasonCode }: { receipt: IncomeReceipt; seasonCode: string }) {
  const session = useFinanceAccess();
  const notify = useNotify();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const voided = useRef(false);
  const request = useRef<{ reason: string; id: string } | null>(null);

  function changeOpen(next: boolean) {
    if (inFlight.current) return;
    if (next) {
      setReason("");
      request.current = null;
    }
    setOpen(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = reason.trim();
    if (!description || inFlight.current) return;
    if (request.current?.reason !== description) request.current = { reason: description, id: crypto.randomUUID() };
    inFlight.current = true;
    setSaving(true);
    try {
      await session.mutate({ action: "voidIncome", receiptId: receipt.id, seasonCode, reason: description, requestId: request.current.id });
      voided.current = true;
      setOpen(false);
      notify("Income entry voided", "The payment was removed from received income.", { variant: "success", href: null });
    } catch (error) {
      notify("Could not void income", error instanceof Error ? error.message : "Try again.", { variant: "error", href: null });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" size="xs" variant="ghost" aria-label={`Void income from ${receipt.source}`}>Void</Button>
    </DialogTrigger>
    <DialogContent
      showCloseButton={!saving}
      onCloseAutoFocus={event => {
        if (!voided.current) return;
        event.preventDefault();
        document.getElementById(incomeHeadingId(receipt))?.focus({ preventScroll: true });
      }}
      onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }}
      onInteractOutside={event => { if (inFlight.current) event.preventDefault(); }}
    >
      <DialogHeader className="pr-8">
        <DialogTitle>Void income entry?</DialogTitle>
        <DialogDescription>{projectBudgetMoney(receipt.amountNok)} from {receipt.source} will be removed from received income and kept in the register history.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => { void submit(event); }}>
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>Reason</Label>
          <Textarea id={reasonId} value={reason} onChange={event => setReason(event.target.value)} maxLength={INCOME_REASON_MAX} disabled={saving} required />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={saving || !reason.trim()}>{saving ? "Voiding…" : "Void entry"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function IncomeReceiptList({ records, seasonCode }: { records: IncomeReceipt[]; seasonCode: string }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = records.filter(record => [
    record.source, record.reference, record.receivedOn, INCOME_CATEGORIES[record.category], INCOME_METHODS[record.method],
  ].some(value => value?.toLowerCase().includes(query)));

  return <section aria-labelledby="registered-income-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="registered-income-title" className="text-xl font-medium">Registered income</h2>
      {records.length > 0 && <Input
        type="search"
        aria-label="Search registered income"
        placeholder="Search income…"
        value={search}
        onChange={event => setSearch(event.target.value)}
        className="w-full sm:w-64"
      />}
    </div>
    {visible.length === 0 ? <p className="text-sm text-muted-foreground">
      {records.length === 0 ? "No payments registered for this season yet." : "No income matches your search."}
    </p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map(record => <Card key={record.id} role="article" size="sm" className="min-w-0 gap-3">
        <CardHeader>
          <h3 id={incomeHeadingId(record)} tabIndex={-1} className="break-words font-medium">{record.source}</h3>
          <p className="text-xs text-muted-foreground">{INCOME_CATEGORIES[record.category]}</p>
          {record.voidReason === null && <CardAction><VoidIncomeDialog receipt={record} seasonCode={seasonCode} /></CardAction>}
        </CardHeader>
        <CardContent className="mt-auto gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-medium tabular-nums ${record.voidReason === null ? "text-base" : "text-muted-foreground line-through"}`}>{projectBudgetMoney(record.amountNok)}</p>
            {record.voidReason !== null && <Badge variant="outline">Voided</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            <time dateTime={record.receivedOn}>{receiptDate.format(new Date(`${record.receivedOn}T12:00:00Z`))}</time>
            {" · "}{INCOME_METHODS[record.method]}
          </p>
          {record.reference && <p className="break-words text-xs text-muted-foreground">ID {record.reference}</p>}
          {record.voidReason !== null && <p className="break-words text-xs text-muted-foreground">{record.voidReason}</p>}
        </CardContent>
      </Card>)}
    </div>}
  </section>;
}
