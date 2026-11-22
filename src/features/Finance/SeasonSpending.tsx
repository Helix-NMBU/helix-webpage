import { Card, CardContent, CardHeader, CardTitle } from "@libs/components/ui/card";
import { canonicalNokOre, projectBudgetMoney } from "./project-budget-diff";
import { formatOre } from "./money";
import type { FinancePurchaseSummary } from "./types";

/** Recorded cost is counted once, even when invoice and reimbursement obligations coexist. */
export function seasonSpendingTotals(purchases: readonly FinancePurchaseSummary[]) {
  let total = 0n, paid = 0n;
  for (const purchase of purchases) if (purchase.status === "registered") {
    const amount = canonicalNokOre(purchase.totalNok);
    total += amount;
    if (!purchase.unpaid) paid += amount;
  }
  return { paidNok: formatOre(paid), totalNok: formatOre(total) };
}
export function SeasonSpending({ purchases }: { purchases: FinancePurchaseSummary[] }) {
  const totals = seasonSpendingTotals(purchases);
  return <Card size="sm" aria-label="Season spending" className="@container w-full shrink-0 xl:w-[30rem]"><CardHeader><CardTitle>Season spending</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-4 @min-[26rem]:grid-cols-2 @min-[26rem]:gap-6">
    <div><p className="text-sm text-muted-foreground">Paid</p><p className="mt-1 whitespace-nowrap text-xl font-semibold tabular-nums">{projectBudgetMoney(totals.paidNok)}</p></div>
    <div><p className="text-sm text-muted-foreground">Paid + unpaid</p><p className="mt-1 whitespace-nowrap text-xl font-semibold tabular-nums">{projectBudgetMoney(totals.totalNok)}</p></div>
  </CardContent></Card>;
}
