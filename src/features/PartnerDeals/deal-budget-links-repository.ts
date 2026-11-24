import { memberSessionToken, watchMemberSession } from "../MemberCV/session";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import {
  localDealBudgetLinks,
  saveLocalDealBudgetLinks,
} from "../Finance/funding-application-local";
import { publishFinanceUpdate } from "../Finance/finance-events";
import type {
  DealBudgetLinks,
  DealBudgetLinksRepository,
  SaveDealBudgetLinks,
} from "./deal-budget-links-types";
export function dealBudgetLinksRepository(): DealBudgetLinksRepository {
  if (isLocalMemberMode() && localMemberSignedIn())
    return {
      load: async (id) => localDealBudgetLinks(id),
      save: async (input) => saveLocalDealBudgetLinks(input),
    };
  const owner = { current: null as string | null };
  async function request<T>(
    dealId: string,
    input?: SaveDealBudgetLinks,
  ): Promise<T> {
    const token = await memberSessionToken(owner);
    const response = await fetch(
      `/api/partner-deals${input ? "" : `?view=budgetLinks&dealId=${encodeURIComponent(dealId)}`}`,
      {
        method: input ? "POST" : "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(input ? { "Content-Type": "application/json" } : {}),
        },
        ...(input ? { body: JSON.stringify(input) } : {}),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Object.assign(
        new Error(
          typeof body.error === "string" ? body.error : "Please try again.",
        ),
        { status: response.status },
      );
    return body as T;
  }
  return {
    load: (id) => request<DealBudgetLinks>(id),
    save: async (input) => {
      await request(input.dealId, input);
      publishFinanceUpdate();
    },
    watchSession: (end) => watchMemberSession(end, undefined, owner),
  };
}
