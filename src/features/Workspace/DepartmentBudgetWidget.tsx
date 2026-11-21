import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@libs/components/ui/skeleton";
import { MEMBER_ACCESS_CHANGED } from "../MemberPlatform/member-access-api";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { DepartmentHomeBudget } from "../Finance/department-budget-types";
import { createDepartmentBudgetHomeRepository, DepartmentBudgetHomeError, type DepartmentBudgetHomeRepository } from "./department-budget-home-repository";

function amount(value: string): string {
  const [whole, fraction] = value.split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function status(error: unknown): number | null {
  return error && typeof error === "object" && "status" in error ? Number(error.status) : null;
}

export function DepartmentBudgetWidget({ departmentId, viewerId, repository: supplied }: {
  departmentId: string;
  viewerId: string;
  repository?: DepartmentBudgetHomeRepository;
}) {
  const repository = useMemo(() => supplied ?? createDepartmentBudgetHomeRepository(), [supplied, viewerId]);
  const scope = `${viewerId}:${departmentId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [state, setState] = useState<{ scope: string; value: DepartmentHomeBudget | null; stale: boolean }>({ scope, value: null, stale: false });
  const [loading, setLoading] = useState(true);
  const active = useRef(false), generation = useRef(0);
  const pending = useRef<{ controller: AbortController; timer: number } | null>(null);
  const notify = useNotify(), navigate = useNavigate();
  const clear = useCallback(() => {
    generation.current++;
    if (pending.current) { window.clearTimeout(pending.current.timer); pending.current.controller.abort(); pending.current = null; }
    setState({ scope, value: null, stale: false });
  }, [scope]);
  const refresh = useCallback(async (force = false) => {
    if (!active.current || currentScope.current !== scope || (pending.current && !force)) return;
    if (pending.current) { window.clearTimeout(pending.current.timer); pending.current.controller.abort(); pending.current = null; }
    const current = ++generation.current, controller = new AbortController();
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new DepartmentBudgetHomeError("The allocated budget took too long to load. Try again.", 503));
        controller.abort();
      }, 15_000);
    });
    pending.current = { controller, timer };
    setLoading(true);
    try {
      const value = await Promise.race([repository.load(departmentId, controller.signal), timeout]);
      if (!active.current || current !== generation.current) return;
      setState({ scope, value, stale: false });
    } catch (error) {
      if (!active.current || current !== generation.current) return;
      const code = status(error), denied = code === 401 || code === 403;
      if (code === 401) { active.current = false; }
      if (denied) setState({ scope, value: null, stale: false });
      else setState(previous => previous.scope === scope ? { ...previous, stale: previous.value !== null } : { scope, value: null, stale: false });
      notify("Could not load allocated budget", error instanceof Error ? error.message : "Try again.", {
        id: `department-budget-${departmentId}`, variant: "error", href: null,
        action: code === 401 ? { label: "Sign in", onClick: () => navigate("/login") } : { label: "Try again", onClick: () => void refresh() },
      });
    } finally {
      window.clearTimeout(timer);
      if (pending.current?.controller === controller) pending.current = null;
      if (current === generation.current) setLoading(false);
    }
  }, [repository, departmentId, scope, notify, navigate]);
  useEffect(() => {
    active.current = true;
    clear();
    void refresh();
    const onFocus = () => void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onAccess = () => { clear(); void refresh(); };
    const end = () => { active.current = false; clear(); setLoading(false); notify("Your session has ended", "Sign in again to view the allocated budget.", { variant: "error", href: null, action: { label: "Sign in", onClick: () => navigate("/login") } }); };
    const unwatch = repository.watchSession?.(end);
    window.addEventListener("focus", onFocus);
    const onUpdate = () => void refresh(true);
    window.addEventListener("helix-workspace-updated", onUpdate);
    window.addEventListener("storage", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(MEMBER_ACCESS_CHANGED, onAccess);
    window.addEventListener("helix-member-local-session-changed", onAccess);
    const timer = window.setInterval(onVisible, 30_000);
    return () => {
      active.current = false;
      generation.current++;
      if (pending.current) { window.clearTimeout(pending.current.timer); pending.current.controller.abort(); pending.current = null; }
      unwatch?.(); window.clearInterval(timer);
      window.removeEventListener("focus", onFocus); window.removeEventListener("helix-workspace-updated", onUpdate); window.removeEventListener("storage", onVisible); document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(MEMBER_ACCESS_CHANGED, onAccess); window.removeEventListener("helix-member-local-session-changed", onAccess);
    };
  }, [clear, refresh, repository, notify, navigate]);
  const data = state.scope === scope ? state.value : null;
  return <section aria-labelledby="department-budget-title" aria-busy={loading} className="min-w-0 space-y-4 border-t pt-6">
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="department-budget-title" className="text-sm font-medium text-muted-foreground">Allocated budget</h2>
      </div>
      {loading && !data ? <Skeleton className="h-8 w-36" aria-label="Loading allocated budget" /> : <p className="break-words text-2xl font-medium tabular-nums">{data ? amount(data.approvedTotalNok) : "—"}</p>}
      <p className="text-xs text-muted-foreground">{data ? `${state.stale ? "Last loaded approved allocation" : "Approved allocation"} · ${data.seasonCode}` : "Approved department allocation by project."}</p>
    </div>
    {data && <>
      {data.projects.length ? <dl className="space-y-4">{data.projects.map(project => <div className="min-w-0 space-y-1" key={project.projectId}>
        <dt className="break-words text-sm"><Link className="underline-offset-4 hover:underline focus-visible:underline" to={`/projects/${encodeURIComponent(project.projectId)}`}>{project.projectName}</Link></dt>
        <dd className="break-words text-sm tabular-nums text-muted-foreground">{amount(project.approvedTotalNok)}</dd>
      </div>)}</dl> : <p className="text-sm text-muted-foreground">No approved project budgets yet.</p>}
      {data.legacyTotalNok !== "0.00" && <div className="space-y-1 border-t pt-3 text-sm"><p className="text-muted-foreground">Unmapped legacy budget</p><p className="break-words tabular-nums">{amount(data.legacyTotalNok)}</p></div>}
    </>}
  </section>;
}
