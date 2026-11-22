import { Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader } from "@libs/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@libs/components/ui/chart";
import { approvedAllocation } from "./budget-dashboard-model";
import { canonicalNokOre, projectBudgetMoney } from "./project-budget-diff";
import { formatOre } from "./money";
import type { DepartmentBudgetPackage } from "./department-budget-types";
import type { PublicBudgets, PublicDepartmentBudget } from "./types";

const chartConfig = {
  spent: { label: "Recorded spending", color: "var(--chart-2)" },
  remaining: { label: "Remaining budget", color: "var(--muted)" },
} satisfies ChartConfig;
const money = (ore: bigint) => projectBudgetMoney(formatOre(ore));

export function DepartmentBudgetChart({ department, budgetStatus, seasonCode, pendingPackage }: {
  department: PublicDepartmentBudget;
  budgetStatus: PublicBudgets["budgetStatus"];
  seasonCode: string | null;
  pendingPackage?: DepartmentBudgetPackage;
}) {
  const approved = approvedAllocation(department, budgetStatus), spent = canonicalNokOre(department.actualNok);
  const remaining = approved - spent;
  const percentage = approved > 0n ? new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(Number((spent * 1000n + approved / 2n) / approved) / 10) : null;
  const pending = pendingPackage?.status === "finance_pending" && pendingPackage.snapshot.departmentKey === department.departmentKey && pendingPackage.snapshot.seasonCode === seasonCode ? pendingPackage : undefined;
  // The ring measures usage of the approved allocation; actual overages stay visible in the totals.
  const data = [
    { name: "spent", amount: Number(approved > 0n && spent > approved ? approved : spent), exactNok: formatOre(spent), fill: remaining < 0n ? "var(--destructive)" : "var(--color-spent)" },
    { name: "remaining", amount: Number(remaining > 0n ? remaining : 0n), exactNok: formatOre(remaining > 0n ? remaining : 0n), fill: "var(--color-remaining)" },
  ];
  const description = `Approved department budget ${money(approved)}. Recorded spending ${money(spent)}. ${remaining < 0n ? "Over budget" : "Remaining"} ${money(remaining < 0n ? -remaining : remaining)}.${pending ? ` Requested department budget ${projectBudgetMoney(pending.snapshot.proposedTotalNok)}, net change ${projectBudgetMoney(pending.snapshot.deltaNok)}. Pending changes are excluded from the approved budget.` : ""}`;
  return <Card size="sm" className="gap-1">
    <CardHeader><h2 className="text-base font-medium">Department budget overview</h2></CardHeader>
    <CardContent>
      <div className="grid items-center gap-4 sm:grid-cols-[144px_minmax(0,1fr)]">
        {approved > 0n || spent > 0n ? <div className="relative mx-auto size-36">
          <ChartContainer config={chartConfig} className="size-full aspect-square">
            <PieChart accessibilityLayer={false} role="img" title={`${department.name} department budget overview`} desc={description}>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(_value, name, entry) => <div className="flex w-full justify-between gap-5"><span className="text-muted-foreground">{chartConfig[String(name) as keyof typeof chartConfig].label}</span><span className="font-medium tabular-nums">{projectBudgetMoney(entry.payload.exactNok)}</span></div>} />} />
              <Pie rootTabIndex={-1} data={data} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={64} startAngle={90} endAngle={-270} strokeWidth={0} isAnimationActive={false} />
            </PieChart>
          </ChartContainer>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold tabular-nums">{percentage === null ? "—" : `${percentage}%`}</span><span className="mt-1 text-xs text-muted-foreground">{percentage === null ? "No approved budget" : "spent"}</span></div>
        </div> : <p className="text-sm text-muted-foreground">The overview will appear when a budget or purchase is recorded.</p>}
        <div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-sm text-muted-foreground">Approved department budget</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{money(approved)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Recorded spending</dt><dd className="mt-1 text-lg font-medium tabular-nums">{money(spent)}</dd></div>
            <div><dt className={remaining < 0n ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{remaining < 0n ? "Over budget" : "Remaining budget"}</dt><dd className={`mt-1 text-lg font-medium tabular-nums${remaining < 0n ? " text-destructive" : ""}`}>{money(remaining < 0n ? -remaining : remaining)}</dd></div>
          </dl>
          <p className={percentage !== null ? "sr-only" : "mt-2 text-sm text-muted-foreground"}>{percentage !== null ? `${percentage}% of the approved department budget spent.` : "No approved allocation yet."}</p>
        </div>
      </div>
      {pending ? <div className="space-y-1 border-t pt-3"><div className="flex flex-wrap items-baseline justify-between gap-3 text-sm"><p><span className="text-muted-foreground">Requested department budget </span><span className="font-medium tabular-nums">{projectBudgetMoney(pending.snapshot.proposedTotalNok)}</span></p><p><span className="text-muted-foreground">Net change </span><span className="font-semibold tabular-nums">{canonicalNokOre(pending.snapshot.deltaNok) > 0n ? "+ " : ""}{projectBudgetMoney(pending.snapshot.deltaNok)}</span></p></div><p className="text-xs text-muted-foreground">Awaiting Finance approval. The chart uses the current approved budget.</p></div> : null}
    </CardContent>
  </Card>;
}
