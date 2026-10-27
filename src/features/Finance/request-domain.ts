import { addCalendarDays, parseIsoDate, parseNokToOre } from "./money.js";
import type { FinanceFieldError, RequestInput, RequestLineInput } from "./types.js";

export const LATE_REASON_MIN = 3;

/** Whole Oslo calendar days from start (inclusive) to end (exclusive) when end is after start. */
export function osloCalendarDaysBetween(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

/** True when the planned date is fewer than three whole Oslo calendar days from today (includes past dates). */
export function requiresLateReason(plannedDate: string, todayOslo: string): boolean {
  const daysUntil = osloCalendarDaysBetween(todayOslo, plannedDate);
  return daysUntil < LATE_REASON_MIN;
}

export function normalizeRequestInput(input: RequestInput, todayOslo: string): { ok: true; value: NormalizedRequest } | { ok: false; errors: FinanceFieldError[] } {
  const errors: FinanceFieldError[] = [];
  const supplierName = input.supplierName.trim();
  const justification = input.justification.trim();
  const plannedDate = input.plannedDate.trim();
  if (!supplierName || supplierName.length > 200) errors.push({ field: "supplierName", message: "Enter a supplier name." });
  if (justification.length < 10) errors.push({ field: "justification", message: "Enter a justification of at least 10 characters." });
  try {
    parseIsoDate(plannedDate);
  } catch {
    errors.push({ field: "plannedDate", message: "Enter a valid date." });
  }
  const lateReason = input.lateReason?.trim() ?? "";
  if (errors.length === 0 && requiresLateReason(plannedDate, todayOslo) && lateReason.length < 3) {
    errors.push({ field: "lateReason", message: "Explain why this purchase is planned within three calendar days." });
  }
  const lines: NormalizedRequestLine[] = [];
  input.lines.forEach((line: RequestLineInput, index: number) => {
    const normalized = normalizeLine(line, index + 1);
    if (!normalized.ok) errors.push(...normalized.errors);
    else lines.push(normalized.value);
  });
  if (lines.length === 0) errors.push({ field: "lines", message: "Add at least one budget line with a positive estimate." });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      supplierName,
      justification,
      plannedDate,
      lateReason: lateReason || null,
      lines,
    },
  };
}

export type NormalizedRequestLine = {
  budgetItemId: string;
  description: string;
  estimatedOre: bigint;
  ordinal: number;
};

export type NormalizedRequest = {
  supplierName: string;
  justification: string;
  plannedDate: string;
  lateReason: string | null;
  lines: NormalizedRequestLine[];
};

function normalizeLine(line: RequestLineInput, ordinal: number): { ok: true; value: NormalizedRequestLine } | { ok: false; errors: FinanceFieldError[] } {
  const errors: FinanceFieldError[] = [];
  const budgetItemId = line.budgetItemId.trim();
  const description = line.description.trim();
  if (!budgetItemId) errors.push({ field: "lines", line: ordinal, message: "Choose a budget item." });
  if (!description || description.length > 300) errors.push({ field: "lines", line: ordinal, message: "Enter a line description." });
  let estimatedOre: bigint | null = null;
  try {
    estimatedOre = parseNokToOre(line.estimatedNok);
    if (estimatedOre === null || estimatedOre <= 0n) errors.push({ field: "lines", line: ordinal, message: "Enter a positive line amount." });
  } catch {
    errors.push({ field: "lines", line: ordinal, message: "Enter a positive line amount." });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { budgetItemId, description, estimatedOre: estimatedOre!, ordinal } };
}

export function requestLifecycleCanSubmit(status: string): boolean {
  return status === "draft" || status === "rejected";
}

export function requestLifecycleCanWithdraw(status: string): boolean {
  return status === "submitted";
}

export function requestLifecycleCanCancel(status: string): boolean {
  return status === "draft" || status === "submitted" || status === "rejected";
}

export function requestLifecycleCanClose(status: string): boolean {
  return status === "approved";
}

export function requestLifecycleIsReadOnly(status: string): boolean {
  return status === "closed" || status === "cancelled";
}

/** For tests: planned date exactly on the third Oslo day boundary from today. */
export function thirdOsloDayFrom(todayOslo: string): string {
  return addCalendarDays(todayOslo, LATE_REASON_MIN);
}
