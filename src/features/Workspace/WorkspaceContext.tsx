import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { clearProjectWorkspaceCache, projectRepository } from "../ProjectManagement/repository";
import { workspaceRepository, WorkspaceRequestError } from "./repository";
import { clearDepartmentHomeCache } from "./department-home-repository";
import type { WorkspaceDirectory, WorkspaceRepository } from "./types";
const Context = createContext<{
  data: WorkspaceDirectory | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveMember: WorkspaceRepository["saveMember"];
  saveProject: WorkspaceRepository["saveProject"];
  saveSpaceOrder: WorkspaceRepository["saveSpaceOrder"];
} | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkspaceDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const repository = useRef<Promise<WorkspaceRepository> | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const notify = useNotify();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const getRepository = useCallback(
    () => (repository.current ??= workspaceRepository()),
    [],
  );
  const failure = useCallback(
    (error: unknown) => {
      if (error instanceof WorkspaceRequestError && error.status === 401) {
        setData(null);
        navigateRef.current("/login", { replace: true });
      }
      notify(
        "Could not load workspace",
        error instanceof Error ? error.message : "Try again.",
        { id: "workspace-load", variant: "error", href: null,
          action: { label: "Try again", onClick: () => void refreshRef.current() } },
      );
    },
    [notify],
  );
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = await (await getRepository()).load();
      if (alive.current && current === generation.current) setData(next);
    } catch (error) {
      if (alive.current && current === generation.current) {
        if (error instanceof WorkspaceRequestError && [401, 403].includes(error.status)) { clearDepartmentHomeCache(); setData(null); }
        failure(error);
      }
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }, [getRepository, failure]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      generation.current++;
      clearProjectWorkspaceCache();
      clearDepartmentHomeCache();
    };
  }, [refresh]);
  useEffect(() => {
    const updated = () => { clearProjectWorkspaceCache(); clearDepartmentHomeCache(); void refresh(); };
    window.addEventListener("helix-workspace-updated", updated);
    return () => window.removeEventListener("helix-workspace-updated", updated);
  }, [refresh]);
  useEffect(() => {
    if (data?.projectAccess) void projectRepository().then(repo => repo.load()).catch(() => {});
  }, [data?.viewerId, data?.projectAccess]);
  const saveMember: WorkspaceRepository["saveMember"] = async (change) => {
    const current = ++generation.current;
    clearDepartmentHomeCache();
    const next = await (await getRepository()).saveMember(change);
    if (alive.current && generation.current === current) {
      setData(next);
      setLoading(false);
    }
    return next;
  };
  const saveProject: WorkspaceRepository["saveProject"] = async (change) => {
    const current = ++generation.current;
    const next = await (await getRepository()).saveProject(change);
    if (alive.current && generation.current === current) {
      setData(next);
      setLoading(false);
    }
    return next;
  };
  const saveSpaceOrder: WorkspaceRepository["saveSpaceOrder"] = async (order) => {
    const next = await (await getRepository()).saveSpaceOrder(order);
    if (alive.current) setData(current => current ? { ...current, spaceOrder: next.spaceOrder } : next);
    return next;
  };
  return (
    <Context.Provider
      value={{ data, loading, refresh, saveMember, saveProject, saveSpaceOrder }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
