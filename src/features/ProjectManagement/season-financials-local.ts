import { loadLocalSeasonFinances } from "../Finance/local-finance-read";
import { localBankSnapshotForDevelopment, localFinanceRevisionForDevelopment } from "../Finance/repository";
import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";
import { localMemberHasSeasonOverview } from "../MemberPlatform/member-access-api";
import type { SeasonBankView } from "./season-financials-types";

/** This adapter is limited to the dedicated loopback development session. */
export function loadLocalSeasonBankView(): SeasonBankView {
  if (!isLocalMemberMode() || !localMemberSignedIn() || !localMemberHasSeasonOverview()) {
    throw new Error("Season Overview access is required.");
  }
  const snapshot = localBankSnapshotForDevelopment();
  return { status: "available", snapshot: snapshot ? { amountNok: snapshot.amountNok, asOfDate: snapshot.asOfDate, updatedAt: snapshot.updatedAt } : null };
}

/** Financial totals share Finance facts, but the public result is an explicit aggregate allowlist. */
export function loadLocalSeasonFinancialSummary() {
  const bank=loadLocalSeasonBankView();
  return {...loadLocalSeasonFinances(localFinanceRevisionForDevelopment()),bank};
}
