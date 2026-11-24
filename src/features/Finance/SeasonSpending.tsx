import { Card, CardContent } from "@libs/components/ui/card";
import { Skeleton } from "@libs/components/ui/skeleton";
import { canonicalNokOre, projectBudgetMoney } from "./project-budget-diff";
import { formatOre } from "./money";
import { seasonIncomeTotals } from "./financing-income-model";
import type { FinancePurchaseSummary, FinancingView } from "./types";

/** Recorded cost is counted once, even when invoice and reimbursement obligations coexist. */
export function seasonSpendingTotals(purchases: readonly FinancePurchaseSummary[]) {
  let total = 0n, paid = 0n, unpaidInvoices = 0n;
  for (const purchase of purchases) if (purchase.status === "registered") {
    const amount = canonicalNokOre(purchase.totalNok);
    total += amount;
    if (!purchase.unpaid) paid += amount;
    if (purchase.paymentMethod === "invoice" && purchase.invoice?.paid === false) unpaidInvoices += amount;
  }
  return { unpaidNok: formatOre(total - paid), paidNok: formatOre(paid), unpaidInvoicesNok: formatOre(unpaidInvoices), totalNok: formatOre(total) };
}

function SummaryRows({rows}: {rows: {label: string; amount: string; note?: string; total?: boolean}[]}) {
  return <dl className="flex flex-1 flex-col gap-4">
    {rows.map(row => <div key={row.label} className={`flex items-baseline justify-between gap-4 ${row.total ? "mt-auto border-t pt-4" : ""}`}>
      <dt className="text-sm text-muted-foreground">{row.label}{row.note && <span className="mt-0.5 block text-xs">{row.note}</span>}</dt>
      <dd className="whitespace-nowrap text-lg font-semibold tabular-nums sm:text-xl">{projectBudgetMoney(row.amount)}</dd>
    </div>)}
  </dl>;
}

export function SeasonFinanceSummary({financing, purchases}: {
  /** Undefined means no access; null means still loading. */
  financing?: FinancingView | null;
  purchases?: readonly FinancePurchaseSummary[] | null;
}) {
  const income = financing ? seasonIncomeTotals(financing) : null;
  const spend = purchases ? seasonSpendingTotals(purchases) : null;
  const both = financing !== undefined && purchases !== undefined;
  return <Card aria-label="Season income and spend" className="@container w-full">
    <CardContent className={`grid gap-6 ${both ? "@min-[50rem]:grid-cols-2 @min-[50rem]:gap-8" : ""}`}>
      {financing !== undefined && <section aria-labelledby="season-income-summary-title" className="flex min-w-0 flex-col gap-5">
        <h2 id="season-income-summary-title" className="text-base font-medium">Season Income</h2>
        {income ? <SummaryRows rows={[
          {label:"Received",amount:income.receivedNok},
          {label:"Outstanding",amount:income.outstandingNok},
          {label:"Total",amount:income.totalNok,total:true},
        ]}/> : <Skeleton aria-label="Loading season income totals" className="h-40 rounded-md"/>}
      </section>}
      {purchases !== undefined && <section aria-labelledby="season-spend-summary-title" className={`flex min-w-0 flex-col gap-5 ${both ? "border-t pt-6 @min-[50rem]:border-t-0 @min-[50rem]:border-l @min-[50rem]:pt-0 @min-[50rem]:pl-8" : ""}`}>
        <h2 id="season-spend-summary-title" className="text-base font-medium">Season Spend</h2>
        {spend ? <SummaryRows rows={[
          {label:"Paid",amount:spend.paidNok},
          {label:"Unpaid",amount:spend.unpaidNok},
          {label:"Total",amount:spend.totalNok,total:true},
        ]}/> : <Skeleton aria-label="Loading season spend totals" className="h-40 rounded-md"/>}
      </section>}
    </CardContent>
  </Card>;
}
