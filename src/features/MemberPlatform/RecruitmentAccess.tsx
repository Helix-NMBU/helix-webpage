import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Skeleton } from "@libs/components/ui/skeleton";
import { createRecruitmentApi } from "../Recruitment/website-api";
import type { ApplicationRow } from "../Recruitment/website-api";
import type { RecruitmentPosition } from "../Recruitment/positions";
import { useNotify } from "./MemberNotifications";

function errorStatus(error: unknown): number {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 0;
}

function nextPositionVersion(versions: Map<string, number>, id?: string): number {
  if (!id) return 0;
  const version = (versions.get(id) ?? 0) + 1;
  versions.set(id, version);
  return version;
}

type Access = "loading" | "allowed" | "denied" | "unavailable";
type RecruitmentState = {
  access: Access;
  applications: ApplicationRow[];
  positions: RecruitmentPosition[];
  loading: boolean;
  ready: boolean;
};
type RecruitmentSession = RecruitmentState & {
  api: ReturnType<typeof createRecruitmentApi>;
  retry: () => void;
  deny: () => void;
  refresh: () => Promise<void>;
  removeApplication: (id: string, reject: boolean) => ReturnType<ReturnType<typeof createRecruitmentApi>["reject"]>;
  savePosition: (position: Omit<RecruitmentPosition, "id"> & { id?: string }) => Promise<void>;
  setPositionVisibility: (id: string, visible: boolean) => Promise<void>;
  deletePosition: (id: string) => Promise<void>;
};
const initialState: RecruitmentState = { access: "loading", applications: [], positions: [], loading: true, ready: false };
const RecruitmentContext = createContext<RecruitmentSession | null>(null);

// Mounted once for the authenticated member session, above the routed pages.
// Only an explicit retry rechecks the sidebar capability. Every API operation
// still verifies authorization on the server and can invalidate this snapshot.
export function RecruitmentAccessProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const owner = useRef<string | null>(userId);
  const api = useMemo(() => createRecruitmentApi(owner), []);
  const [state, setState] = useState(initialState);
  const active = useRef(false);
  const generation = useRef(0);
  const dataRevision = useRef(0);
  const positionVersions = useRef(new Map<string, number>());
  const bootstrap = useRef<Promise<RecruitmentState & { error?: unknown }> | null>(null);
  const refreshPending = useRef<Promise<void> | null>(null);
  const notify = useNotify();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const deny = useCallback(() => {
    generation.current += 1;
    setState({ ...initialState, access: "denied", loading: false });
  }, []);
  const recovery = useRef<() => void>(() => undefined);
  const failure = useCallback((error: unknown) => {
    const status = errorStatus(error);
    if (status === 401 || status === 403) {
      deny();
      if (status === 401) navigateRef.current("/login", { replace: true });
    }
    notify("Could not load recruiting data", error instanceof Error ? error.message : "Please try again.", {
      id: "recruitment-data", variant: "error", href: null,
      ...(![401, 403].includes(status) ? { action: { label: "Try again", onClick: () => recovery.current() } } : {}),
    });
  }, [deny, notify]);
  const readData = useCallback(async () => {
    const [applications, positions] = await Promise.all([api.list(), api.positions()]);
    return { applications, positions };
  }, [api]);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { bootstrap.current = null; setAttempt(value => value + 1); }, []);
  useEffect(() => {
    active.current = true;
    const current = ++generation.current;
    bootstrap.current ??= api.session().then(async () => {
      try { return { access: "allowed" as const, ...await readData(), ready: true, loading: false }; }
      catch (error) {
        if ([401, 403].includes(errorStatus(error))) throw error;
        return { ...initialState, access: "allowed" as const, loading: false, error };
      }
    }).catch(error => ({ ...initialState, loading: false,
      access: [401, 403].includes(errorStatus(error)) ? "denied" as const : "unavailable" as const, error,
    }));
    void bootstrap.current.then(next => {
      if (!active.current || generation.current !== current) return;
      setState(next);
      if (next.error && next.access !== "denied") failure(next.error);
      if (errorStatus(next.error) === 401) navigateRef.current("/login", { replace: true });
    });
    return () => { active.current = false; generation.current += 1; };
  }, [api, readData, failure, attempt]);
  const refresh = useCallback(() => {
    if (refreshPending.current) return refreshPending.current;
    const current = generation.current;
    const revision = dataRevision.current;
    setState(value => ({ ...value, loading: true }));
    const run = readData().then(data => {
      if (active.current && generation.current === current && dataRevision.current === revision) setState(value => ({ ...value, ...data, ready: true }));
    }).catch(error => { if (active.current && generation.current === current) failure(error); }).finally(() => {
      refreshPending.current = null;
      if (active.current && generation.current === current) setState(value => ({ ...value, loading: false }));
    });
    refreshPending.current = run;
    return run;
  }, [readData, failure]);
  useEffect(() => { recovery.current = state.access === "unavailable" ? retry : () => { void refresh(); }; }, [state.access, retry, refresh]);
  const removeApplication = useCallback(async (id: string, reject: boolean) => {
    const current = generation.current;
    dataRevision.current += 1;
    try {
      const result = await (reject ? api.reject(id) : api.remove(id));
      if (active.current && generation.current === current) {
        dataRevision.current += 1;
        setState(value => ({ ...value, applications: value.applications.filter(row => row.id !== id) }));
      }
      return result;
    } catch (error) { if (active.current && generation.current === current) failure(error); throw error; }
  }, [api, failure]);
  const savePosition = useCallback(async (position: Omit<RecruitmentPosition, "id"> & { id?: string }) => {
    const current = generation.current;
    const version = nextPositionVersion(positionVersions.current, position.id);
    dataRevision.current += 1;
    try {
      const saved = await api.savePosition(position);
      if (!active.current || generation.current !== current || (positionVersions.current.get(saved.id) ?? 0) !== version) return;
      dataRevision.current += 1;
      setState(value => ({ ...value, positions: [...value.positions.filter(row => row.id !== saved.id), saved] }));
      notify("Position saved", saved.visible ? "This position is visible on the website." : "This position is hidden from the website.", { variant: "success", href: null });
    } catch (error) { if (active.current && generation.current === current) failure(error); throw error; }
  }, [api, failure, notify]);
  const setPositionVisibility = useCallback(async (id: string, visible: boolean) => {
    const current = generation.current;
    const version = nextPositionVersion(positionVersions.current, id);
    dataRevision.current += 1;
    try {
      const saved = await api.setPositionVisibility(id, visible);
      if (!active.current || generation.current !== current || positionVersions.current.get(id) !== version) return;
      dataRevision.current += 1;
      setState(value => ({ ...value, positions: value.positions.map(position => position.id === id ? saved : position) }));
      notify("Position saved", saved.visible ? "This position is visible on the website." : "This position is hidden from the website.", { variant: "success", href: null });
    } catch (error) { if (active.current && generation.current === current) failure(error); throw error; }
  }, [api, failure, notify]);
  const deletePosition = useCallback(async (id: string) => {
    const current = generation.current;
    const version = nextPositionVersion(positionVersions.current, id);
    dataRevision.current += 1;
    try {
      await api.deletePosition(id);
      if (!active.current || generation.current !== current || positionVersions.current.get(id) !== version) return;
      dataRevision.current += 1;
      setState(value => ({ ...value, positions: value.positions.filter(row => row.id !== id) }));
      notify("Position deleted", "Existing applications have been kept.", { variant: "success", href: null });
    } catch (error) { if (active.current && generation.current === current) failure(error); throw error; }
  }, [api, failure, notify]);
  const value = useMemo(() => ({ ...state, api, retry, deny, refresh, removeApplication, savePosition, deletePosition, setPositionVisibility }),
    [state, api, retry, deny, refresh, removeApplication, savePosition, deletePosition, setPositionVisibility]);
  return <RecruitmentContext.Provider value={value}>{state.access === "loading"
    ? <div role="status" aria-label="Loading your workspace" className="p-8"><Skeleton className="h-40 w-full" /></div>
    : children}</RecruitmentContext.Provider>;
}

export function useRecruitmentAccess() {
  const session = useContext(RecruitmentContext);
  if (!session) throw new Error("RecruitmentAccessProvider is required.");
  return session;
}

export function RecruitmentAccess({ children }: { children: ReactNode }) {
  const { access, retry } = useRecruitmentAccess();
  const notify = useNotify();
  const announced = useRef<Access | null>(null);
  useEffect(() => {
    if (announced.current === access) return;
    announced.current = access;
    if (access === "denied") notify("Recruitment access required", "Contact a Helix administrator to request recruiter access.", { variant: "error", href: null });
    if (access === "unavailable") notify("Could not check recruitment access", "Please try again.", { variant: "error", href: null, action: { label: "Try again", onClick: retry } });
  }, [access, notify, retry]);
  if (access === "denied") return <Navigate to="/" replace />;
  if (access === "unavailable") return <Button className="self-start" variant="outline" onClick={retry}>Try again</Button>;
  if (access === "loading") return <div role="status" aria-label="Checking recruitment access" className="space-y-4"><Skeleton className="h-9 w-48" /><Skeleton className="h-40 w-full" /></div>;
  return children;
}
