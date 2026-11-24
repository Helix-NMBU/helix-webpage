import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { DialogFooter } from "@libs/components/ui/dialog";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { dealBudgetLinksRepository } from "./deal-budget-links-repository";
import type { DealBudgetLinks, DealBudgetLinksRepository } from "./deal-budget-links-types";
import type { Deal } from "./types";

export function WonBudgetReview({
  deal, isNew, busy, onConfirm, onReviewLatest, children, repository: provided,
}: {
  deal: Deal;
  isNew: boolean;
  busy: boolean;
  onConfirm: () => void;
  onReviewLatest: () => void;
  children: ReactNode;
  repository?: DealBudgetLinksRepository;
}) {
  const repository = useMemo(() => provided ?? dealBudgetLinksRepository(), [provided]);
  const [review, setReview] = useState<DealBudgetLinks | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reload, setReload] = useState(0);
  const notify = useNotify();
  const reviewLatest = useRef(onReviewLatest);
  reviewLatest.current = onReviewLatest;
  useEffect(() => {
    let active = true;
    setReview(null);
    setAcknowledged(false);
    if (isNew) return;
    void repository.load(deal.id).then((next) => {
      if (!active) return;
      if (next.dealId !== deal.id || next.dealRevision !== deal.revision) {
        notify("Card changed", "Review the latest card and budget links before confirming.", {
          variant: "warning", href: null,
          action: { label: "Review latest", onClick: () => reviewLatest.current() },
        });
        return;
      }
      setReview(next);
    }).catch((error: unknown) => {
      if (!active) return;
      notify("Could not review budget links", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null,
        action: { label: "Retry", onClick: () => setReload((value) => value + 1) },
      });
    });
    const stop = repository.watchSession?.(() => {
      active = false;
      setReview(null);
      setAcknowledged(false);
    });
    return () => { active = false; stop?.(); };
  }, [repository, deal.id, deal.revision, isNew, reload, notify]);
  const entries = review?.entries.filter((entry) => entry.selected) ?? [];
  const ready = isNew || review?.dealRevision === deal.revision;
  const grant = deal.opportunityKind === "grant";
  return <>
    {entries.length > 0 && <section className="space-y-3 text-sm" aria-label="Budget priority lock">
      <h3 className="font-medium">Lock {entries.length} linked budget {entries.length === 1 ? "entry" : "entries"} at P0</h3>
      <p className="text-muted-foreground">Confirming this {grant ? "grant as Approved" : "deal as Won"} sets these entries to P0 in the budget. Their links cannot be removed afterward.{!review?.locked && " Cancel to change the linked entries first."}</p>
      <ul className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
        {entries.map((entry) => <li key={entry.entryId} className="flex justify-between gap-3"><span>{entry.description}<span className="block text-xs text-muted-foreground">{entry.projectName} · {entry.departmentName}</span></span><span className="shrink-0 tabular-nums">{entry.priority === "P0" ? "P0" : `${entry.priority} → P0`}</span></li>)}
      </ul>
      <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
        <Checkbox checked={acknowledged} disabled={busy} onCheckedChange={(value) => setAcknowledged(value === true)} />
        <span>I understand these budget entries will be locked at P0.</span>
      </label>
    </section>}
    <DialogFooter>
      {children}
      <Button disabled={busy || !ready || (entries.length > 0 && !acknowledged)} onClick={() => { if (ready && (!entries.length || acknowledged)) onConfirm(); }}>
        {grant ? "Confirm approved" : "Confirm won"}
      </Button>
    </DialogFooter>
  </>;
}
