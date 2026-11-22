import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { SheetDescription, SheetHeader, SheetTitle } from "@libs/components/ui/sheet";
import { Textarea } from "@libs/components/ui/textarea";
import { PurchaseInvoice } from "./PurchaseInvoice";
import { InvoiceEvidence } from "./InvoiceEvidence";
import type { InvoiceEvidenceActions } from "./invoice-repository";
import { projectBudgetMoney } from "./project-budget-diff";
import { purchaseDateLabel, purchasePaymentLabel, purchaseReviewLabels, purchaseTitle, type PurchaseActionRunner } from "./purchase-presentation";
import type { FinancePurchaseSummary } from "./types";

type Props = { row: FinancePurchaseSummary; today: string; canAct: boolean; busy: boolean; onRun: PurchaseActionRunner; invoiceActions: InvoiceEvidenceActions; onChanged: () => Promise<void>; onAccessEnded: () => void };

/** A compact reading view; forms are opened only for the action being taken. */
export function PurchasePanel({ row, today, canAct, busy, onRun, invoiceActions, onChanged, onAccessEnded }: Props) {
  const [paidOn, setPaidOn] = useState(today);
  const [paymentEditor, setPaymentEditor] = useState<string | null>(null);
  const [reviewEditor, setReviewEditor] = useState<string | null>(null);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [voidReason, setVoidReason] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const title = purchaseTitle(row), state = purchasePaymentLabel(row);
  const active = row.status === "registered";
  const openReviews = active ? row.exceptions.filter(review => review.reviewStatus === "open") : [];
  const reviewGroups = [...new Set(openReviews.map(review => purchaseReviewLabels[review.kind]))].map(label => ({ label, reviews: openReviews.filter(review => purchaseReviewLabels[review.kind] === label) }));
  const invoices = row.documents.map(doc => ({ documentId: doc.id, purchaseId: row.id, purchaseRef: row.publicRef,
    originalName: doc.originalName, backend: doc.backend ?? "private_storage" as const, transferStatus: doc.transferStatus ?? "stored" as const,
    transferRevision: doc.transferRevision, canRetry: doc.canRetry, viewerUrl: doc.viewerUrl ?? null }));

  function paymentAction(kind: "invoice" | "outlay", paid: boolean) {
    if (!canAct || !active || paid) return null;
    const id = `${kind}-${row.id}`;
    return <Popover open={paymentEditor === kind} onOpenChange={open => setPaymentEditor(open ? kind : null)}>
      <PopoverTrigger asChild><Button size="sm" disabled={busy}>{kind === "invoice" ? "Mark paid" : "Mark reimbursed"}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-2"><Label htmlFor={id}>Payment date</Label><Input id={id} type="date" value={paidOn} onChange={event => setPaidOn(event.target.value)} /></div>
        <Button className="w-full" size="sm" disabled={busy || !paidOn} onClick={() => void (async () => {
          const saved = await onRun(id, paidOn, { action: kind === "invoice" ? "markInvoicePaid" : "markRefundPaid", requestId: "", purchaseId: row.id, paidOn, expectedRevision: row.revision }, kind === "invoice" ? "Invoice marked paid" : "Outlay marked reimbursed", "Could not record payment");
          if (saved) setPaymentEditor(null);
        })()}>Save payment</Button>
      </PopoverContent>
    </Popover>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <SheetHeader className="shrink-0 gap-3 border-b p-6 pr-14">
      <p className="text-xs text-muted-foreground">{row.publicRef}</p>
      <SheetTitle className="text-xl leading-snug">{title}</SheetTitle>
      <SheetDescription className="sr-only">Purchase details for {row.supplierName}</SheetDescription>
      <div className="flex flex-wrap items-center gap-3"><p className="text-2xl font-semibold tracking-tight tabular-nums">{projectBudgetMoney(row.totalNok)}</p><Badge variant="secondary" className={!active ? undefined : row.unpaid ? "bg-[var(--warning)] text-[var(--warning-foreground)]" : "bg-[var(--success)] text-[var(--success-foreground)]"}>{state}</Badge></div>
    </SheetHeader>
    <div className="min-h-0 space-y-6 overflow-y-auto p-6">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
        {[["Project", row.projectName || "No project"], ["Department", row.departmentName || "No department"], ["Supplier", row.supplierName], ["Purchase date", purchaseDateLabel(row.purchaseDate)]].map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
      </dl>

      {row.lines.length > 1 ? <section className="space-y-2"><h3 className="text-sm font-medium">Items</h3><ul className="divide-y rounded-lg border px-3">{row.lines.map(line => <li key={line.id} className="flex justify-between gap-4 py-3 text-sm"><span>{line.description}</span><span className="shrink-0 tabular-nums">{projectBudgetMoney(line.amountNok)}</span></li>)}</ul></section> : null}

      <section className="flex items-center justify-between gap-3 border-t pt-4" aria-label="Invoice"><div><h3 className="text-sm font-medium">{row.documentKind === "receipt" ? "Receipt" : "Invoice"}</h3>{row.documentNumber ? <p className="mt-1 text-xs text-muted-foreground">{row.documentNumber}</p> : null}</div><PurchaseInvoice row={row} canLink={canAct} busy={busy} onRun={onRun} actions={invoiceActions} onChanged={onChanged} onAccessEnded={onAccessEnded} /></section>

      {(row.invoice || row.reimbursement) && active ? <section aria-label="Payment" className="space-y-4 border-t pt-4">
        {row.invoice ? <div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-medium">Invoice payment</h3><p className="mt-1 text-xs text-muted-foreground">{row.invoice.paid ? `Paid ${purchaseDateLabel(row.invoice.paidOn)}` : row.invoice.dueDate ? `Due ${purchaseDateLabel(row.invoice.dueDate)}` : "Awaiting payment"}</p></div>{paymentAction("invoice", row.invoice.paid)}</div> : null}
        {row.reimbursement ? <div className="space-y-3"><div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-medium">Reimbursement</h3><p className="mt-1 text-xs text-muted-foreground">{row.reimbursement.paid ? `Reimbursed ${purchaseDateLabel(row.reimbursement.paidOn)}` : row.buyerName}</p></div>{paymentAction("outlay", row.reimbursement.paid)}</div>{!row.reimbursement.paid && (row.refundAccount || row.refundPhone) ? <p className="text-sm">{row.refundAccount ? `Account ${row.refundAccount}` : `Phone ${row.refundPhone}`}</p> : null}</div> : null}
      </section> : null}

      {reviewGroups.length ? <section aria-label="Budget review" className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Budget review</h3>
        {reviewGroups.map(group => <Collapsible key={group.label} className="space-y-3" open={reviewEditor === group.label} onOpenChange={open => setReviewEditor(open ? group.label : null)}>
          <div className="flex items-center justify-between gap-3">
            <Badge variant={group.label === "Unbudgeted" || group.label === "Over budget" ? "destructive" : "secondary"}>{group.label}</Badge>
            {canAct ? <CollapsibleTrigger asChild><Button size="sm" variant="outline" disabled={busy}>Review</Button></CollapsibleTrigger> : null}
          </div>
          {canAct ? <CollapsibleContent className="space-y-3 rounded-lg border p-3">
            <Label htmlFor={`panel-review-${group.reviews[0].id}`}>Review comment</Label>
            <Textarea id={`panel-review-${group.reviews[0].id}`} value={reviewReasons[group.label] ?? ""} onChange={event => setReviewReasons(previous => ({ ...previous, [group.label]: event.target.value }))} />
            {group.reviews.length > 1 ? <p className="text-xs text-muted-foreground">Applies to all {group.reviews.length} related flags.</p> : null}
            <div className="flex justify-end"><Button size="sm" disabled={busy || !reviewReasons[group.label]?.trim()} onClick={() => void (async () => {
              const reason = reviewReasons[group.label] ?? "";
              for (const review of group.reviews) {
                if (!await onRun(`review-${review.id}`, `${review.id}:${reason}`, { action: "reviewException", requestId: "", reviewId: review.id, reason }, "Review recorded", "Could not record the review")) return;
              }
              setReviewEditor(null);
            })()}>Record review</Button></div>
          </CollapsibleContent> : null}
        </Collapsible>)}
      </section> : null}

      {row.voidReason ? <p className="text-sm text-muted-foreground">Void reason: {row.voidReason}</p> : null}
      <Collapsible className="border-t pt-2">
        <CollapsibleTrigger asChild><Button variant="ghost" className="group w-full justify-between px-0 font-normal text-muted-foreground">More details<IconChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 pt-3 text-sm">
          <dl className="grid grid-cols-2 gap-4"><div><dt className="text-xs text-muted-foreground">Purchased by</dt><dd className="mt-1">{row.buyerName}</dd></div>{row.requesterName ? <div><dt className="text-xs text-muted-foreground">Requested by</dt><dd className="mt-1">{row.requesterName}</dd></div> : null}</dl>
          {row.justification && row.justification !== title ? <div><h3 className="text-xs text-muted-foreground">Purchase note</h3><p className="mt-1">{row.justification}</p></div> : null}
          {invoices.length ? <div className="space-y-3"><h3 className="font-medium">Files</h3>{invoices.map(invoice => <InvoiceEvidence key={invoice.documentId} invoice={invoice} actions={invoiceActions} onChanged={onChanged} onAccessEnded={onAccessEnded} />)}</div> : null}
          {row.exceptions.some(review => review.reviewStatus === "reviewed") ? <div className="space-y-2"><h3 className="font-medium">Review history</h3>{row.exceptions.filter(review => review.reviewStatus === "reviewed").map(review => <p key={review.id} className="text-muted-foreground">{purchaseReviewLabels[review.kind]} · {review.reason || "Reviewed"}</p>)}</div> : null}
          {canAct && active ? <div className="flex flex-wrap gap-2">
            {row.invoice?.paid ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRun(`invoice-undo-${row.id}`, "undo", { action: "unmarkInvoicePaid", requestId: "", purchaseId: row.id, expectedRevision: row.revision }, "Invoice payment removed", "Could not undo the invoice payment")}>Undo invoice payment</Button> : null}
            {row.reimbursement?.paid ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onRun(`outlay-undo-${row.id}`, "undo", { action: "unmarkRefundPaid", requestId: "", purchaseId: row.id, expectedRevision: row.revision }, "Reimbursement removed", "Could not undo the reimbursement")}>Undo reimbursement</Button> : null}
            <Dialog open={voidOpen} onOpenChange={setVoidOpen}><DialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive" disabled={busy}>Void purchase</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Void {row.publicRef}?</DialogTitle><DialogDescription>This removes the purchase from spending totals. Its record and files are kept. This cannot be undone.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor={`panel-void-${row.id}`}>Void reason</Label><Textarea id={`panel-void-${row.id}`} value={voidReason} onChange={event => setVoidReason(event.target.value)} /></div><DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button variant="destructive" disabled={busy || !voidReason.trim()} onClick={() => void (async () => { if (await onRun(`void-${row.id}`, voidReason, { action: "voidPurchase", requestId: "", purchaseId: row.id, reason: voidReason, expectedRevision: row.revision }, "Purchase voided", "Could not void the purchase")) setVoidOpen(false); })()}>Confirm void</Button></DialogFooter></DialogContent></Dialog>
          </div> : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  </div>;
}
