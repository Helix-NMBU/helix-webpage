import { useEffect, useMemo, useState } from "react";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { MEMBER_ACCESS_CHANGED } from "../MemberPlatform/member-access-api";
import { createDepartmentBudgetRepository } from "./department-budget-repository";
import { createProjectBudgetRepository } from "./project-budget-repository";
import type { DepartmentBudgetPackageQueue } from "./department-budget-types";
import type { ProjectBudgetDetail, ProjectBudgetWorkspace } from "./project-budget-types";

export function useBudgetReviewSignals({ departmentId, includeDetails = false }: { departmentId?: string; includeDetails?: boolean } = {}) {
  const session = useFinanceAccess();
  const notify = useNotify();
  const enabled = session.access === "allowed" && session.capabilities?.purchaseRegister === true && (!includeDetails || !!departmentId);
  const repositories = useMemo(() => ({ departments: createDepartmentBudgetRepository(), projects: createProjectBudgetRepository() }), []);
  const [state, setState] = useState<{ queue: DepartmentBudgetPackageQueue; projects: ProjectBudgetWorkspace; details: ProjectBudgetDetail[]; departmentId?: string; includeDetails: boolean } | null>(null);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    let alive = true, generation = 0, denied = false;
    setState(null);
    if (!enabled) { setLoading(false); return; }
    const clear = () => { denied = true; generation++; if (alive) { setState(null); setLoading(false); } };
    const load = async () => {
      if (denied) return;
      const token = ++generation;
      setLoading(true);
      try {
        const [queue, projects] = await Promise.all([repositories.departments.queue(departmentId), repositories.projects.load(departmentId ? { departmentId } : undefined)]);
        if (!Array.isArray(queue.packages) || !Array.isArray(projects.budgets)) throw new Error("The budget change response was incomplete. Try again.");
        if (!alive || denied || token !== generation) return;
        const details = includeDetails ? await Promise.all(projects.budgets.filter(budget => budget.pendingVersionId && budget.capabilities.canRead && !budget.capabilities.approvedOnly).map(budget => repositories.projects.detail(budget.id))) : [];
        if (alive && !denied && token === generation) setState({ queue, projects, details, departmentId, includeDetails });
      } catch (error) {
        if (!alive || denied || token !== generation) return;
        setState(null);
        const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
        if (status === 401 || status === 403) clear();
        notify("Could not load budget changes", error instanceof Error ? error.message : "Try again.", { variant: "error", href: null, action: { label: "Try again", onClick: () => { if (status === 401 || status === 403) session.retry(); else void load(); } } });
      } finally { if (alive && token === generation) setLoading(false); }
    };
    void load();
    const stop = repositories.departments.watchSession?.(clear);
    const refresh = () => { if (alive) void load(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("helix-workspace-updated", refresh);
    const accessChanged = () => { setState(null); refresh(); };
    window.addEventListener(MEMBER_ACCESS_CHANGED, accessChanged);
    return () => { alive = false; generation++; stop?.(); window.removeEventListener("focus", refresh); window.removeEventListener("helix-workspace-updated", refresh); window.removeEventListener(MEMBER_ACCESS_CHANGED, accessChanged); };
  }, [enabled, departmentId, includeDetails, notify, repositories, session.retry, session.viewVersion]);
  return { data: enabled && state && state.departmentId === departmentId && state.includeDetails === includeDetails ? state : null, loading: enabled && loading, enabled };
}
