import { localBankSnapshotForDevelopment } from "../Finance/repository";
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
