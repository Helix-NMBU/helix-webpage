import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@libs/components/ui/tooltip";
import { CvRequestError } from "../MemberCV/repository";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { financeRoutes } from "../Finance/routes";
import { getDepartmentIcon } from "../Workspace/department-icons";
import { nokToOre } from "../Finance/finance-calculations";
import { loadSeasonFinancialSummary, SeasonFinancialRequestError } from "./season-financials-repository";
import type { SeasonFinancialDepartment, SeasonFinancialSummary, SeasonMoneyFlow } from "./season-financials-types";

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

function usage(actual: string, planned: string): number {
  const a = nokToOre(actual), p = nokToOre(planned);
  if (p <= 0n) return a > 0n ? 100 : 0;
  return Number(a >= p ? 100n : a <= 0n ? 0n : a * 100n / p);
}

function BudgetRing({ planned, actual }: { planned: string; actual: string }) {
  const planOre = nokToOre(planned), actualOre = nokToOre(actual);
  const over = actualOre > planOre;
  const percent = usage(actual, planned);
  const label = planOre === 0n ? (over ? "Over" : "—") : over ? "Over" : `${percent}%`;
  const details = `Recorded spending ${money(actual)} of budget ${money(planned)}${over ? ", over budget" : planOre === 0n ? ", percentage unavailable for a zero budget" : `, ${percent}% used`}`;
  return <div role="img" aria-label={details} className="relative grid size-32 shrink-0 place-items-center sm:size-40">
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" pathLength="100" strokeDasharray={`${percent} 100`} className={over ? "text-destructive" : "text-primary"} />
    </svg><span className="text-lg font-medium tabular-nums" aria-hidden="true">{label}</span>
  </div>;
}

function DepartmentRow({ department }: { department: SeasonFinancialDepartment }) {
  const Icon = getDepartmentIcon(department.name);
  const percent = usage(department.actualNok, department.plannedNok);
  const over = nokToOre(department.actualNok) > nokToOre(department.plannedNok);
  const label = `${department.name}: ${money(department.actualNok)} spent of ${money(department.plannedNok)} allocated${over ? ", over budget" : ""}${nokToOre(department.unbudgetedNok) > 0n ? `, ${money(department.unbudgetedNok)} unbudgeted` : ""}`;
  return <li className="grid grid-cols-[minmax(0,1fr)_minmax(4rem,1fr)] items-center gap-4 py-2">
    <div className="flex min-w-0 items-center gap-2 text-sm"><Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span>{department.name}</span></div>
    <div className="min-w-0 space-y-1"><div aria-hidden="true" className="text-right text-xs tabular-nums text-muted-foreground">{money(department.actualNok)} / {money(department.plannedNok)}</div><div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={label} title={label} className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percent}%` }} /></div></div>
  </li>;
}

function MonthlyMoneyChart({ flow }: { flow: Extract<SeasonMoneyFlow, { status: "available" }> }) {
  const maximum = flow.months.reduce((max, month) => {
    const input = nokToOre(month.moneyInNok), output = nokToOre(month.moneyOutNok);
    return input > max ? (input > output ? input : output) : (output > max ? output : max);
  }, 0n);
  return <TooltipProvider><div className="space-y-3">
    <div className="flex h-36 items-end gap-1 sm:gap-2" aria-label="Monthly money in and out">
      {flow.months.map(item => {
        const date = new Date(`${item.month}-01T12:00:00Z`);
        const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
        const label = `${month} ${item.month.slice(0, 4)}: Money in ${money(item.moneyInNok)}, money out ${money(item.moneyOutNok)}`;
        const height = (value: string) => maximum === 0n ? 0 : Number(nokToOre(value) * 10000n / maximum) / 100;
        return <Tooltip key={item.month}><TooltipTrigger asChild><button type="button" aria-label={label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"><span className="flex w-full flex-1 items-end justify-center gap-0.5" aria-hidden="true"><span className="w-2 max-w-[38%] rounded-t-sm bg-primary sm:w-3" style={{ height: `${height(item.moneyInNok)}%` }} /><span className="w-2 max-w-[38%] rounded-t-sm bg-muted-foreground sm:w-3" style={{ height: `${height(item.moneyOutNok)}%` }} /></span><span className="text-[10px] text-muted-foreground sm:text-xs">{month}</span></button></TooltipTrigger><TooltipContent><div><p className="font-medium">{month} {item.month.slice(0, 4)}</p><p>Money in: {money(item.moneyInNok)}</p><p>Money out: {money(item.moneyOutNok)}</p></div></TooltipContent></Tooltip>;
      })}
    </div>
    {(nokToOre(flow.otherInNok) > 0n || nokToOre(flow.otherOutNok) > 0n) && <p className="text-xs text-muted-foreground">Totals include amounts outside September–July or without a date: {money(flow.otherInNok)} in and {money(flow.otherOutNok)} out.</p>}
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
      if (result.moneyFlow.status === "unavailable") notify("Could not load money in and out", "Please try again.", { id: "season-money-flow-load", variant: "error", href: null, action: { label: "Try again", onClick: () => void refresh() } });
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
  const visible = summary && !mismatch && (summary.budgetStatus === "approved" || summary.budgetStatus === "draft");
  const budgetDetail = mismatch ? `Finance is set to ${summary.seasonCode}, not ${season}.` : summary?.budgetStatus === "draft-hidden" ? "Draft budget is restricted." : summary?.budgetStatus === "absent" ? "No season budget yet." : summary?.budgetStatus === "draft" ? "Draft budget" : "Approved budget";
  const budgetDisplay = stale && summary?.budgetStatus === "absent" && !mismatch ? "Last checked: no season budget." : budgetDetail;
  const bank = summary?.bank;
  const snapshot = bank?.status === "available" ? bank.snapshot : null;
  const flow = summary?.moneyFlow;
  const flowVisible = summary?.seasonCode === season && flow?.status === "available";
  const flowNote = mismatch ? `${stale ? "Last checked: finance was" : "Finance is"} set to ${summary.seasonCode}, not ${season}.` : flow?.status === "no-season" || (summary && !summary.seasonCode) ? (stale ? "Last checked: no finance season configured." : "No finance season configured.") : flow?.status === "unavailable" || !summary ? "Money in and out unavailable." : stale ? "Last loaded values." : `Recorded for ${season}.`;
  return <section className="space-y-4" aria-labelledby="season-financial-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="season-financial-title" className="text-lg font-medium">Finances</h2><p className="text-sm text-muted-foreground">Planned costs, recorded spending and money in the bank.</p></div>{summary?.canOpenFinancials && <Button asChild variant="outline" size="sm"><Link to={financeRoutes.overview}>Open Financials</Link></Button>}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <Card role="group" aria-label="Money in and out" className="gap-2 py-5"><div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5"><CardHeader className="min-w-40 flex-1 px-0"><CardTitle className="text-base font-medium">Money in and out</CardTitle><CardDescription>{flowNote}</CardDescription></CardHeader>
        <dl className="ml-auto grid justify-end gap-1 tabular-nums">
          <div className="flex flex-wrap items-baseline justify-end gap-x-3"><dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />In</dt><dd className="text-2xl font-medium sm:text-3xl">{loading && !summary ? <Skeleton className="h-9 w-32" /> : flowVisible ? money(flow.moneyInNok) : "—"}</dd></div>
          <div className="flex flex-wrap items-baseline justify-end gap-x-3"><dt className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground" />Out</dt><dd className="text-2xl font-medium sm:text-3xl">{loading && !summary ? <Skeleton className="h-9 w-32" /> : flowVisible ? money(flow.moneyOutNok) : "—"}</dd></div>
        </dl></div><CardContent className="space-y-3 px-5">
        {flowVisible && <MonthlyMoneyChart flow={flow} />}
        <p className="sr-only">Money in is sponsor cash marked received. Money out includes paid invoices, reimbursed outlays and team-account receipts treated as paid from purchase records. These recorded amounts are not bank-reconciled.</p>
      </CardContent></Card>
      <Card className="min-h-56 gap-2 py-5"><CardHeader className="px-5"><CardTitle className="text-base font-medium">Bank balance</CardTitle><CardDescription>{snapshot ? <span>As of <time dateTime={snapshot.asOfDate}>{snapshotDate(snapshot.asOfDate)}</time>{stale ? " · Last loaded value" : ""}</span> : bank?.status === "available" ? stale ? "Last checked: no balance entered." : "No balance entered yet." : "Balance unavailable."}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col justify-end px-5">
        <CardTitle className="self-end break-words text-right text-[clamp(1.5rem,3vw,3rem)] font-medium tabular-nums">{loading && !summary ? <Skeleton className="h-12 w-48" /> : snapshot ? money(snapshot.amountNok) : "—"}</CardTitle>
      </CardContent></Card>
      <Card className="gap-4 py-5 md:col-span-2"><CardContent className="space-y-4 px-5">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-8">
          <div className="flex flex-col gap-4">
            <CardHeader className="px-0"><CardTitle className="text-base font-medium">Budget and spending</CardTitle><CardDescription>Season and department spending against allocated budgets.</CardDescription></CardHeader>
            {(!summary || summary.budgetStatus !== "approved" || mismatch || stale) && <p className="text-sm text-muted-foreground">{summary ? (summary.budgetStatus === "approved" && !mismatch ? "Last loaded values." : budgetDisplay) : "Unavailable"}{stale && summary && summary.budgetStatus !== "approved" && (summary.budgetStatus !== "absent" || mismatch) ? " · Last loaded value" : ""}</p>}
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="flex flex-col items-center gap-5">
                {visible && summary.plannedNok !== null && summary.actualNok !== null && <BudgetRing planned={summary.plannedNok} actual={summary.actualNok} />}
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3 tabular-nums"><div><dt className="text-sm text-muted-foreground">Season budget</dt><dd className="text-xl font-medium">{loading && !summary ? <Skeleton className="h-7 w-24" /> : visible && summary.plannedNok !== null ? money(summary.plannedNok) : "—"}</dd></div><div><dt className="text-sm text-muted-foreground">Recorded spending</dt><dd className="text-xl font-medium">{loading && !summary ? <Skeleton className="h-7 w-24" /> : visible && summary.actualNok !== null ? money(summary.actualNok) : "—"}</dd></div></dl>
              </div>
              {visible && summary.plannedNok !== null && summary.actualNok !== null && nokToOre(summary.actualNok) > nokToOre(summary.plannedNok) && <p className="text-xs text-destructive">Over budget</p>}
              <p className="sr-only">Includes unpaid invoices. This is not cash paid.{stale && summary ? " Last loaded value." : ""}</p>
            </div>
          </div>
          {visible && <><div aria-hidden="true" className="h-px bg-border md:my-3 md:h-auto md:w-px" /><div className="space-y-3">{stale && <p className="text-xs text-muted-foreground">Last loaded values.</p>}{summary.departments.length ? <ul>{summary.departments.map(department => <DepartmentRow key={department.departmentKey} department={department} />)}</ul> : <p className="text-sm text-muted-foreground">No departments to show.</p>}</div></>}
        </div>
      </CardContent></Card>
    </div>
  </section>;
}
