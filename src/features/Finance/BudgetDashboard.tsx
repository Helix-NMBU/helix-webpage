import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@libs/components/ui/badge";
import { Card, CardContent, CardHeader } from "@libs/components/ui/card";
import { Skeleton } from "@libs/components/ui/skeleton";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { BudgetRing } from "./BudgetRing";
import { FinancingIncome } from "./FinancingIncome";
import { SeasonIncomeChart } from "./SeasonIncomeChart";
import { approvedAllocation, approvedDepartmentItems, dashboardDepartments } from "./budget-dashboard-model";
import { formatOre, osloToday } from "./money";
import { canonicalNokOre, projectBudgetMoney } from "./project-budget-diff";
import { departmentBudgetPath } from "./routes";
import { useBudgetReviewSignals } from "./use-budget-review-signals";
import type { PublicBudgets } from "./types";

export function DepartmentBudgetCards({ budgets }: { budgets: PublicBudgets }) {
  const workspace = useWorkspace()?.data;
  const signals = useBudgetReviewSignals();
  const departments = dashboardDepartments(budgets, workspace?.departments.map(department => department.name));
  return <section aria-labelledby="department-budget-cards-title" className="space-y-4">
    <div><h2 id="department-budget-cards-title" className="text-xl font-medium">Department budgets</h2><p className="mt-1 text-sm text-muted-foreground">Approved allocations, recorded spending and changes needing attention.</p></div>
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{departments.map(department => {
      const approved = approvedAllocation(department, budgets.budgetStatus);
      const entries = approvedDepartmentItems(department, budgets.budgetStatus);
      const spent = canonicalNokOre(department.actualNok);
      const pending = signals.data?.queue.packages.filter(packet => packet.status === "finance_pending" && (!budgets.seasonCode || packet.snapshot.seasonCode === budgets.seasonCode) && packet.snapshot.departmentName === department.name) ?? [];
      const candidates = signals.data?.projects.budgets.filter(budget => budget.responsibleDepartmentName === department.name && (!budgets.seasonCode || budget.seasonCode === budgets.seasonCode) && budget.pendingVersionId) ?? [];
      const awaitingApproval = pending.length > 0 || candidates.some(budget => budget.pendingStage === "department_pending" || budget.pendingStage === "finance_pending");
      const label = signals.enabled && !signals.loading && !signals.data ? "Change status unavailable" : awaitingApproval ? "Changes requested" : entries.length ? null : candidates.length ? "Draft" : "No approved budget";
      return <Link key={department.departmentKey} to={departmentBudgetPath(department.name)} aria-label={`Open ${department.name} budget`} className="group rounded-xl outline-none transition-shadow hover:ring-1 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring">
        <Card size="sm" className="h-full gap-3 transition-colors group-hover:bg-muted/20">
          <CardHeader className="gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-medium">{department.name}</h3>{label ? <Badge variant="secondary" className={awaitingApproval ? "bg-[var(--warning)] text-[var(--warning-foreground)]" : undefined}>{label}</Badge> : null}</div></CardHeader>
          <CardContent className="gap-0"><div className="flex items-center justify-between gap-4"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Approved budget</p><p className="mt-1 text-xl font-semibold tabular-nums">{projectBudgetMoney(formatOre(approved))}</p><p className="mt-1 text-xs text-muted-foreground">{entries.length} budget {entries.length === 1 ? "entry" : "entries"}</p>
            <dl className="mt-2 grid gap-1 text-xs"><div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">Spent</dt><dd className="font-medium whitespace-nowrap tabular-nums">{projectBudgetMoney(department.actualNok)}</dd></div><div className="flex items-baseline justify-between gap-3"><dt className="text-muted-foreground">{spent > approved ? "Over budget" : "Remaining"}</dt><dd className={`font-medium whitespace-nowrap tabular-nums ${spent > approved ? "text-destructive" : ""}`}>{projectBudgetMoney(formatOre(spent > approved ? spent - approved : approved - spent))}</dd></div></dl>
          </div><BudgetRing compact planned={formatOre(approved)} actual={department.actualNok} /></div></CardContent>
        </Card>
      </Link>;
    })}</div>
    {!departments.length ? <p className="text-sm text-muted-foreground">Department budgets will appear when departments are configured.</p> : null}
  </section>;
}
export function BudgetDashboard() {
  const session = useFinanceAccess();
  // Pipeline edits have their own revision, so re-read forecasts even if Finance's version is unchanged.
  useEffect(() => {
    if (session.access !== "allowed" || !session.capabilities?.financing) return;
    const refresh = () => { if (document.visibilityState !== "hidden") void session.loadPage("financing"); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("helix-workspace-updated", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("helix-workspace-updated", refresh); };
  }, [session.access, session.capabilities?.financing, session.loadPage]);
  const budgets = session.budgets;
  if (!budgets) return <div role="status" aria-label="Loading budget dashboard" className="space-y-6"><Skeleton className="h-96 w-full rounded-xl" /><div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-56 rounded-xl" />)}</div></div>;
  return <div className="space-y-8">
    {session.capabilities?.financing ? !session.financing ? <Skeleton aria-label="Loading season income" className="h-96 rounded-xl" /> : budgets.seasonCode || session.financing.seasonCode ? <SeasonIncomeChart budgets={budgets} financing={session.financing} today={session.today ?? osloToday()} /> : <Card><CardContent><p className="text-sm text-muted-foreground">Season income will appear when a season is configured.</p></CardContent></Card> : null}
    <DepartmentBudgetCards budgets={budgets} />
    {session.capabilities?.financing ? <FinancingIncome financing={session.financing} canManage={Boolean(session.capabilities?.manageFunding)} /> : null}
  </div>;
}
