import { CvRequestError } from "../MemberCV/repository";
import { memberLoadFailure, memberSessionToken, watchMemberSession } from "../MemberCV/session";
import { isLocalMemberMode } from "../MemberPlatform/local-mode";
import type { DepartmentHomeBudget } from "../Finance/department-budget-types";

export class DepartmentBudgetHomeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface DepartmentBudgetHomeRepository {
  load(departmentId: string, signal?: AbortSignal): Promise<DepartmentHomeBudget>;
  watchSession?(onEnd: () => void): () => void;
}

const money = (value: unknown): value is string => typeof value === "string" && /^\d+\.\d{2}$/.test(value);
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Keep the homepage projection independent of private Finance and approval DTOs. */
export function readDepartmentHomeBudget(value: unknown, departmentId: string): DepartmentHomeBudget {
  if (!value || typeof value !== "object") throw new DepartmentBudgetHomeError("The allocated budget response was incomplete.", 503);
  const input = value as Partial<DepartmentHomeBudget>;
  if (input.departmentId !== departmentId || !identifier(input.departmentName)
    || !identifier(input.seasonCode) || (input.seasonId !== null && !identifier(input.seasonId))
    || !Number.isSafeInteger(input.viewVersion) || Number(input.viewVersion) < 0
    || !money(input.approvedTotalNok) || !money(input.legacyTotalNok) || !Array.isArray(input.projects)
    || input.projects.some(project => !project || !identifier(project.projectId) || !identifier(project.projectName) || !money(project.approvedTotalNok))
    || new Set(input.projects.map(project => project.projectId)).size !== input.projects.length) {
    throw new DepartmentBudgetHomeError("The allocated budget response was incomplete.", 503);
  }
  return {
    viewVersion: input.viewVersion!, seasonId: input.seasonId!, seasonCode: input.seasonCode,
    departmentId, departmentName: input.departmentName, approvedTotalNok: input.approvedTotalNok,
    legacyTotalNok: input.legacyTotalNok,
    projects: input.projects.map(({ projectId, projectName, approvedTotalNok }) => ({ projectId, projectName, approvedTotalNok })),
  };
}

/** No shared cache: each account and department read rechecks its own authority. */
export function createDepartmentBudgetHomeRepository(
  token?: () => Promise<string>,
  request: typeof fetch = fetch,
): DepartmentBudgetHomeRepository {
  const owner = { current: null as string | null };
  return {
    async load(departmentId, signal) {
      if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
      if (isLocalMemberMode()) {
        const { loadLocalDepartmentHomeBudget } = await import("../Finance/department-budget-local");
        const result = await loadLocalDepartmentHomeBudget(departmentId);
        if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
        return readDepartmentHomeBudget(result, departmentId);
      }
      let accessToken: string;
      try { accessToken = await (token ?? (() => memberSessionToken(owner)))(); }
      catch (error) {
        if (error instanceof CvRequestError) throw new DepartmentBudgetHomeError(error.message, [401, 403].includes(error.status) ? 401 : error.status);
        throw error;
      }
      if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
      const query = new URLSearchParams({ action: "departmentHomeBudget", departmentId });
      const response = await request(`/api/finance?${query}`, { signal, cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error : "Could not load the allocated budget. Try again.";
        if (response.status === 401) memberLoadFailure(new CvRequestError(message, 401));
        throw new DepartmentBudgetHomeError(message, response.status);
      }
      return readDepartmentHomeBudget(body, departmentId);
    },
    watchSession: onEnd => watchMemberSession(onEnd, undefined, owner),
  };
}
