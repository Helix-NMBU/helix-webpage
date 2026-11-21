import { publishFinanceUpdate } from "./finance-events";
import { memberSessionToken, watchMemberSession } from "../MemberCV/session";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import type {
  ProjectBudgetDetail,
  ProjectBudgetMutation,
  ProjectBudgetMutationResult,
  ProjectBudgetWorkspace,
} from "./project-budget-types";
import { createLocalProjectBudgetRepository } from "./project-budget-local";

export type { ProjectBudgetSystemChoice } from "./project-budget-types";
export type ProjectBudgetWorkspaceView = ProjectBudgetWorkspace;
export interface ProjectBudgetFilters {
  projectId?: string;
  departmentId?: string;
}
export interface ProjectBudgetRepository {
  load(filters?: ProjectBudgetFilters, signal?: AbortSignal): Promise<ProjectBudgetWorkspaceView>;
  detail(id: string): Promise<ProjectBudgetDetail>;
  mutate(change: ProjectBudgetMutation): Promise<ProjectBudgetMutationResult>;
  watchSession?(onEnd: () => void): () => void;
}
export class ProjectBudgetRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createProjectBudgetRepository(): ProjectBudgetRepository {
  if (isLocalMemberMode() && localMemberSignedIn())
    return createLocalProjectBudgetRepository();
  const owner = { current: null as string | null };
  async function request<T>(
    parameters: Record<string, string | undefined>,
    change?: ProjectBudgetMutation,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await memberSessionToken(owner);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters))
      if (value) query.set(key, value);
    const result = await fetch(`/api/finance${query.size ? `?${query}` : ""}`, {
      method: change ? "POST" : "GET",
      signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(change ? { "Content-Type": "application/json" } : {}),
      },
      ...(change ? { body: JSON.stringify(change) } : {}),
    });
    const body = (await result.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!result.ok)
      throw new ProjectBudgetRequestError(
        body.error ?? "Could not load the project budget. Try again.",
        result.status,
      );
    return body;
  }
  return {
    load: (filters = {}, signal) => request({ action: "projectBudgets", ...filters }, undefined, signal),
    detail: (id) => request({ action: "projectBudget", projectBudgetId: id }),
    mutate: async change => {
      const result = await request<ProjectBudgetMutationResult>({}, change);
      publishFinanceUpdate();
      return result;
    },
    watchSession: (onEnd) => watchMemberSession(onEnd, undefined, owner),
  };
}
