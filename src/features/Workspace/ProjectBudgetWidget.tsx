import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Skeleton } from "@libs/components/ui/skeleton";
import { BudgetRing } from "../Finance/BudgetRing";
import { createProjectBudgetRepository, type ProjectBudgetRepository, type ProjectBudgetWorkspaceView } from "../Finance/project-budget-repository";
import { MEMBER_ACCESS_CHANGED } from "../MemberPlatform/member-access-api";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { PropertyWidget } from "../MemberPlatform/PropertyWidget";

type Allocation = { approved: boolean; planned: string; actual: string; canDraft: boolean; hasBudget: boolean };
function allocation(workspace: ProjectBudgetWorkspaceView, projectId: string): Allocation {
  const budget = workspace.budgets.find(item => item.projectId === projectId);
  const scope = workspace.scopes.find(item => item.projectId === projectId);
  return {
    approved: !!budget?.approvedVersionId,
    planned: budget?.approvedVersionId ? budget.approvedTotalNok : "0.00",
    actual: budget?.actualNok ?? scope?.financials?.actualNok ?? "0.00",
    canDraft: budget?.capabilities.canDraft ?? scope?.capabilities.canDraft ?? false,
    hasBudget: !!budget,
  };
}
function money(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

/** Uses only the existing scoped workspace summary, never private entry/evidence reads. */
export function ProjectBudgetWidget({ projectId, viewerId, repository: supplied }: {
  projectId: string; viewerId: string; repository?: ProjectBudgetRepository;
}) {
  const repository = useMemo(() => supplied ?? createProjectBudgetRepository(), [supplied, viewerId]);
  const scope = `${viewerId}:${projectId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [state, setState] = useState<{ scope: string; value: Allocation | null }>({ scope, value: null });
  const [loading, setLoading] = useState(true);
  const active = useRef(false), generation = useRef(0);
  const pending = useRef<{ controller: AbortController; timer: number } | null>(null);
  const notify = useNotify(), navigate = useNavigate();
  const clear = useCallback(() => {
    generation.current++;
    if (pending.current) { pending.current.controller.abort(); window.clearTimeout(pending.current.timer); pending.current = null; }
    setState({ scope, value: null });
  }, [scope]);
  const refresh = useCallback(async () => {
    if (!active.current || currentScope.current !== scope) return;
    // A mutation/focus event supersedes an older read, even while that read is pending.
    if (pending.current) { pending.current.controller.abort(); window.clearTimeout(pending.current.timer); }
    const request = ++generation.current, controller = new AbortController();
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => { reject(new Error("The project budget took too long to load. Try again.")); controller.abort(); }, 15_000);
    });
    pending.current = { controller, timer };
    setLoading(true);
    try {
      const workspace = await Promise.race([repository.load({ projectId }, controller.signal), timeout]);
      if (!active.current || request !== generation.current) return;
      setState({ scope, value: allocation(workspace, projectId) });
    } catch (error) {
      if (!active.current || request !== generation.current) return;
      setState({ scope, value: null });
      const expired = error && typeof error === "object" && "status" in error && error.status === 401;
      if (expired) active.current = false;
      notify("Could not load project budget", error instanceof Error ? error.message : "Please try again.", {
        id: `project-budget-widget-${projectId}`, variant: "error", href: null,
        action: expired ? { label: "Sign in", onClick: () => navigate("/login") } : { label: "Try again", onClick: () => void refresh() },
      });
    } finally {
      window.clearTimeout(timer);
      if (pending.current?.controller === controller) pending.current = null;
      if (request === generation.current) setLoading(false);
    }
  }, [repository, projectId, scope, notify, navigate]);
  useEffect(() => {
    active.current = true;
    clear();
    void refresh();
    const visible = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const access = () => { clear(); void refresh(); };
    const end = () => { active.current = false; clear(); setLoading(false); };
    const stop = repository.watchSession?.(end);
    window.addEventListener("focus", visible);
    window.addEventListener("helix-workspace-updated", visible);
    window.addEventListener("storage", visible);
    window.addEventListener(MEMBER_ACCESS_CHANGED, access);
    window.addEventListener("helix-member-local-session-changed", access);
    document.addEventListener("visibilitychange", visible);
    const interval = window.setInterval(visible, 30_000);
    return () => {
      active.current = false; generation.current++;
      if (pending.current) { pending.current.controller.abort(); window.clearTimeout(pending.current.timer); pending.current = null; }
      window.clearInterval(interval); stop?.();
      window.removeEventListener("focus", visible);
      window.removeEventListener("helix-workspace-updated", visible);
      window.removeEventListener("storage", visible);
      window.removeEventListener(MEMBER_ACCESS_CHANGED, access);
      window.removeEventListener("helix-member-local-session-changed", access);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [repository, clear, refresh]);
  const value = state.scope === scope ? state.value : null;
  const target = `/projects/${encodeURIComponent(projectId)}?tab=budget`;
  return <PropertyWidget title="Budget and spending"><section aria-label="Project budget and spending" aria-busy={loading} className="space-y-4">
    {loading && !value ? <Skeleton aria-label="Loading project budget" className="h-40 w-full" /> : value?.approved ? <>
      <div className="flex justify-center"><BudgetRing planned={value.planned} actual={value.actual} /></div>
      <dl className="grid grid-cols-2 gap-3 text-center"><div className="min-w-0"><dt className="text-xs text-muted-foreground">Allocated budget</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{money(value.planned)}</dd></div><div className="min-w-0"><dt className="text-xs text-muted-foreground">Recorded spending</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{money(value.actual)}</dd></div></dl>
      <p className="sr-only">Approved project allocation. Recorded spending includes unpaid invoices.</p>
    </> : value ? <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{value.canDraft ? value.hasBudget ? "Your budget has not been approved yet." : "Draft a budget to plan this project's costs." : "The allocated budget will appear after Finance approves it."}</p>
      {value.canDraft && <Button asChild variant="outline" size="sm"><Link to={target}>{value.hasBudget ? "Continue budget" : "Draft a budget"}</Link></Button>}
    </div> : <p className="text-sm text-muted-foreground">Budget unavailable.</p>}
  </section></PropertyWidget>;
}
