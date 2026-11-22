import { Link } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { financeFundingPath } from "./routes";
import { Badge } from "@libs/components/ui/badge";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { projectBudgetMoney } from "./project-budget-diff";
import { financingIncomeRows, type IncomeStatus } from "./financing-income-model";
import type { FinancingView } from "./types";

const labels: Record<IncomeStatus,string> = { received: "Received", waiting_on_payment: "Invoice sent", invoice_not_sent: "Ready to invoice", awaiting_payment: "Awaiting payment" };
const date = (value: string | null) => value ? <time dateTime={value}>{new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`))}</time> : "—";
export function FinancingIncome({ financing, canManage = false }: { financing: FinancingView | null; canManage?: boolean }) {
  const rows = financing ? financingIncomeRows(financing) : [];
  return <section aria-labelledby="financing-income-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="financing-income-title" className="text-xl font-medium">Financing</h2><p className="mt-1 text-sm text-muted-foreground">Received income, won deals and approved grants.</p></div>{canManage ? <Button asChild variant="outline" size="sm"><Link to={financeFundingPath}>Manage financing</Link></Button> : null}</div>
    {!financing ? <Skeleton aria-label="Loading financing entries" className="h-48 rounded-xl" /> : !rows.length ? <p className="text-sm text-muted-foreground">No received income, won deals or approved grants for this season yet.</p> : <div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.id}>
      <TableCell className="max-w-sm whitespace-normal"><p className="font-medium">{row.dealId ? <Link className="hover:underline focus-visible:underline" to={`/partner-deals?deal=${encodeURIComponent(row.dealId)}`}>{row.title || row.sourceName}</Link> : row.title || row.sourceName}</p>{row.title && row.title!==row.sourceName ? <p className="mt-1 text-xs text-muted-foreground">{row.sourceName}</p> : null}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{projectBudgetMoney(row.amountNok)}</TableCell>
      <TableCell><Badge variant="secondary" className={row.status==="received"?"bg-[var(--success)] text-[var(--success-foreground)]":(row.status==="waiting_on_payment"||row.status==="awaiting_payment")?"bg-[var(--warning)] text-[var(--warning-foreground)]":undefined}>{labels[row.status]}</Badge></TableCell>
      <TableCell>{date(row.receivedDate)}</TableCell>
    </TableRow>)}</TableBody></Table></div>}
  </section>;
}
