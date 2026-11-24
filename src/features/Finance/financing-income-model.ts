import { canonicalNokOre } from "./project-budget-diff";
import { formatOre } from "./money";
import type { FinancingView, FundingRecord, WonIncomeRecord } from "./types";
export type IncomeStatus = "received" | "waiting_on_payment" | "invoice_not_sent" | "awaiting_payment";
export type FinancingIncomeRow = { id: string; sourceName: string; title: string | null; amountNok: string; status: IncomeStatus; receivedDate: string | null; invoiceSentOn: string | null; plannedInvoiceDate: string | null; dealId: string | null; funding: FundingRecord | null; contribution: WonIncomeRecord | null };
export function financingIncomeRows(view: FinancingView): FinancingIncomeRow[] {
  const funding = new Map(view.funding.map(record=>[record.id,record]));
  const linked = new Set<string>();
  const rows: FinancingIncomeRow[] = [];
  for (const contribution of view.wonIncome ?? []) {
    const record = contribution.fundingId ? funding.get(contribution.fundingId) ?? null : null;
    if (record?.status === "deleted") continue;
    if (record && linked.has(record.id)) continue;
    if (record) linked.add(record.id);
    const received = record?.status === "received";
    rows.push({ id: `contribution:${contribution.contributionId}`, sourceName: contribution.sourceName, title: contribution.title, amountNok: received ? record!.amountNok : contribution.amountNok, status: received ? "received" : contribution.opportunityKind === "grant" ? "awaiting_payment" : contribution.invoiceSent ? "waiting_on_payment" : "invoice_not_sent", receivedDate: received ? record!.receivedDate : null, invoiceSentOn: contribution.invoiceSent ? contribution.invoiceSentOn : null, plannedInvoiceDate: contribution.plannedInvoiceDate, dealId: contribution.dealId, funding: record, contribution });
  }
  for (const record of view.funding) if (record.status === "received" && !linked.has(record.id)) rows.push({ id: `funding:${record.id}`, sourceName: record.sourceName, title: null, amountNok: record.amountNok, status: "received", receivedDate: record.receivedDate, invoiceSentOn: null, plannedInvoiceDate: null, dealId: null, funding: record, contribution: null });
  const rank: Record<IncomeStatus,number> = { invoice_not_sent: 0, waiting_on_payment: 1, awaiting_payment: 1, received: 2 };
  return rows.sort((a,b)=>rank[a.status]-rank[b.status] || (b.receivedDate??"").localeCompare(a.receivedDate??"") || a.sourceName.localeCompare(b.sourceName));
}

/** Uses the same deduplicated, confirmed income rows as the Financing table. */
export function seasonIncomeTotals(view: FinancingView) {
  let received = 0n, outstanding = 0n;
  for (const row of financingIncomeRows(view)) {
    const amount = canonicalNokOre(row.amountNok);
    if (row.status === "received") received += amount;
    else outstanding += amount;
  }
  return {receivedNok: formatOre(received), outstandingNok: formatOre(outstanding), totalNok: formatOre(received + outstanding)};
}
