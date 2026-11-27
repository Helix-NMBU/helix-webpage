import { BudgetRing, budgetUsage } from "../Finance/BudgetRing";
import { IconChevronDown } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@libs/components/ui/tooltip";
import { CvRequestError } from "../MemberCV/repository";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { financeRoutes } from "../Finance/routes";
import { getDepartmentIcon } from "../Workspace/department-icons";
import { hasVisibleApprovedFinances, nokToOre } from "../Finance/finance-calculations";
import { budgetPlanLabel } from "../Finance/budget-plan-label";
import { loadSeasonFinancialSummary, SeasonFinancialRequestError } from "./season-financials-repository";
import type { SeasonFinancialDepartment, SeasonFinancialSummary, SeasonFinancialSystem, SeasonMoneyFlow } from "./season-financials-types";

// Format canonical decimal strings without converting large values to a floating-point number.
function money(value: string): string {
  const [whole, fraction = "00"] = value.split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction.padEnd(2, "0")}`;
}

function snapshotDate(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(date);
  return `${parts.find(part => part.type === "day")?.value}. ${parts.find(part => part.type === "month")?.value}`;
}

function SpendingComparison({ item }: { item: SeasonFinancialDepartment | SeasonFinancialSystem }) {
  const spent = money(item.actualNok);
  const allocated = money(item.plannedNok);
  const percent = budgetUsage(item.actualNok, item.plannedNok);
  const over = nokToOre(item.actualNok) > nokToOre(item.plannedNok);
  const unbudgeted = nokToOre(item.unbudgetedNok) > 0n ? money(item.unbudgetedNok) : null;
  const value = `${spent} spent of ${allocated} allocated${over ? ", over budget" : ""}${unbudgeted ? `, ${unbudgeted} unbudgeted` : ""}`;

  return <div className="min-w-0 space-y-1 text-right text-xs tabular-nums [overflow-wrap:anywhere]">
    <div aria-hidden="true" className="text-muted-foreground">{spent} / {allocated}</div>
    <div role="progressbar" aria-label={item.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={value} className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percent}%` }} />
    </div>
    {(over || unbudgeted) && <div aria-hidden="true" className="flex flex-wrap justify-end gap-x-2 text-muted-foreground">
      {over && <span className="text-destructive">Over budget</span>}
      {unbudgeted && <span>Unbudgeted {unbudgeted}</span>}
    </div>}
  </div>;
}

function DepartmentRow({ department }: { department: SeasonFinancialDepartment }) {
  const Icon = getDepartmentIcon(department.name);
  const name = <><Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 [overflow-wrap:anywhere]">{department.name}</span></>;
  const hasSystems = department.systems.length > 0;

  return <Collapsible asChild>
    <li className="min-w-0 py-2">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
        {hasSystems ? <CollapsibleTrigger asChild>
          <Button variant="ghost" aria-label={`${department.name} systems`} className="h-auto min-h-9 min-w-0 justify-start gap-2 px-1 text-left font-normal whitespace-normal">
            {name}
            <IconChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-data-[state=open]/button:rotate-180" />
          </Button>
        </CollapsibleTrigger> : <div className="flex min-w-0 items-center gap-2 px-1 text-sm">{name}</div>}
        <SpendingComparison item={department} />
      </div>
      {hasSystems && <CollapsibleContent className="mt-2 rounded-lg bg-muted/40 px-3 py-1">
        <ul className="divide-y">
          {department.systems.map(system => <li key={system.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 py-2">
            <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
              {system.name}
              {!system.active && <div className="text-xs text-muted-foreground">Inactive</div>}
            </div>
            <SpendingComparison item={system} />
          </li>)}
        </ul>
      </CollapsibleContent>}
    </li>
  </Collapsible>;
}

function MonthlyMoneyChart({ flow }: { flow: Extract<SeasonMoneyFlow, { status: "available" }> }) {
  const maximum = flow.months.reduce((max, month) => {
    const input = nokToOre(month.moneyInNok), output = nokToOre(month.moneyOutNok);
    return input > max ? (input > output ? input : output) : (output > max ? output : max);
  }, 0n);
  return <TooltipProvider><div className="space-y-3">
    <div className="flex h-36 items-end gap-1 sm:gap-2" aria-label="Monthly income and spend">
      {flow.months.map(item => {
        const date = new Date(`${item.month}-01T12:00:00Z`);
        const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
        const label = `${month} ${item.month.slice(0, 4)}: Sponsor cash received ${money(item.moneyInNok)}, Money out ${money(item.moneyOutNok)}`;
        const height = (value: string) => maximum === 0n ? 0 : Number(nokToOre(value) * 10000n / maximum) / 100;
        return <Tooltip key={item.month}><TooltipTrigger asChild><button type="button" aria-label={label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"><span className="flex w-full flex-1 items-end justify-center gap-0.5" aria-hidden="true"><span className="w-2 max-w-[38%] rounded-t-sm bg-primary sm:w-3" style={{ height: `${height(item.moneyInNok)}%` }} /><span className="w-2 max-w-[38%] rounded-t-sm bg-muted-foreground sm:w-3" style={{ height: `${height(item.moneyOutNok)}%` }} /></span><span className="text-[10px] text-muted-foreground sm:text-xs">{month}</span></button></TooltipTrigger><TooltipContent><div><p className="font-medium">{month} {item.month.slice(0, 4)}</p><p>Sponsor cash received: {money(item.moneyInNok)}</p><p>Money out: {money(item.moneyOutNok)}</p></div></TooltipContent></Tooltip>;
      })}
    </div>
    {(nokToOre(flow.otherInNok) > 0n || nokToOre(flow.otherOutNok) > 0n) && <p className="text-xs text-muted-foreground">Outside September–July or undated: {money(flow.otherInNok)} received and {money(flow.otherOutNok)} out.</p>}
  </div></TooltipProvider>;
}

export function SeasonFinancialWidgets({ season, userId, load = loadSeasonFinancialSummary }: { season: string; userId: string; load?: typeof loadSeasonFinancialSummary }) {
  const [summary, setSummary] = useState<SeasonFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const owner = useRef<string | null>(userId);
  const generation = useRef(0);
  const inFlight = useRef<number | null>(null);
  const active = useRef(false);
  const pending = useRef<{ controller: AbortController; timer: number } | null>(null);
  const notify = useNotify();
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    if (inFlight.current !== null) return;
    const request = ++generation.current;
    inFlight.current = request;
    const controller = new AbortController();
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new SeasonFinancialRequestError("The financial overview took too long to load. Please try again.", 503));
        controller.abort();
      }, 15_000);
    });
    pending.current = { controller, timer };
    try {
      const result = await Promise.race([load(owner, controller.signal), timeout]);
      if (!active.current || request !== generation.current) return;
      setSummary(result); setStale(false);
      if (result.moneyFlow.status === "unavailable") notify("Could not load income and spend", "Please try again.", { id: "season-money-flow-load", variant: "error", href: null, action: { label: "Try again", onClick: () => void refresh() } });
      if (result.bank.status === "unavailable") notify("Could not load bank balance", "Please try again.", { id: "season-bank-load", variant: "error", href: null, action: { label: "Try again", onClick: () => void refresh() } });
    } catch (error) {
      if (!active.current || request !== generation.current) return;
      const status = error instanceof SeasonFinancialRequestError || error instanceof CvRequestError ? error.status : null;
      const denied = status === 401 || status === 403;
      if (denied) { setSummary(null); setStale(false); } else setStale(true);
      notify("Could not load financial overview", error instanceof Error ? error.message : "Please try again.", { id: "season-financial-load", variant: "error", href: null, action: status === 401 ? { label: "Sign in", onClick: () => navigate("/login") } : { label: "Try again", onClick: () => void refresh() } });
    } finally {
      window.clearTimeout(timer);
      if (pending.current?.controller === controller) pending.current = null;
      if (inFlight.current === request) inFlight.current = null;
      if (active.current && request === generation.current) setLoading(false);
    }
  }, [load, navigate, notify]);
  useEffect(() => {
    owner.current = userId; active.current = true; setSummary(null); setLoading(true); setStale(false); void refresh();
    const onFocus = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(onVisibility, 60_000);
    return () => { active.current = false; generation.current++; inFlight.current = null; if (pending.current) { window.clearTimeout(pending.current.timer); pending.current.controller.abort(); pending.current = null; } window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [userId, refresh]);
  const mismatch = !!summary?.seasonCode && summary.seasonCode !== season;
  const effectiveFinances = summary && hasVisibleApprovedFinances(summary);
  const hasApprovedPlan = summary && (summary.budgetStatus === "approved" || summary.approvedPresence?.legacyBudget || summary.approvedPresence?.projectBudgets);
  const visible = summary && !mismatch && (effectiveFinances || summary.budgetStatus === "draft");
  const budgetDetail = mismatch ? `Finance is set to ${summary.seasonCode}, not ${season}.` : effectiveFinances ? budgetPlanLabel({ ...summary, approvedOn: null }) : summary?.budgetStatus === "draft-hidden" ? "Draft budget is restricted." : summary?.budgetStatus === "absent" ? "No season budget yet." : summary?.budgetStatus === "draft" ? "Draft budget" : "Approved budget";
  const budgetDisplay = stale && summary?.budgetStatus === "absent" && !effectiveFinances && !mismatch ? "Last checked: no season budget." : budgetDetail;
  const bank = summary?.bank;
  const snapshot = bank?.status === "available" ? bank.snapshot : null;
  const flow = summary?.moneyFlow;
  const flowVisible = summary?.seasonCode === season && flow?.status === "available";
  const flowNote = mismatch ? `${stale ? "Last checked: finance was" : "Finance is"} set to ${summary.seasonCode}, not ${season}.` : flow?.status === "no-season" || (summary && !summary.seasonCode) ? (stale ? "Last checked: no finance season configured." : "No finance season configured.") : flow?.status === "unavailable" || !summary ? "Income and Spend unavailable." : stale ? "Last loaded values." : `Recorded for ${season}.`;
  return <section className="space-y-4" aria-labelledby="season-financial-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="season-financial-title" className="text-lg font-medium">Finances</h2><p className="text-sm text-muted-foreground">Planned costs, recorded spending and money in the bank.</p></div>{summary?.canOpenFinancials && <Button asChild variant="outline" size="sm"><Link to={financeRoutes.overview}>Open Financials</Link></Button>}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <Card role="group" aria-label="Income and Spend" className="gap-2 py-5"><div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5"><CardHeader className="min-w-40 flex-1 px-0"><CardTitle className="text-base font-medium">Income and Spend</CardTitle><CardDescription>{flowNote}</CardDescription></CardHeader>
        <dl className="ml-auto grid justify-end gap-1 tabular-nums">
          <div className="flex flex-wrap items-baseline justify-end gap-x-3"><dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />In</dt><dd className="text-2xl font-medium sm:text-3xl">{loading && !summary ? <Skeleton className="h-9 w-32" /> : flowVisible ? money(flow.moneyInNok) : "—"}</dd></div>
          <div className="flex flex-wrap items-baseline justify-end gap-x-3"><dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground" />Out</dt><dd className="text-2xl font-medium sm:text-3xl">{loading && !summary ? <Skeleton className="h-9 w-32" /> : flowVisible ? money(flow.moneyOutNok) : "—"}</dd></div>
        </dl></div><CardContent className="space-y-3 px-5">
        {flowVisible && <>
          {flow.agreedSponsorCashNok !== undefined && <p className="text-sm text-muted-foreground">Agreed sponsor cash: <span className="tabular-nums">{money(flow.agreedSponsorCashNok)}</span></p>}
          <MonthlyMoneyChart flow={flow} />
        </>}
        <p className="text-xs text-muted-foreground">Money in uses the date each sponsor payment was received. Money out uses the date of each registered purchase.</p>
      </CardContent></Card>
      <Card className="min-h-56 gap-2 py-5"><CardHeader className="px-5"><CardTitle className="text-base font-medium">Bank balance</CardTitle><CardDescription>{snapshot ? <span>As of <time dateTime={snapshot.asOfDate}>{snapshotDate(snapshot.asOfDate)}</time>{stale ? " · Last loaded value" : ""}</span> : bank?.status === "available" ? stale ? "Last checked: no balance entered." : "No balance entered yet." : "Balance unavailable."}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col justify-end px-5">
        <CardTitle className="self-end break-words text-right text-[clamp(1.5rem,3vw,3rem)] font-medium tabular-nums">{loading && !summary ? <Skeleton className="h-12 w-48" /> : snapshot ? money(snapshot.amountNok) : "—"}</CardTitle>
      </CardContent></Card>
      <Card className="gap-4 py-5 md:col-span-2"><CardContent className="space-y-4 px-5">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-8">
          <div className="flex flex-col gap-4">
            <CardHeader className="px-0"><CardTitle className="text-base font-medium">Budget and spending</CardTitle><CardDescription>Season and department spending against allocated budgets.</CardDescription></CardHeader>
            {(!summary || !hasApprovedPlan || summary.approvedPresence?.projectBudgets || mismatch || stale) && <p className="text-sm text-muted-foreground">{summary ? (stale && visible ? "Last loaded values." : budgetDisplay) : "Unavailable"}{stale && summary && !visible && (summary.budgetStatus !== "absent" || mismatch) ? " · Last loaded value" : ""}</p>}
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="flex flex-col items-center gap-5">
                {visible && summary.plannedNok !== null && summary.actualNok !== null && <BudgetRing planned={summary.plannedNok} actual={summary.actualNok} />}
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3 tabular-nums"><div><dt className="text-sm text-muted-foreground">Season budget</dt><dd className="text-xl font-medium">{loading && !summary ? <Skeleton className="h-7 w-24" /> : visible && summary.plannedNok !== null ? money(summary.plannedNok) : "—"}</dd></div><div><dt className="text-sm text-muted-foreground">Recorded spending</dt><dd className="text-xl font-medium">{loading && !summary ? <Skeleton className="h-7 w-24" /> : visible && summary.actualNok !== null ? money(summary.actualNok) : "—"}</dd></div></dl>
              </div>
              {visible && summary.plannedNok !== null && summary.actualNok !== null && nokToOre(summary.actualNok) > nokToOre(summary.plannedNok) && <p className="text-xs text-destructive">Over budget</p>}
              <p className="text-xs text-muted-foreground">Includes unpaid invoices.</p>
            </div>
          </div>
          {visible && <><div aria-hidden="true" className="h-px bg-border md:my-3 md:h-auto md:w-px" /><div className="space-y-3">{stale && <p className="text-xs text-muted-foreground">Last loaded values.</p>}{summary.departments.length ? <ul>{summary.departments.map(department => <DepartmentRow key={department.departmentKey} department={department} />)}</ul> : <p className="text-sm text-muted-foreground">No departments to show.</p>}</div></>}
        </div>
      </CardContent></Card>
    </div>
  </section>;
}
