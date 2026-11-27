import { formatOre, isSeasonCode, parseIsoDate, parseNokToOre } from "./money.js";
import type { FinanceFieldError } from "./types.js";

export const INCOME_CATEGORIES = {
  membership_dues: "Membership dues",
  sales: "Sales",
  donations: "Donations",
  other_income: "Other income",
} as const;
export type IncomeCategory = keyof typeof INCOME_CATEGORIES;

export const INCOME_METHODS = {
  bank_transfer: "Bank transfer",
  vipps: "Vipps",
  card: "Card",
  cash: "Cash",
  other: "Other",
} as const;
export type IncomeMethod = keyof typeof INCOME_METHODS;

export const INCOME_SOURCE_MAX = 120;
export const INCOME_REFERENCE_MAX = 100;
export const INCOME_REASON_MAX = 300;

export type IncomeReceipt = {
  id: string;
  category: IncomeCategory;
  source: string;
  amountNok: string;
  receivedOn: string;
  method: IncomeMethod;
  reference: string | null;
  voidReason: string | null;
};

export type DatedIncomeAmount = { receivedDate: string; amountNok: string };

export type IncomeReceipts = {
  receivedNok: string;
  receivedByDate: DatedIncomeAmount[];
  records?: IncomeReceipt[];
};

export function summarizeIncomeAmounts(amountsByDate: Map<string, bigint>): Omit<IncomeReceipts, "records"> {
  const receivedByDate = [...amountsByDate].sort(([first], [second]) => first.localeCompare(second))
    .map(([receivedDate, ore]) => ({ receivedDate, amountNok: formatOre(ore) }));
  const receivedNok = formatOre([...amountsByDate.values()].reduce((total, ore) => total + ore, 0n));
  return { receivedNok, receivedByDate };
}

export function summarizeIncomeReceipts(records: readonly IncomeReceipt[]): Omit<IncomeReceipts, "records"> {
  const amountsByDate = new Map<string, bigint>();
  for (const record of records) {
    if (record.voidReason !== null) continue;
    const amount = parseNokToOre(record.amountNok) ?? 0n;
    amountsByDate.set(record.receivedOn, (amountsByDate.get(record.receivedOn) ?? 0n) + amount);
  }
  return summarizeIncomeAmounts(amountsByDate);
}

export type IncomeInput = {
  category: IncomeCategory | "";
  source: string;
  amountNok: string;
  receivedOn: string;
  method: IncomeMethod | "";
  reference: string;
};

export type IncomeAction = "registerIncome" | "voidIncome";

type IncomeChange = {
  action: "registerIncome";
  seasonCode: string;
  category: IncomeCategory;
  source: string;
  amountOre: string;
  receivedOn: string;
  method: IncomeMethod;
  reference: string | null;
} | {
  action: "voidIncome";
  seasonCode: string;
  receiptId: string;
  reason: string;
};

export function isIncomeAction(value: unknown): value is IncomeAction {
  return value === "registerIncome" || value === "voidIncome";
}

export const duplicateIncomeReference = "That payment reference is already registered for this method and season.";
export const similarIncomeField = "acceptSimilarIncome";
export const similarIncomePayment = "A payment with a matching source and amount is already recorded. Check the dates in the register and financing before continuing.";

export function parseIncomeChange(body: Record<string, unknown>, today: string):
  { change: IncomeChange; errors?: never } | { change?: never; errors: FinanceFieldError[] } {
  const { action, seasonCode } = body;
  if (typeof seasonCode !== "string" || !isSeasonCode(seasonCode)) {
    return { errors: [{ field: "seasonCode", message: "Choose a valid season." }] };
  }
  if (action === "voidIncome") {
    const receiptId = typeof body.receiptId === "string" ? body.receiptId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(receiptId)) {
      return { errors: [{ field: "receiptId", message: "Choose a valid income entry." }] };
    }
    if (!reason || reason.length > INCOME_REASON_MAX) {
      return { errors: [{ field: "reason", message: "Enter a reason for voiding this payment." }] };
    }
    return { change: { action, seasonCode, receiptId, reason } };
  }
  if (action !== "registerIncome") return { errors: [{ field: "action", message: "Choose a valid income action." }] };

  const category = typeof body.category === "string" && Object.prototype.hasOwnProperty.call(INCOME_CATEGORIES, body.category)
    ? body.category as IncomeCategory : null;
  const method = typeof body.method === "string" && Object.prototype.hasOwnProperty.call(INCOME_METHODS, body.method)
    ? body.method as IncomeMethod : null;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  let amount: bigint | null = null;
  let receivedOn: string | null = null;
  try { amount = parseNokToOre(typeof body.amountNok === "string" ? body.amountNok : ""); } catch { /* Validated below. */ }
  try { receivedOn = parseIsoDate(typeof body.receivedOn === "string" ? body.receivedOn : ""); } catch { /* Validated below. */ }

  const errors: FinanceFieldError[] = [];
  if (!category) errors.push({ field: "category", message: "Choose an income type." });
  if (!source || source.length > INCOME_SOURCE_MAX) errors.push({ field: "source", message: "Enter the payer, group or sale this payment came from." });
  if (amount === null || amount <= 0n) errors.push({ field: "amountNok", message: "Enter a positive amount in NOK." });
  if (!receivedOn || receivedOn > today) errors.push({ field: "receivedOn", message: "Enter a date on or before today." });
  if (!method) errors.push({ field: "method", message: "Choose a payment method." });
  if (reference.length > INCOME_REFERENCE_MAX || (body.reference != null && typeof body.reference !== "string")) {
    errors.push({ field: "reference", message: "Enter a transaction reference of up to 100 characters." });
  }
  if (errors.length || !category || !method || amount === null || !receivedOn) return { errors };

  return { change: { action, seasonCode, category, source, amountOre: amount.toString(), receivedOn, method, reference: reference || null } };
}
