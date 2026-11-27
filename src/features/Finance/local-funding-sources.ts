import { deleteWithOtherChangesMessage, parseFundingChange, stableJson, type NormalizedFunding } from "./funding";
import { similarIncomeField, similarIncomePayment } from "./income-receipts";
import { loadLocalIncomeReceipts } from "./local-income-receipts";
import { formatOre, fundingReference } from "./money";
import type { FinanceFieldError, FinanceMutationResult, FundingRecord, FundingStatus } from "./types";

type ManualFundingAction = "addFunding" | "editFunding" | "deleteFunding" | "restoreFunding";
export type LocalFundingState = {
  funding?: FundingRecord[];
  fundingPriorStatuses?: Record<string, FundingStatus>;
  fundingMutations?: Record<string, { fingerprint: string; result: FinanceMutationResult }>;
};

export function isManualFundingAction(action: unknown): action is ManualFundingAction {
  return action === "addFunding" || action === "editFunding" || action === "deleteFunding" || action === "restoreFunding";
}

function fail(status: number, message: string, errors: FinanceFieldError[] = []): never {
  throw Object.assign(new Error(message), { status, errors });
}

export function applyLocalFundingChange(
  state: LocalFundingState,
  seasonCode: string,
  viewVersion: number,
  body: Record<string, unknown>,
): FinanceMutationResult {
  const parsed = parseFundingChange(body);
  if (!parsed.ok) fail(400, parsed.errors[0]?.message ?? "Check the funding details.", parsed.errors);
  const { change } = parsed;
  const requestId = body.requestId;
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId)) {
    fail(400, "A valid request ID is required.");
  }
  const fingerprint = stableJson(change);
  const replay = state.fundingMutations?.[requestId];
  if (replay) {
    if (replay.fingerprint !== fingerprint) fail(409, "This request was already used with different details.");
    return replay.result;
  }
  const records = state.funding ?? [];
  const priorStatuses = state.fundingPriorStatuses ?? {};
  let previous: FundingRecord | undefined;
  let next: FundingRecord;
  if (change.action === "addFunding") {
    const { action: _action, amountOre, ...values } = change;
    const serial = records.reduce((max, row) => Math.max(max, Number(row.publicRef.match(/^F-S\d{2}-(\d+)$/)?.[1]) || 0), 0);
    const amountNok = formatOre(BigInt(amountOre));
    next = { ...values, id: crypto.randomUUID(), publicRef: fundingReference(seasonCode, serial + 1), amountNok,
      revision: 0, earmarkedNok: "0.00", unrestrictedNok: amountNok, linkedItemCount: 0 };
  } else if (change.action === "editFunding" || change.action === "deleteFunding" || change.action === "restoreFunding") {
    const record = records.find(row => row.id === change.fundingId);
    if (!record) fail(404, "Funding was not found.");
    previous = record;
    if (previous.revision !== change.expectedRevision) fail(409, "This record was updated by someone else. Reload the page and try again.");
    if (change.action === "deleteFunding" && previous.status === "deleted") fail(409, "This funding is already deleted.");
    if (change.action === "restoreFunding" && previous.status !== "deleted") fail(409, "This funding is not deleted.");
    if (change.action === "editFunding") {
      const { amountOre, ...values } = change.values as Partial<NormalizedFunding>;
      next = { ...previous, ...values, amountNok: amountOre === undefined ? previous.amountNok : formatOre(BigInt(amountOre)) };
      if (next.status === "deleted" && previous.status !== "deleted"
        && Object.keys(next).some(key => key !== "status" && next[key as keyof FundingRecord] !== record[key as keyof FundingRecord])) {
        fail(400, deleteWithOtherChangesMessage, [{ field: "status", message: deleteWithOtherChangesMessage }]);
      }
    } else {
      next = { ...previous, status: change.action === "deleteFunding" ? "deleted" : priorStatuses[previous.id] ?? "applied" };
    }
    next.revision += 1;
  } else {
    fail(503, "This operation is unavailable. Try again later.");
  }
  const source = next.sourceName.trim().toLowerCase();
  if (next.status === "received" && (previous?.status !== "received"
    || previous.sourceName.trim().toLowerCase() !== source || previous.amountNok !== next.amountNok || previous.receivedDate !== next.receivedDate)
    && body[similarIncomeField] !== true
    && loadLocalIncomeReceipts(seasonCode, true).records?.some(row => row.voidReason === null
      && row.source.trim().toLowerCase() === source && row.amountNok === next.amountNok && (!next.receivedDate || row.receivedOn === next.receivedDate))) {
    fail(409, similarIncomePayment, [{ field: similarIncomeField, message: similarIncomePayment }]);
  }
  if (previous && previous.status !== "deleted" && next.status === "deleted") priorStatuses[next.id] = previous.status;
  if (next.status !== "deleted") delete priorStatuses[next.id];
  state.funding = previous ? records.map(record => record.id === next.id ? next : record) : [...records, next];
  state.fundingPriorStatuses = priorStatuses;
  const result: FinanceMutationResult = { ok: true, id: next.id, revision: next.revision, viewVersion: viewVersion + 1, warnings: [], errors: [] };
  state.fundingMutations = { ...state.fundingMutations, [requestId]: { fingerprint, result } };
  return result;
}
