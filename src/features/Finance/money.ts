const CURRENCY = /^(?:nok|kr)\s*/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class FinanceMoneyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function formatOre(ore: bigint): string {
  const negative = ore < 0n;
  const abs = negative ? -ore : ore;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function formatOreNb(ore: bigint): string {
  const canonical = formatOre(ore);
  const negative = canonical.startsWith("-");
  const [whole, fraction] = canonical.slice(negative ? 1 : 0).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${negative ? "-" : ""}${grouped},${fraction}`;
}

export function parseNokToOre(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let text = trimmed.replace(CURRENCY, "").replace(/[\s\u00a0\u202f]/g, "");
  if (!text) return null;
  const negative = text.startsWith("-");
  if (negative || text.startsWith("+")) text = text.slice(1);
  if (!text) throw new FinanceMoneyError("Enter a valid amount.");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    text = text.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new FinanceMoneyError("Enter a valid amount.");
  const [whole, fraction = ""] = text.split(".");
  if (whole.length > 15) throw new FinanceMoneyError("Enter a valid amount.");
  const ore = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -ore : ore;
}

/** Half away from zero at two decimals, including the 1.005 binary case. */
export function oreFromNumber(value: number): bigint {
  if (!Number.isFinite(value)) throw new FinanceMoneyError("Enter a valid amount.");
  const negative = value < 0;
  const scaled = Math.round(Math.abs(value) * 100 + 1e-8);
  const ore = BigInt(scaled);
  return negative ? -ore : ore;
}

export function exceedsApprovalThreshold(amountOre: bigint, thresholdOre: bigint): boolean {
  return amountOre > thresholdOre;
}

export function parseIsoDate(value: string): string {
  const match = ISO_DATE.exec(value);
  if (!match) throw new FinanceMoneyError("Enter a valid date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new FinanceMoneyError("Enter a valid date.");
  }
  return value;
}

export function osloToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new FinanceMoneyError("Enter a valid date.");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  if (!Number.isInteger(days)) throw new FinanceMoneyError("Enter a valid date.");
  const parsed = parseIsoDate(isoDate);
  const [year, month, day] = parsed.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function isSeasonCode(value: string): boolean {
  return /^S[0-9]{2}$/.test(value);
}

export function isSystemCode(value: string): boolean {
  return /^SYS-[A-Z0-9]+$/.test(value);
}

function sequence(value: number, width: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw new FinanceMoneyError("Enter a valid reference.");
  const text = String(value);
  return text.length >= width ? text : text.padStart(width, "0");
}

export function budgetReference(season: string): string {
  if (!isSeasonCode(season)) throw new FinanceMoneyError("Enter a valid reference.");
  return `B-${season}`;
}

export function budgetItemReference(season: string, ordinal: number): string {
  if (!isSeasonCode(season)) throw new FinanceMoneyError("Enter a valid reference.");
  return `BI-${season}-${sequence(ordinal, 3)}`;
}

export function unallocatedItemReference(season: string, systemCode: string): string {
  if (!isSeasonCode(season) || !isSystemCode(systemCode)) throw new FinanceMoneyError("Enter a valid reference.");
  return `BI-${season}-${systemCode.slice(4)}-UNALLOC`;
}

export function fundingReference(season: string, ordinal: number): string {
  if (!isSeasonCode(season)) throw new FinanceMoneyError("Enter a valid reference.");
  return `F-${season}-${sequence(ordinal, 3)}`;
}

export function earmarkReference(ordinal: number): string {
  return `FE-${sequence(ordinal, 3)}`;
}

export function purchaseReference(year: number, ordinal: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new FinanceMoneyError("Enter a valid reference.");
  return `${year}-${sequence(ordinal, 4)}`;
}

export function lineReference(purchase: string, ordinal: number): string {
  return `${purchase}-L${sequence(ordinal, 1)}`;
}

export function allocationReference(line: string, ordinal: number): string {
  return `${line}-A${sequence(ordinal, 1)}`;
}

export function documentReference(purchase: string, ordinal: number): string {
  return `${purchase}-D${sequence(ordinal, 1)}`;
}

export function requestReference(season: string, ordinal: number): string {
  if (!isSeasonCode(season)) throw new FinanceMoneyError("Enter a valid reference.");
  return `RQ-${season}-${sequence(ordinal, 3)}`;
}

export function nextAnnualReferenceStart(currentNext: bigint | null, lastIssued: bigint | null, requested: bigint): bigint {
  if (requested <= 0n) throw new FinanceMoneyError("Enter a valid reference.");
  if (lastIssued !== null && requested <= lastIssued) throw new FinanceMoneyError("Reference start would reuse an issued value.");
  if (currentNext !== null && requested < currentNext) throw new FinanceMoneyError("Reference start must not move backward.");
  return requested;
}
