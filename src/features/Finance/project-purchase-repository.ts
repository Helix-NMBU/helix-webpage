import { memberSessionToken, watchMemberSession } from "../MemberCV/session";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import type {
  ProjectBudgetMutation,
  ProjectBudgetMutationResult,
} from "./project-budget-types";
import type {
  ProjectPurchaseBinding,
  ProjectPurchaseChange,
  ProjectPurchaseContext,
  ProjectPurchaseResult,
} from "./project-purchase-types";
import { createLocalProjectPurchaseRepository } from "./project-purchase-local";
export interface ProjectPurchaseRepository {
  load(binding: ProjectPurchaseBinding): Promise<ProjectPurchaseContext>;
  mutate(change: ProjectPurchaseChange): Promise<ProjectPurchaseResult>;
  complete(
    change: Extract<
      ProjectBudgetMutation,
      { action: "setProjectBudgetCompletion" }
    >,
  ): Promise<ProjectBudgetMutationResult>;
  upload(binding: ProjectPurchaseBinding, file: File): Promise<string>;
  watchSession?(onEnd: () => void): () => void;
}
export function createProjectPurchaseRepository(): ProjectPurchaseRepository {
  if (isLocalMemberMode() && localMemberSignedIn())
    return createLocalProjectPurchaseRepository();
  const owner = { current: null as string | null };
  async function request<T>(
    parameters: Record<string, string>,
    change?: unknown,
  ): Promise<T> {
    const token = await memberSessionToken(owner);
    const response = await fetch(
      `/api/finance${change ? "" : `?${new URLSearchParams(parameters)}`}`,
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
    const body = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(body.error ?? "Could not save the purchase. Try again."),
        { status: response.status },
      );
    return body as T;
  }
  const mutate = (change: ProjectPurchaseChange) =>
    request<ProjectPurchaseResult>({}, change);
  return {
    load: (binding) =>
      request({ action: "projectPurchaseContext", ...binding }),
    mutate,
    complete: (change) => request({}, change),
    async upload(binding, file) {
      const authorized = await mutate({
        action: "authorizeProjectPurchaseUpload",
        ...binding,
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size,
      });
      if (!authorized.uploadUrl || !authorized.id)
        throw new Error("Could not prepare the upload. Try again.");
      const response = await fetch(authorized.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok)
        throw new Error("Could not upload the invoice. Try again.");
      await mutate({
        action: "finalizeProjectPurchaseUpload",
        ...binding,
        uploadId: authorized.id,
      });
      return authorized.id;
    },
    watchSession: (onEnd) => watchMemberSession(onEnd, undefined, owner),
  };
}
