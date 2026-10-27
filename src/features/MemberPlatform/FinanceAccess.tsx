import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Skeleton } from "@libs/components/ui/skeleton";
import { presentPurchases } from "../Finance/access";
import { createFinanceApi, FinanceRequestError } from "../Finance/repository";
import type { FinancePageId } from "../Finance/routes";
import type {
  FinanceCapabilitiesResponse,
  FinanceCapabilitySet,
  FinanceMutationResult,
  FinanceProfile,
  FinancingView,
  PublicBudgets,
  PublicOverview,
  PurchasesView,
} from "../Finance/types";
import { useNotify } from "./MemberNotifications";

type Access = "loading" | "allowed" | "denied" | "unavailable";
type FinanceState = {
  access: Access;
  capabilities: FinanceCapabilitySet | null;
  profiles: FinanceProfile[];
  viewVersion: number | null;
  seasonCode: string | null;
  approvalThresholdNok: string | null;
  today: string | null;
  overview: PublicOverview | null;
  budgets: PublicBudgets | null;
  purchases: PurchasesView | null;
  financing: FinancingView | null;
  pageLoading: boolean;
  expanded: Record<string, boolean>;
};
type FinanceSession = FinanceState & {
  retry: () => void;
  loadPage: (page: FinancePageId, options?: { requestRecordId?: string; unpaidOnly?: boolean }) => Promise<void>;
  mutate: (body: Record<string, unknown>) => Promise<FinanceMutationResult>;
  setExpanded: (id: string, open: boolean) => void;
  setFormDirty: (id: string, dirty: boolean) => void;
};

const emptyState: FinanceState = {
  access: "loading",
  capabilities: null,
  profiles: [],
  viewVersion: null,
  seasonCode: null,
  approvalThresholdNok: null,
  today: null,
  overview: null,
  budgets: null,
  purchases: null,
  financing: null,
  pageLoading: false,
  expanded: {},
};

const FinanceContext = createContext<FinanceSession | null>(null);

function errorStatus(error: unknown): number {
  return error instanceof FinanceRequestError ? error.status : 0;
}

function visibleBudgets(budgets: PublicBudgets | null, capabilities: FinanceCapabilitySet): PublicBudgets | null {
  if (!budgets || budgets.budgetStatus !== "draft" || capabilities.draftBudgetItems) return budgets;
  return { ...budgets, departments: [], choices: { systems: [], items: [] }, earmarkChoices: [] };
}

export function FinanceAccessProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const owner = useRef<string | null>(userId);
  owner.current = userId;
  const api = useMemo(() => createFinanceApi(owner), []);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<FinanceState>(emptyState);
  const active = useRef(false);
  const generation = useRef(0);
  const pageToken = useRef(0);
  const dirtyIds = useRef(new Set<string>());
  const viewVersionRef = useRef<number | null>(null);
  const notify = useNotify();
  viewVersionRef.current = state.viewVersion;
  const applyCapabilities = useCallback((body: FinanceCapabilitiesResponse) => {
    setState((current) => ({
      ...current,
      access: "allowed",
      capabilities: body.capabilities,
      profiles: body.profiles,
      viewVersion: body.viewVersion,
      seasonCode: body.seasonCode,
      approvalThresholdNok: body.approvalThresholdNok,
      today: body.today,
      financing: body.capabilities.financing ? current.financing : null,
      budgets: visibleBudgets(current.budgets, body.capabilities),
      purchases: current.purchases ? presentPurchases(current.purchases, body.capabilities) : null,
    }));
  }, []);
  const fail = useCallback((error: unknown) => {
    const status = errorStatus(error);
    if (status === 401 || status === 403) {
      generation.current += 1;
      pageToken.current += 1;
      dirtyIds.current.clear();
      setState({ ...emptyState, access: "denied", pageLoading: false });
      return;
    }
    setState((current) => ({ ...current, access: current.access === "allowed" ? "allowed" : "unavailable", pageLoading: false }));
    notify("Could not load finance", error instanceof Error ? error.message : "Please try again.", {
      id: "finance-access",
      variant: "error",
      href: null,
      action: { label: "Try again", onClick: () => { generation.current += 1; setAttempt((value) => value + 1); } },
    });
  }, [notify]);
  const retry = useCallback(() => { generation.current += 1; setAttempt((value) => value + 1); }, []);
  useEffect(() => {
    active.current = true;
    const current = ++generation.current;
    pageToken.current += 1;
    dirtyIds.current.clear();
    setState(emptyState);
    void api.capabilities().then((body) => {
      if (!active.current || generation.current !== current) return;
      applyCapabilities(body);
    }).catch((error: unknown) => {
      if (!active.current || generation.current !== current) return;
      fail(error);
    });
    return () => { active.current = false; generation.current += 1; };
  }, [api, applyCapabilities, attempt, fail, userId]);
  const revalidate = useCallback(() => {
    const current = generation.current;
    const previousVersion = viewVersionRef.current;
    return Promise.all([api.capabilities(), api.version()]).then(([body, version]) => {
      if (!active.current || generation.current !== current) return;
      const reported = Number.isFinite(version.viewVersion) ? version.viewVersion : body.viewVersion;
      const viewVersion = Math.max(body.viewVersion, reported);
      applyCapabilities({ ...body, viewVersion });
      if (previousVersion !== null && viewVersion !== previousVersion && dirtyIds.current.size > 0) {
        notify("Finance was updated", "Your unsaved changes are still in the form.", {
          id: "finance-unsaved-update",
          variant: "info",
          href: null,
        });
      }
    }).catch((error: unknown) => {
      if (!active.current || generation.current !== current) return;
      fail(error);
    });
  }, [api, applyCapabilities, fail, notify]);
  useEffect(() => {
    const onFocus = () => revalidate();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [revalidate]);
  const mutate = useCallback(async (body: Record<string, unknown>) => {
    const current = generation.current;
    try {
      const result = await api.mutate(body);
      if (active.current && generation.current === current && typeof result.viewVersion === "number") {
        setState((value) => value.viewVersion === result.viewVersion ? value : { ...value, viewVersion: result.viewVersion });
      }
      return result;
    } catch (error) {
      if (active.current && generation.current === current && (errorStatus(error) === 401 || errorStatus(error) === 403)) await revalidate();
      throw error;
    }
  }, [api, revalidate]);
  const loadPage = useCallback(async (page: FinancePageId, options?: { requestRecordId?: string; unpaidOnly?: boolean }) => {
    const current = generation.current;
    const token = ++pageToken.current;
    setState((value) => ({ ...value, pageLoading: true }));
    try {
      if (page === "financing") {
        const financing = await api.financing();
        if (!active.current || generation.current !== current || pageToken.current !== token) return;
        setState((value) => {
          if (value.access !== "allowed" || !value.capabilities?.financing) return { ...value, financing: null, pageLoading: false };
          return { ...value, financing, viewVersion: financing.viewVersion, pageLoading: false };
        });
        return;
      }
      if (page === "purchases") {
        const purchases = await api.purchases(options?.requestRecordId, options?.unpaidOnly);
        if (!active.current || generation.current !== current || pageToken.current !== token) return;
        setState((value) => {
          if (value.access !== "allowed" || !value.capabilities) return { ...value, pageLoading: false };
          return { ...value, purchases: presentPurchases(purchases, value.capabilities), viewVersion: purchases.viewVersion, pageLoading: false };
        });
        return;
      }
      if (page === "budgets") {
        const budgets = await api.budgets();
        if (!active.current || generation.current !== current || pageToken.current !== token) return;
        setState((value) => {
          if (value.access !== "allowed" || !value.capabilities) return { ...value, pageLoading: false };
          return { ...value, budgets: visibleBudgets(budgets, value.capabilities), viewVersion: budgets.viewVersion, pageLoading: false };
        });
        return;
      }
      const overview = await api.overview();
      if (!active.current || generation.current !== current || pageToken.current !== token) return;
      setState((value) => (
        value.access === "allowed"
          ? { ...value, overview, viewVersion: overview.viewVersion, pageLoading: false }
          : { ...value, pageLoading: false }
      ));
    } catch (error) {
      if (!active.current || generation.current !== current || pageToken.current !== token) return;
      if (errorStatus(error) === 403 || errorStatus(error) === 401) {
        if (page === "financing") {
          setState((value) => ({ ...value, financing: null, pageLoading: false, capabilities: value.capabilities ? { ...value.capabilities, financing: false, manageFunding: false } : value.capabilities }));
        } else fail(error);
        return;
      }
      setState((value) => ({ ...value, pageLoading: false }));
      notify("Could not load finance", error instanceof Error ? error.message : "Please try again.", {
        id: `finance-${page}`,
        variant: "error",
        href: null,
        action: { label: "Try again", onClick: () => { void loadPage(page); } },
      });
    }
  }, [api, fail, notify]);
  const setExpanded = useCallback((id: string, open: boolean) => {
    setState((current) => ({ ...current, expanded: { ...current.expanded, [id]: open } }));
  }, []);
  const setFormDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyIds.current.add(id);
    else dirtyIds.current.delete(id);
  }, []);
  const value = useMemo(
    () => ({ ...state, retry, loadPage, mutate, setExpanded, setFormDirty }),
    [state, retry, loadPage, mutate, setExpanded, setFormDirty],
  );
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinanceAccess() {
  const session = useContext(FinanceContext);
  if (!session) throw new Error("FinanceAccessProvider is required.");
  return session;
}

export function FinanceGate({ page, children }: { page: FinancePageId; children: ReactNode }) {
  const session = useFinanceAccess();
  const notify = useNotify();
  const announced = useRef<string | null>(null);
  const financingDenied = session.access === "allowed" && page === "financing" && session.capabilities !== null && !session.capabilities.financing;
  useEffect(() => {
    const key = `${session.access}:${page}:${financingDenied}`;
    if (announced.current === key) return;
    announced.current = key;
    if (session.access === "denied") {
      notify("Finance access required", "Sign in with a verified Helix member account to open finance.", { id: "finance-denied", variant: "error", href: null });
    }
    if (session.access === "unavailable") {
      notify("Could not check finance access", "Please try again.", { id: "finance-unavailable", variant: "error", href: null, action: { label: "Try again", onClick: session.retry } });
    }
    if (financingDenied) {
      notify("Financing access required", "Financing is available to business and finance profiles.", { id: "finance-financing-denied", variant: "error", href: "/finance" });
    }
  }, [financingDenied, notify, page, session.access, session.retry]);
  if (session.access === "loading") return <div role="status" aria-label="Loading finance" className="space-y-4"><Skeleton className="h-9 w-48" /><Skeleton className="h-40 w-full" /></div>;
  if (session.access === "denied") return <Navigate to="/" replace />;
  if (session.access === "unavailable") return <Button className="self-start" variant="outline" onClick={session.retry}>Try again</Button>;
  if (financingDenied) return <Navigate to="/finance" replace />;
  return children;
}
