import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Skeleton } from "@libs/components/ui/skeleton";
import { CvRequestError } from "../MemberCV/repository";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { financeRoutes } from "../Finance/routes";
import { nokToOre } from "../Finance/finance-calculations";
import { loadSeasonFinancialSummary, SeasonFinancialRequestError } from "./season-financials-repository";
import type { SeasonFinancialDepartment, SeasonFinancialSummary, SeasonFinancialSystem } from "./season-financials-types";

// Format canonical decimal strings without converting large values to a floating-point number.
function money(value: string): string {
  const [whole, fraction = "00"] = value.split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction.padEnd(2, "0")}`;
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
  return <div role="img" aria-label={details} className="relative grid size-24 shrink-0 place-items-center">
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" pathLength="100" strokeDasharray={`${percent} 100`} className={over ? "text-destructive" : "text-primary"} />
    </svg><span className="text-sm font-medium tabular-nums" aria-hidden="true">{label}</span>
  </div>;
}

function BudgetLine({ item, detail = false }: { item: SeasonFinancialDepartment | SeasonFinancialSystem; detail?: boolean }) {
  const over = nokToOre(item.actualNok) > nokToOre(item.plannedNok);
  const percentage = usage(item.actualNok, item.plannedNok);
  return <div className="space-y-2">
    {detail && <h5 className="font-medium">{item.name}{"active" in item && !item.active ? " · Inactive" : ""}</h5>}
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm tabular-nums"><span>Spent {money(item.actualNok)}</span><span className="text-muted-foreground">Budget {money(item.plannedNok)}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percentage}%` }} /></div>
    {(over || nokToOre(item.unbudgetedNok) > 0n) && <p className="text-xs text-muted-foreground">{over ? "Over budget" : ""}{over && nokToOre(item.unbudgetedNok) > 0n ? " · " : ""}{nokToOre(item.unbudgetedNok) > 0n ? `Unbudgeted ${money(item.unbudgetedNok)}` : ""}</p>}
  </div>;
}

function DepartmentRow({ department }: { department: SeasonFinancialDepartment }) {
  const [open, setOpen] = useState(false);
  const panel = `season-finance-${department.departmentKey}`;
  return <li className="space-y-3 py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{department.name}</h4><Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(value => !value)}>{open ? "Hide systems" : "Show systems"}<span className="sr-only"> for {department.name}</span></Button></div><BudgetLine item={department} />{open && <div id={panel} className="space-y-4 rounded-lg bg-muted/40 p-4">{department.systems.length ? department.systems.map(system => <BudgetLine key={system.id} item={system} detail />) : <p className="text-sm text-muted-foreground">No systems in this department.</p>}</div>}</li>;
}

export function SeasonFinancialWidgets({ season, userId, load = loadSeasonFinancialSummary }: { season: string; userId: string; load?: typeof loadSeasonFinancialSummary }) {
  const [summary, setSummary] = useState<SeasonFinancialSummary | null>(null);
  const [showDepartments, setShowDepartments] = useState(false);
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
  const flowScale = flowVisible ? (nokToOre(flow.moneyInNok) > nokToOre(flow.moneyOutNok) ? flow.moneyInNok : flow.moneyOutNok) : "0.00";
  const flowNote = mismatch ? `${stale ? "Last checked: finance was" : "Finance is"} set to ${summary.seasonCode}, not ${season}.` : flow?.status === "no-season" || (summary && !summary.seasonCode) ? (stale ? "Last checked: no finance season configured." : "No finance season configured.") : flow?.status === "unavailable" || !summary ? "Money in and out unavailable." : stale ? "Last loaded values." : `Recorded for ${season}.`;
  return <section className="space-y-4" aria-labelledby="season-financial-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="season-financial-title" className="text-lg font-medium">Season finances</h2><p className="text-sm text-muted-foreground">Planned costs, recorded spending and money in the bank.</p></div>{summary?.canOpenFinancials && <Button asChild variant="outline" size="sm"><Link to={financeRoutes.overview}>Open Financials</Link></Button>}</div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="text-base font-medium">Season budget and spending</CardTitle><CardDescription>{summary ? budgetDisplay : "Unavailable"}{stale && summary && (summary.budgetStatus !== "absent" || mismatch) ? " · Last loaded value" : ""}</CardDescription></CardHeader><CardContent className="space-y-4 px-5">
        <div className="flex flex-wrap items-center gap-5">
          {visible && summary.plannedNok !== null && summary.actualNok !== null && <BudgetRing planned={summary.plannedNok} actual={summary.actualNok} />}
          <dl className="grid flex-1 grid-cols-2 gap-4 tabular-nums"><div><dt className="text-sm text-muted-foreground">Season budget</dt><dd className="text-xl font-medium">{loading && !summary ? <Skeleton className="h-7 w-24" /> : visible && summary.plannedNok !== null ? money(summary.plannedNok) : "—"}</dd></div><div><dt className="text-sm text-muted-foreground">Recorded spending</dt><dd className="text-xl font-medium">{loading && !summary ? <Skeleton className="h-7 w-24" /> : visible && summary.actualNok !== null ? money(summary.actualNok) : "—"}</dd></div></dl>
        </div>
        {visible && summary.plannedNok !== null && summary.actualNok !== null && nokToOre(summary.actualNok) > nokToOre(summary.plannedNok) && <p className="text-xs text-destructive">Over budget</p>}
        <p className="text-xs text-muted-foreground">Includes unpaid invoices. This is not cash paid.{stale && summary ? " Last loaded value." : ""}</p>
        {visible && <><Button type="button" variant="outline" size="sm" aria-expanded={showDepartments} aria-controls="season-finance-departments" onClick={() => setShowDepartments(value => !value)}>{showDepartments ? "Hide departments" : "Show departments"}</Button>{showDepartments && <div id="season-finance-departments" className="space-y-3 border-t pt-4"><h3 className="font-medium">Spending by department</h3><p className="text-xs text-muted-foreground">{stale ? "Last loaded values. " : ""}Recorded spending compared with the planned budget.</p><ul className="divide-y">{summary.departments.map(department => <DepartmentRow key={department.departmentKey} department={department} />)}</ul></div>}</>}
      </CardContent></Card>
      <Card role="group" aria-label="Money in and out" className="gap-4 py-5"><CardHeader className="px-5"><CardTitle className="text-base font-medium">Money in and out</CardTitle><CardDescription>{flowNote}</CardDescription></CardHeader><CardContent className="space-y-4 px-5">
        <dl className="space-y-3 tabular-nums">
          <div className="space-y-1"><div className="flex flex-wrap justify-between gap-x-3"><dt className="text-sm text-muted-foreground">Money in</dt><dd className="font-medium">{loading && !summary ? <Skeleton className="h-5 w-24" /> : flowVisible ? money(flow.moneyInNok) : "—"}</dd></div>{flowVisible && <div className="h-2 rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${usage(flow.moneyInNok, flowScale)}%` }} /></div>}</div>
          <div className="space-y-1"><div className="flex flex-wrap justify-between gap-x-3"><dt className="text-sm text-muted-foreground">Money out</dt><dd className="font-medium">{loading && !summary ? <Skeleton className="h-5 w-24" /> : flowVisible ? money(flow.moneyOutNok) : "—"}</dd></div>{flowVisible && <div className="h-2 rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-muted-foreground" style={{ width: `${usage(flow.moneyOutNok, flowScale)}%` }} /></div>}</div>
        </dl>
        <p className="text-xs text-muted-foreground">Money in is sponsor cash marked received. Money out includes paid invoices, reimbursed outlays and team-account receipts treated as paid from purchase records. These recorded amounts are not bank-reconciled.</p>
      </CardContent></Card>
      <Card className="gap-2 py-5"><CardHeader className="px-5"><CardDescription>Bank balance</CardDescription><CardTitle className="text-2xl font-medium tabular-nums">{loading && !summary ? <Skeleton className="h-8 w-32" /> : snapshot ? money(snapshot.amountNok) : "—"}</CardTitle></CardHeader><CardContent className="px-5 text-xs text-muted-foreground">{snapshot ? <>Manually entered combined balance · as of <time dateTime={snapshot.asOfDate}>{snapshot.asOfDate}</time>{stale ? " · Last loaded value" : ""}</> : bank?.status === "available" ? stale ? "Last checked: no balance entered." : "No balance entered yet." : "Balance unavailable."}</CardContent></Card>
    </div>
  </section>;
}
