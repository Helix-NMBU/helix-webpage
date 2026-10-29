import { CvRequestError } from "../MemberCV/repository";
import { memberLoadFailure, memberSessionToken } from "../MemberCV/session";
import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";
import { localMemberHasFinancials, localMemberHasSeasonOverview } from "../MemberPlatform/member-access-api";
import { loadLocalSeasonBankView } from "./season-financials-local";
import type { SeasonFinancialSummary } from "./season-financials-types";

export class SeasonFinancialRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function loadSeasonFinancialSummary(owner: { current: string | null }, signal?: AbortSignal): Promise<SeasonFinancialSummary> {
  if (isLocalMemberMode()) {
    if (!localMemberSignedIn() || !localMemberHasSeasonOverview()) throw new SeasonFinancialRequestError("Season Overview access is required.", 403);
    return { bank: loadLocalSeasonBankView(), moneyFlow: { status: "no-season" }, seasonCode: null, budgetStatus: "absent", plannedNok: null, actualNok: null, departments: [], canOpenFinancials: localMemberHasFinancials(), viewVersion: 0 };
  }
  const token = await memberSessionToken(owner);
  if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
  const response = await fetch("/api/member-login?__module=season-financials", { signal, cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null) as (SeasonFinancialSummary & { error?: string }) | null;
  if (!response.ok) {
    if (response.status === 401) memberLoadFailure(new CvRequestError("Your session has ended. Sign in again to continue.", 401));
    throw new SeasonFinancialRequestError(body?.error || "Could not load financial information.", response.status);
  }
  if (!body || !Array.isArray(body.departments) || !body.bank || typeof body.viewVersion !== "number") throw new SeasonFinancialRequestError("The financial information was incomplete.", 503);
  return body;
}
