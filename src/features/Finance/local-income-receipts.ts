import { duplicateIncomeReference, parseIncomeChange, similarIncomeField, similarIncomePayment, summarizeIncomeReceipts, type IncomeReceipt, type IncomeReceipts } from "./income-receipts";
import { formatOre, osloToday } from "./money";
import type { FinanceFieldError, FundingRecord } from "./types";

const key = "helix-finance-local-income-receipts-v1";
type LocalReceipt = IncomeReceipt & { seasonCode: string };
type IncomeState = {
  version: number;
  receipts: LocalReceipt[];
  mutations: Record<string, { fingerprint: string; id: string }>;
};

function readIncomeState(): IncomeState {
  const raw = localStorage.getItem(key);
  if (!raw) return { version: 0, receipts: [], mutations: {} };
  const saved = JSON.parse(raw) as Omit<IncomeState, "receipts"> & {
    receipts: Array<Omit<LocalReceipt, "category"> & { category: LocalReceipt["category"] | "merch" | "other_sales" }>;
  };
  return {
    ...saved,
    receipts: saved.receipts.map(row => ({
      ...row,
      category: row.category === "merch" || row.category === "other_sales" ? "sales" : row.category,
    })),
  };
}

export function localIncomeVersion() {
  return readIncomeState().version;
}

export function loadLocalIncomeReceipts(seasonCode: string, includeDetails: boolean): IncomeReceipts {
  const records = readIncomeState().receipts
    .filter(row => row.seasonCode === seasonCode)
    .map(({ seasonCode: _seasonCode, ...row }) => row)
    .sort((first, second) => second.receivedOn.localeCompare(first.receivedOn));
  return { ...summarizeIncomeReceipts(records), ...(includeDetails ? { records } : {}) };
}

function fail(message: string, status: number, errors: FinanceFieldError[] = []): never {
  throw Object.assign(new Error(message), { status, errors });
}

export function mutateLocalIncome(body: Record<string, unknown>, currentSeason: string, funding: readonly FundingRecord[]) {
  const parsed = parseIncomeChange(body, osloToday());
  if (!parsed.change) fail(parsed.errors[0].message, 400, parsed.errors);
  const { change } = parsed;
  const state = readIncomeState();
  if (typeof body.requestId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.requestId)) fail("A valid request ID is required.", 400);
  const fingerprint = JSON.stringify(change);
  const previous = state.mutations[body.requestId];
  if (previous) {
    if (previous.fingerprint !== fingerprint) fail("This request ID was already used for a different change.", 409);
    return previous.id;
  }
  if (change.seasonCode !== currentSeason) fail("The finance season changed. Reload Income & Spend and try again.", 409);

  let id: string;
  if (change.action === "registerIncome") {
    if (change.reference && state.receipts.some(row => row.voidReason === null
      && row.seasonCode === currentSeason && row.method === change.method
      && row.reference?.toLowerCase() === change.reference?.toLowerCase())) {
      fail(duplicateIncomeReference, 409, [{ field: "reference", message: duplicateIncomeReference }]);
    }
    const { category, source, amountOre, receivedOn, method, reference } = change;
    const amountNok = formatOre(BigInt(amountOre));
    const similar = state.receipts.some(row => row.voidReason === null && row.seasonCode === currentSeason
      && row.method === method && (!row.reference || !reference) && row.receivedOn === receivedOn
      && row.amountNok === amountNok && row.source.toLowerCase() === source.toLowerCase())
      || funding.some(row => row.status === "received" && (!row.receivedDate || row.receivedDate === receivedOn)
        && row.amountNok === amountNok && row.sourceName.trim().toLowerCase() === source.toLowerCase());
    if (similar && body[similarIncomeField] !== true) {
      fail(similarIncomePayment, 409, [{ field: similarIncomeField, message: similarIncomePayment }]);
    }
    id = crypto.randomUUID();
    state.receipts.unshift({ id, seasonCode: currentSeason, category, source, amountNok, receivedOn, method, reference, voidReason: null });
  } else {
    const receipt = state.receipts.find(row => row.id === change.receiptId && row.seasonCode === currentSeason && row.voidReason === null);
    if (!receipt) fail("This income entry is no longer available to void. Reload Income & Spend.", 409);
    id = receipt.id;
    receipt.voidReason = change.reason;
  }
  state.mutations[body.requestId] = { fingerprint, id };
  state.version += 1;
  localStorage.setItem(key, JSON.stringify(state));
  return id;
}
