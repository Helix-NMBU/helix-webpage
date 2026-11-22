import type { FinanceMutation, ExceptionKind, FinancePurchaseSummary } from "./types";

export const purchaseReviewLabels: Record<ExceptionKind, string> = {
  missing_approval: "Missing approval", overrun: "Over budget", line_mismatch: "Approval mismatch",
  dated_before_approval: "Before approval", budget_overrun: "Over budget", unbudgeted: "Unbudgeted",
};
export function purchaseTitle(row: FinancePurchaseSummary) {
  return (row.lines.length === 1 ? row.lines[0].description : row.justification) || row.publicRef;
}
export function purchasePaymentLabel(row: FinancePurchaseSummary) {
  return row.status === "voided" ? "Voided" : row.unpaid ? "Unpaid" : row.reimbursement ? "Reimbursed" : "Paid";
}
export function purchaseDateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "—";
}

export type PurchaseActionRunner = (key: string, fingerprint: string, action: FinanceMutation, success: string, failure: string) => Promise<boolean>;
