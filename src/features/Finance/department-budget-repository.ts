import { memberSessionToken, watchMemberSession } from "../MemberCV/session";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import type {
  DepartmentBudgetPackageDetail,
  DepartmentBudgetPackageMutation,
  DepartmentBudgetPackageQueue,
  DepartmentBudgetPreview,
} from "./department-budget-types";
import type { FinanceMutationResult } from "./types";
import { createLocalDepartmentBudgetRepository } from "./department-budget-local";

export interface DepartmentBudgetRepository {
  queue(departmentId?: string): Promise<DepartmentBudgetPackageQueue>;
  preview(departmentId: string): Promise<DepartmentBudgetPreview>;
  detail(packageId: string): Promise<DepartmentBudgetPackageDetail>;
  mutate(
    change: DepartmentBudgetPackageMutation,
  ): Promise<FinanceMutationResult>;
  watchSession?(onEnd: () => void): () => void;
}
export class DepartmentBudgetRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
function validRead(action: string, body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const row = body as Record<string, unknown>;
  if (!Number.isSafeInteger(row.viewVersion) || Number(row.viewVersion) < 0)
    return false;
  if (action === "departmentBudgetPackages")
    return Array.isArray(row.departments) && Array.isArray(row.packages);
  if (action === "departmentBudgetPreview")
    return (
      Array.isArray(row.projects) &&
      typeof row.previewToken === "string" &&
      !!row.capabilities
    );
  return (
    typeof row.id === "string" &&
    !!row.snapshot &&
    Array.isArray((row.snapshot as { projects?: unknown }).projects) &&
    Array.isArray(row.evidence) &&
    Array.isArray(row.decisions) &&
    !!row.capabilities
  );
}
export function createDepartmentBudgetRepository(): DepartmentBudgetRepository {
  if (isLocalMemberMode() && localMemberSignedIn())
    return createLocalDepartmentBudgetRepository();
  const owner = { current: null as string | null };
  async function request<T>(
    parameters: Record<string, string | undefined>,
    change?: DepartmentBudgetPackageMutation,
  ): Promise<T> {
    const token = await memberSessionToken(owner),
      query = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters))
      if (value) query.set(key, value);
    const response = await fetch(
      `/api/finance${query.size ? `?${query}` : ""}`,
      {
        method: change ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(change ? { "Content-Type": "application/json" } : {}),
        },
        ...(change ? { body: JSON.stringify(change) } : {}),
      },
    );
    const body = (await response.json().catch(() => ({}))) as T & {
      error?: string;
    };
    if (!response.ok)
      throw new DepartmentBudgetRequestError(
        body.error ?? "Could not load the department budget. Try again.",
        response.status,
      );
    if (!change && !validRead(parameters.action!, body))
      throw new DepartmentBudgetRequestError(
        "The department budget response was incomplete. Try loading it again.",
        503,
      );
    return body;
  }
  return {
    queue: (departmentId) =>
      request({ action: "departmentBudgetPackages", departmentId }),
    preview: (departmentId) =>
      request({ action: "departmentBudgetPreview", departmentId }),
    detail: (packageId) =>
      request({ action: "departmentBudgetPackage", packageId }),
    mutate: async (change) => {
      const result = await request<FinanceMutationResult>({}, change);
      window.dispatchEvent(new Event("helix-workspace-updated"));
      return result;
    },
    watchSession: (onEnd) => watchMemberSession(onEnd, undefined, owner),
  };
}
