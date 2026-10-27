import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { workspaceRepository, WorkspaceRequestError } from "./repository";
import type { WorkspaceDirectory, WorkspaceRepository } from "./types";
const Context = createContext<{
  data: WorkspaceDirectory | null;
  loading: boolean;
  refresh: () => Promise<void>;
  saveMember: WorkspaceRepository["saveMember"];
  saveProject: WorkspaceRepository["saveProject"];
} | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkspaceDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const repository = useRef<Promise<WorkspaceRepository> | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const notify = useNotify();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const getRepository = useCallback(
    () => (repository.current ??= workspaceRepository()),
    [],
  );
  const failure = useCallback(
    (error: unknown) => {
      if (error instanceof WorkspaceRequestError && error.status === 401) {
        setData(null);
        navigate("/login", { replace: true });
      }
      notify(
        "Could not load workspace",
        error instanceof Error ? error.message : "Try again.",
        { variant: "error", href: null },
      );
    },
    [navigate, notify],
  );
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const next = await (await getRepository()).load();
      if (alive.current && current === generation.current) setData(next);
    } catch (error) {
      if (alive.current && current === generation.current) {
        setData(null);
        failure(error);
      }
    } finally {
      if (alive.current && current === generation.current) setLoading(false);
    }
  }, [getRepository, failure]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [refresh, pathname]);
  useEffect(() => {
    const updated = () => void refresh();
    window.addEventListener("helix-workspace-updated", updated);
    return () => window.removeEventListener("helix-workspace-updated", updated);
  }, [refresh]);
  const saveMember: WorkspaceRepository["saveMember"] = async (change) => {
    const current = ++generation.current;
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
  return (
    <Context.Provider
      value={{ data, loading, refresh, saveMember, saveProject }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
