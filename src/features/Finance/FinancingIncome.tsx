import { Link } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import { Card, CardContent, CardHeader } from "@libs/components/ui/card";
import { Skeleton } from "@libs/components/ui/skeleton";
import { financeFundingPath } from "./routes";
import { projectBudgetMoney } from "./project-budget-diff";
import { financingIncomeRows, type IncomeStatus } from "./financing-income-model";
import type { FinancingView } from "./types";

const labels: Record<IncomeStatus, string> = {
  received: "Received",
  waiting_on_payment: "Invoice sent",
  invoice_not_sent: "Ready to invoice",
  awaiting_payment: "Awaiting payment",
};

const statusColors: Partial<Record<IncomeStatus, string>> = {
  received: "bg-[var(--success)] text-[var(--success-foreground)]",
  waiting_on_payment: "bg-[var(--warning)] text-[var(--warning-foreground)]",
  awaiting_payment: "bg-[var(--warning)] text-[var(--warning-foreground)]",
};

const receivedDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function FinancingIncome({ financing, canManage = false }: { financing: FinancingView | null; canManage?: boolean }) {
  const rows = financing ? financingIncomeRows(financing) : [];
  return <section aria-labelledby="financing-income-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="financing-income-title" className="text-xl font-medium">Financing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Received income, won deals and approved grants.</p>
      </div>
      {canManage && <Button asChild variant="outline" size="sm"><Link to={financeFundingPath}>Manage financing</Link></Button>}
    </div>
    {!financing ? <Skeleton aria-label="Loading financing entries" className="h-48 rounded-xl" /> : !rows.length
      ? <p className="text-sm text-muted-foreground">No received income, won deals or approved grants for this season yet.</p>
      : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(row => <Card key={row.id} role="article" size="sm" className="min-w-0 gap-3">
          <CardHeader className="min-w-0">
            <h3 className="break-words text-sm font-medium">
              {row.dealId
                ? <Link className="hover:underline focus-visible:underline" to={`/partner-deals?deal=${encodeURIComponent(row.dealId)}`}>{row.title || row.sourceName}</Link>
                : row.title || row.sourceName}
            </h3>
            {row.title && row.title !== row.sourceName && <p className="break-words text-xs text-muted-foreground">{row.sourceName}</p>}
          </CardHeader>
          <CardContent className="mt-auto">
            <p className="text-base font-medium tabular-nums">{projectBudgetMoney(row.amountNok)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={statusColors[row.status]}>{labels[row.status]}</Badge>
              {row.receivedDate && <time className="text-xs text-muted-foreground" dateTime={row.receivedDate}>
                {receivedDate.format(new Date(`${row.receivedDate}T12:00:00Z`))}
              </time>}
            </div>
          </CardContent>
        </Card>)}
      </div>}
  </section>;
}
