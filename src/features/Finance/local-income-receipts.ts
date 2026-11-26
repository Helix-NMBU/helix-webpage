import { duplicateIncomeReference, parseIncomeChange, type IncomeReceipt, type IncomeReceipts } from "./income-receipts";
import { formatOre, osloToday, parseNokToOre } from "./money";
import type { FinanceFieldError } from "./types";

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

export function loadLocalIncomeReceipts(seasonCode: string): IncomeReceipts {
  const records = readIncomeState().receipts
    .filter(row => row.seasonCode === seasonCode)
    .map(({ seasonCode: _seasonCode, ...row }) => row)
    .sort((first, second) => second.receivedOn.localeCompare(first.receivedOn));
  const receivedNok = formatOre(records.reduce((total, row) => total + (row.voidReason === null ? parseNokToOre(row.amountNok) ?? 0n : 0n), 0n));
  return { records, receivedNok };
}

function fail(message: string, status: number, errors: FinanceFieldError[] = []): never {
  throw Object.assign(new Error(message), { status, errors });
}

export function mutateLocalIncome(body: Record<string, unknown>, currentSeason: string) {
  const parsed = parseIncomeChange(body, osloToday());
  if (!parsed.change) fail(parsed.errors[0].message, 400, parsed.errors);
  const { change } = parsed;
  const state = readIncomeState();
  if (typeof body.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.requestId)) fail("A valid request ID is required.", 400);
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
    id = crypto.randomUUID();
    const { category, source, amountOre, receivedOn, method, reference } = change;
    state.receipts.unshift({ id, seasonCode: currentSeason, category, source, amountNok: formatOre(BigInt(amountOre)), receivedOn, method, reference, voidReason: null });
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
