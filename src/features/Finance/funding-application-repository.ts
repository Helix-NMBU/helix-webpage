import { memberSessionToken, watchMemberSession } from "../MemberCV/session";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import type {
  FundingApplicationBudgetContext,
  FundingApplicationDetail,
  FundingApplicationMutation,
  FundingApplicationMutationResult,
  FundingApplicationQueue,
  ProjectFundingProposals,
} from "./funding-application-types";
import { createLocalFundingApplicationRepository } from "./funding-application-local";
export interface FundingApplicationRepository {
  queue(): Promise<FundingApplicationQueue>;
  detail(id: string): Promise<FundingApplicationDetail>;
  context(id: string): Promise<FundingApplicationBudgetContext>;
  proposals(id: string): Promise<ProjectFundingProposals>;
  card(dealId: string): Promise<{
    application:
      | import("./funding-application-types").FundingApplicationCard
      | null;
  }>;
  mutate(
    change: FundingApplicationMutation,
  ): Promise<FundingApplicationMutationResult>;
  watchSession?(onEnd: () => void): () => void;
}
export class FundingApplicationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function createFundingApplicationRepository(): FundingApplicationRepository {
  if (isLocalMemberMode() && localMemberSignedIn())
    return createLocalFundingApplicationRepository();
  const owner = { current: null as string | null };
  async function request<T>(
    action: string,
    parameters: Record<string, string> = {},
    change?: FundingApplicationMutation,
  ): Promise<T> {
    const token = await memberSessionToken(owner),
      query = new URLSearchParams(
        action === "fundingApplicationCard"
          ? { view: action, ...parameters }
          : { action, ...parameters },
      );
    const endpoint =
      change?.action === "saveFundingApplication" ||
      action === "fundingApplicationCard"
        ? "/api/partner-deals"
        : "/api/finance";
    const response = await fetch(`${endpoint}${change ? "" : `?${query}`}`, {
      method: change ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(change ? { "Content-Type": "application/json" } : {}),
      },
      ...(change ? { body: JSON.stringify(change) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new FundingApplicationError(
        typeof body.error === "string" ? body.error : "Please try again.",
        response.status,
      );
    return body as T;
  }
  return {
    queue: () => request("fundingApplications"),
    detail: (applicationId) => request("fundingApplication", { applicationId }),
    context: (applicationId) =>
      request("fundingApplicationBudgetContext", { applicationId }),
    proposals: async (projectBudgetId) => {
      const result = await request<ProjectFundingProposals>(
        "projectFundingProposals",
        { projectBudgetId },
      );
      if (!Array.isArray(result.proposals))
        throw new FundingApplicationError(
          "Could not load funding proposals. Please try again.",
          502,
        );
      return result;
    },
    card: (dealId) => request("fundingApplicationCard", { dealId }),
    mutate: (change) => request("", {}, change),
    watchSession: (end) => watchMemberSession(end, undefined, owner),
  };
}
