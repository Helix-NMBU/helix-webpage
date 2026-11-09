import { useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { formatOre, osloToday } from "../Finance/money";
import type { SponsorReceipt as Receipt } from "./types";

export function SponsorReceipt({ receipt, amountOre, season, onRecorded }: {
  receipt: Receipt;
  amountOre: string;
  season: string;
  onRecorded: () => void;
}) {
  const { mutate } = useFinanceAccess();
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const today = osloToday();
  const canSave = !saving && Boolean(date) && date !== receipt.receivedDate && date <= today;
  const request = useRef<{ date: string; revision: number; id: string } | null>(null);

  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    const previous = request.current;
    const submission = previous?.date === date && previous.revision === receipt.revision
      ? previous
      : { date, revision: receipt.revision, id: crypto.randomUUID() };
    request.current = submission;
    setSaving(true);
    try {
      const result = await mutate({
        action: "editFunding",
        requestId: submission.id,
        expectedRevision: submission.revision,
        fundingId: receipt.fundingId,
        patch: { status: "received", receivedDate: date },
      });
      if (!result.ok) throw new Error(result.errors[0]?.message ?? "Check the receipt date and try again.");
      notify("Sponsor payment recorded", "The receipt is included in Season Overview.", { variant: "success" });
      setOpen(false);
      onRecorded();
    } catch (error) {
      notify("Could not record sponsor payment", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, action: { label: "Refresh Pipeline", onClick: onRecorded },
      });
    } finally {
      setSaving(false);
    }
  }

  const amount = `NOK ${formatOre(BigInt(amountOre))}`;
  function changeOpen(next: boolean) {
    if (saving) return;
    if (next) setDate(receipt.receivedDate ?? "");
    setOpen(next);
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" size="sm" variant="outline">
      {receipt.receivedDate ? <>Payment received · <time dateTime={receipt.receivedDate}>{receipt.receivedDate}</time></> : <>Record sponsor payment · {season}</>}
    </Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Payment received date</DialogTitle>
        <DialogDescription>Confirm the date this payment arrived. {amount} · {season}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={(event) => void record(event)}>
        <label className="grid gap-1 text-sm">
          Payment received date
          <Input type="date" required max={today} value={date} onInput={(event) => setDate(event.currentTarget.value)} disabled={saving} />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={!canSave}>Save payment date</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
