import { useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { ExceptionKind, FinanceMutation, FinanceMutationResult, FinancePurchaseSummary } from "./types";

const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  missing_approval: "Missing approval",
  overrun: "Approved amount exceeded",
  line_mismatch: "Approval line mismatch",
  dated_before_approval: "Dated before approval",
};

function useStableIds() {
  const pending = useRef(new Map<string, { fingerprint: string; id: string }>());
  return {
    idFor(key: string, fingerprint: string) {
      const current = pending.current.get(key);
      if (current?.fingerprint === fingerprint) return current.id;
      const id = crypto.randomUUID();
      pending.current.set(key, { fingerprint, id });
      return id;
    },
    finish(key: string) {
      pending.current.delete(key);
    },
  };
}

function paymentState(row: FinancePurchaseSummary): string {
  if (row.status === "voided") return "Voided";
  if (row.unpaid) return "Unpaid";
  if (row.invoice || row.reimbursement) return "Settled";
  return "No payment due";
}

export function PurchaseRegister({
  register,
  unpaidCount,
  unpaidOnly,
  today,
  canAct,
  onToggleUnpaid,
  onMutate,
  onChanged,
}: {
  register: FinancePurchaseSummary[];
  unpaidCount: number;
  unpaidOnly: boolean;
  today: string;
  canAct: boolean;
  onToggleUnpaid: (unpaidOnly: boolean) => void;
  onMutate: (action: FinanceMutation) => Promise<FinanceMutationResult>;
  onChanged: () => Promise<void>;
}) {
  const notify = useNotify();
  const requests = useStableIds();
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [paidOn, setPaidOn] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fingerprint: string, action: FinanceMutation, success: string, failure: string) {
    setBusy(key);
    try {
      const saved = await onMutate({ ...action, requestId: requests.idFor(key, fingerprint) });
      requests.finish(key);
      notify(success, saved.id ? "The purchase register was updated." : "Saved.", { id: key, variant: "success" });
      await onChanged();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      notify(failure, message, {
        id: key,
        variant: "error",
        action: { label: "Try again", onClick: () => { void run(key, fingerprint, action, success, failure); } },
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function download(documentId: string, name: string) {
    try {
      const saved = await onMutate({ action: "downloadDocument", requestId: crypto.randomUUID(), documentId });
      if (!saved.downloadUrl) throw new Error("The file download was not prepared.");
      const link = document.createElement("a");
      link.href = saved.downloadUrl;
      link.download = name;
      link.rel = "noopener";
      link.click();
    } catch (error) {
      notify("Could not download the file", error instanceof Error ? error.message : "Please try again.", {
        id: "purchase-download",
        variant: "error",
        action: { label: "Try again", onClick: () => { void download(documentId, name); } },
      });
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium">Purchase register</h2>
        <div className="flex items-center gap-2">
          <Checkbox
            id="unpaid-only"
            checked={unpaidOnly}
            onCheckedChange={(checked) => onToggleUnpaid(checked === true)}
          />
          <Label htmlFor="unpaid-only">Unpaid only ({unpaidCount})</Label>
        </div>
      </div>
      {register.length === 0 ? (
        <p className="text-sm text-muted-foreground">{unpaidOnly ? "No unpaid purchases." : "No purchases in this season."}</p>
      ) : null}
      {register.map((row) => {
        const dateKey = `paid-${row.id}`;
        const paidDate = paidOn[row.id] ?? today;
        return (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="text-base">{row.publicRef} · {paymentState(row)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{row.supplierName} · {row.buyerName} · {row.requesterName}</p>
              <p>{row.purchaseDate} · {row.totalNok} NOK</p>
              <p>{row.justification}</p>
              {row.voidReason ? <p>Void reason: {row.voidReason}</p> : null}
              {row.invoice ? (
                <p>
                  Invoice {row.documentNumber ?? row.invoice.dueDate ?? "—"}
                  {row.invoice.dueDate ? ` due ${row.invoice.dueDate}` : ""}
                  {" · "}
                  {row.invoice.paid ? `Paid ${row.invoice.paidOn ?? ""}` : "Unpaid"}
                </p>
              ) : null}
              {row.reimbursement ? (
                <p>Outlay reimbursement · {row.reimbursement.paid ? `Paid ${row.reimbursement.paidOn ?? ""}` : "Unpaid"}</p>
              ) : null}
              {row.refundAccount ? <p>Refund account {row.refundAccount}</p> : null}
              {row.refundPhone ? <p>Refund phone {row.refundPhone}</p> : null}
              {row.lines.length > 0 ? (
                <ul className="space-y-1">
                  {row.lines.map((line) => (
                    <li key={line.id}>{line.systemName}{line.itemName ? ` · ${line.itemName}` : ""} · {line.description} · {line.amountNok} · allocated {line.allocationNok}</li>
                  ))}
                </ul>
              ) : null}
              {row.documents.length > 0 ? (
                <ul className="space-y-1">
                  {row.documents.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-2">
                      <span>{doc.originalName} · {doc.kind}{doc.documentNumber ? ` · ${doc.documentNumber}` : ""}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => void download(doc.id, doc.originalName)}>Download</Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {row.exceptions.map((review) => (
                <div key={review.id} className="space-y-2 rounded-md border p-3">
                  <p>{EXCEPTION_LABELS[review.kind]} · {review.reviewStatus === "reviewed" ? "Reviewed" : "Open"}</p>
                  {review.reason ? <p>{review.reason}</p> : null}
                  {review.reviewStatus === "open" && canAct ? (
                    <>
                      <Label htmlFor={`review-${review.id}`}>Review reason</Label>
                      <Textarea
                        id={`review-${review.id}`}
                        value={reviewReasons[review.id] ?? ""}
                        onChange={(event) => setReviewReasons((current) => ({ ...current, [review.id]: event.target.value }))}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => {
                          const reason = reviewReasons[review.id] ?? "";
                          void run(
                            `review-${review.id}`,
                            `${review.id}:${reason}`,
                            { action: "reviewException", requestId: "", reviewId: review.id, reason, expectedRevision: row.revision },
                            "Review recorded",
                            "Could not record the review",
                          );
                        }}
                      >
                        Record review
                      </Button>
                    </>
                  ) : null}
                </div>
              ))}
              {canAct && row.status === "registered" ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">Recording a payment does not change recorded spending or open commitments. A review does not approve the purchase or mark it paid.</p>
                  {(row.invoice || row.reimbursement) ? (
                    <div className="space-y-2">
                      <Label htmlFor={dateKey}>Payment date</Label>
                      <Input id={dateKey} type="date" value={paidDate} onChange={(event) => setPaidOn((current) => ({ ...current, [row.id]: event.target.value }))} />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {row.invoice && !row.invoice.paid ? (
                      <Button type="button" size="sm" disabled={busy !== null} onClick={() => void run(`invoice-${row.id}`, paidDate, { action: "markInvoicePaid", requestId: "", purchaseId: row.id, paidOn: paidDate, expectedRevision: row.revision }, "Invoice marked paid", "Could not mark the invoice paid")}>Mark invoice paid</Button>
                    ) : null}
                    {row.invoice?.paid ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`invoice-undo-${row.id}`, "undo", { action: "unmarkInvoicePaid", requestId: "", purchaseId: row.id, expectedRevision: row.revision }, "Invoice payment removed", "Could not undo the invoice payment")}>Undo invoice payment</Button>
                    ) : null}
                    {row.reimbursement && !row.reimbursement.paid ? (
                      <Button type="button" size="sm" disabled={busy !== null} onClick={() => void run(`outlay-${row.id}`, paidDate, { action: "markRefundPaid", requestId: "", purchaseId: row.id, paidOn: paidDate, expectedRevision: row.revision }, "Outlay marked reimbursed", "Could not mark the outlay reimbursed")}>Mark outlay reimbursed</Button>
                    ) : null}
                    {row.reimbursement?.paid ? (
                      <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`outlay-undo-${row.id}`, "undo", { action: "unmarkRefundPaid", requestId: "", purchaseId: row.id, expectedRevision: row.revision }, "Reimbursement removed", "Could not undo the reimbursement")}>Undo reimbursement</Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`void-${row.id}`}>Void reason</Label>
                    <Textarea
                      id={`void-${row.id}`}
                      value={voidReasons[row.id] ?? ""}
                      onChange={(event) => setVoidReasons((current) => ({ ...current, [row.id]: event.target.value }))}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => {
                        const reason = voidReasons[row.id] ?? "";
                        void run(
                          `void-${row.id}`,
                          reason,
                          { action: "voidPurchase", requestId: "", purchaseId: row.id, reason, expectedRevision: row.revision },
                          "Purchase voided",
                          "Could not void the purchase",
                        );
                      }}
                    >
                      Void purchase
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
