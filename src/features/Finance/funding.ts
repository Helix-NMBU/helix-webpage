import type { FinanceFieldError, FinanceWarning, FundingConfidence, FundingStatus, FundingType } from "./types.js";
import { formatOre, parseIsoDate, parseNokToOre } from "./money.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FUNDING_TYPES: readonly FundingType[] = ["sponsor_cash", "grant", "membership", "other"];
export const FUNDING_STATUSES: readonly FundingStatus[] = ["prospect", "applied", "secured", "received", "rejected", "deleted"];
export const FUNDING_CONFIDENCE: readonly FundingConfidence[] = ["high", "medium", "low"];

const FUNDING_ACTIONS = ["addFunding", "editFunding", "deleteFunding", "restoreFunding", "addEarmark", "editEarmark"] as const;
export type FundingAction = (typeof FUNDING_ACTIONS)[number];

export function isFundingAction(value: string): value is FundingAction {
  return (FUNDING_ACTIONS as readonly string[]).includes(value);
}

export type NormalizedFunding = {
  sourceName: string;
  ownerName: string;
  fundingType: FundingType;
  amountOre: string;
  status: FundingStatus;
  confidence: FundingConfidence | null;
  expectedDate: string | null;
  receivedDate: string | null;
  ownerEmail: string | null;
  reportingRequired: boolean;
  agreementLink: string | null;
  note: string | null;
};

export type NormalizedPart = {
  purpose: string;
  amountOre: string;
  spendBy: string | null;
  conditions: string | null;
};

export type FundingChange =
  | ({ action: "addFunding" } & NormalizedFunding)
  | { action: "editFunding"; fundingId: string; expectedRevision: number; fields: string[]; values: Record<string, string | boolean | null> }
  | { action: "deleteFunding"; fundingId: string; expectedRevision: number }
  | { action: "restoreFunding"; fundingId: string; expectedRevision: number }
  | ({ action: "addEarmark"; fundingId: string; expectedRevision: number } & NormalizedPart)
  | { action: "editEarmark"; partId: string; expectedRevision: number; fields: string[]; values: Record<string, string | null> };

export type FundingParseResult = { ok: true; change: FundingChange } | { ok: false; errors: FinanceFieldError[] };

type ErrorBag = { errors: FinanceFieldError[] };

function fail(bag: ErrorBag, field: string, message: string) {
  bag.errors.push({ field, message });
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalText(bag: ErrorBag, field: string, value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    fail(bag, field, "Enter text.");
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    fail(bag, field, `Use at most ${max} characters.`);
    return undefined;
  }
  return trimmed;
}

function requiredText(bag: ErrorBag, field: string, value: unknown, max: number, label: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    fail(bag, field, `Enter ${label}.`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    fail(bag, field, `Use at most ${max} characters.`);
    return undefined;
  }
  return trimmed;
}

function oneOf<T extends string>(bag: ErrorBag, field: string, value: unknown, allowed: readonly T[], label: string): T | undefined {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(bag, field, `Choose a valid ${label}.`);
    return undefined;
  }
  return value as T;
}

function positiveOre(bag: ErrorBag, field: string, value: unknown): string | undefined {
  if (typeof value !== "string") {
    fail(bag, field, "Enter an amount.");
    return undefined;
  }
  try {
    const ore = parseNokToOre(value);
    if (ore === null) {
      fail(bag, field, "Enter an amount.");
      return undefined;
    }
    if (ore <= 0n) {
      fail(bag, field, "Enter an amount greater than zero.");
      return undefined;
    }
    return ore.toString();
  } catch {
    fail(bag, field, "Enter a valid amount.");
    return undefined;
  }
}

function optionalDate(bag: ErrorBag, field: string, value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return parseIsoDate(value.trim());
  } catch {
    fail(bag, field, "Enter a valid date.");
    return undefined;
  }
}

function optionalEmail(bag: ErrorBag, value: unknown): string | null | undefined {
  const parsed = optionalText(bag, "ownerEmail", value, 200);
  if (parsed === undefined || parsed === null) return parsed;
  if (!EMAIL.test(parsed)) {
    fail(bag, "ownerEmail", "Enter a valid email address.");
    return undefined;
  }
  return parsed;
}

function optionalLink(bag: ErrorBag, value: unknown): string | null | undefined {
  const parsed = optionalText(bag, "agreementLink", value, 2000);
  if (parsed === undefined || parsed === null) return parsed;
  try {
    const url = new URL(parsed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      fail(bag, "agreementLink", "Enter an http or https link.");
      return undefined;
    }
  } catch {
    fail(bag, "agreementLink", "Enter an http or https link.");
    return undefined;
  }
  return parsed;
}

function fundingValues(bag: ErrorBag, input: Record<string, unknown>, defaults: boolean): Partial<NormalizedFunding> {
  const values: Partial<NormalizedFunding> = {};
  if (input.sourceName !== undefined || defaults) values.sourceName = requiredText(bag, "sourceName", input.sourceName, 200, "a source name");
  if (input.ownerName !== undefined || defaults) values.ownerName = requiredText(bag, "ownerName", input.ownerName, 200, "an owner name");
  if (input.fundingType !== undefined) values.fundingType = oneOf(bag, "fundingType", input.fundingType, FUNDING_TYPES, "funding type");
  else if (defaults) values.fundingType = "sponsor_cash";
  if (input.amountNok !== undefined || defaults) values.amountOre = positiveOre(bag, "amountNok", input.amountNok);
  if (input.status !== undefined) values.status = oneOf(bag, "status", input.status, FUNDING_STATUSES, "status");
  else if (defaults) values.status = "applied";
  if (input.confidence !== undefined) {
    if (input.confidence === null || input.confidence === "") values.confidence = null;
    else values.confidence = oneOf(bag, "confidence", input.confidence, FUNDING_CONFIDENCE, "confidence");
  } else if (defaults) values.confidence = null;
  if (input.expectedDate !== undefined || defaults) values.expectedDate = optionalDate(bag, "expectedDate", input.expectedDate ?? null) ?? null;
  if (input.receivedDate !== undefined || defaults) values.receivedDate = optionalDate(bag, "receivedDate", input.receivedDate ?? null) ?? null;
  if (input.ownerEmail !== undefined || defaults) values.ownerEmail = optionalEmail(bag, input.ownerEmail ?? null) ?? null;
  if (input.reportingRequired !== undefined) {
    if (typeof input.reportingRequired !== "boolean") fail(bag, "reportingRequired", "Choose whether reporting is required.");
    else values.reportingRequired = input.reportingRequired;
  } else if (defaults) values.reportingRequired = false;
  if (input.agreementLink !== undefined || defaults) values.agreementLink = optionalLink(bag, input.agreementLink ?? null) ?? null;
  if (input.note !== undefined || defaults) values.note = optionalText(bag, "note", input.note ?? null, 4000) ?? null;
  return values;
}

const FUNDING_FIELD_KEYS = ["sourceName", "ownerName", "fundingType", "amountNok", "status", "confidence", "expectedDate", "receivedDate", "ownerEmail", "reportingRequired", "agreementLink", "note"] as const;

function presentFundingFields(input: Record<string, unknown>): Record<string, unknown> {
  const present: Record<string, unknown> = {};
  for (const key of FUNDING_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) present[key] = input[key];
  }
  return present;
}

function uuidField(bag: ErrorBag, field: string, value: unknown, label: string): string | undefined {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail(bag, field, `Choose a valid ${label}.`);
    return undefined;
  }
  return value;
}

function revisionField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function partValues(bag: ErrorBag, input: Record<string, unknown>, defaults: boolean): Partial<NormalizedPart> {
  const values: Partial<NormalizedPart> = {};
  if (input.purpose !== undefined || defaults) values.purpose = requiredText(bag, "purpose", input.purpose, 300, "a purpose");
  if (input.amountNok !== undefined || defaults) values.amountOre = positiveOre(bag, "amountNok", input.amountNok);
  if (input.spendBy !== undefined || defaults) values.spendBy = optionalDate(bag, "spendBy", input.spendBy ?? null) ?? null;
  if (input.conditions !== undefined || defaults) values.conditions = optionalText(bag, "conditions", input.conditions ?? null, 4000) ?? null;
  return values;
}

function toFundingValues(values: Partial<NormalizedFunding>): Record<string, string | boolean | null> {
  const stored: Record<string, string | boolean | null> = {};
  if (values.sourceName !== undefined) stored.sourceName = values.sourceName;
  if (values.ownerName !== undefined) stored.ownerName = values.ownerName;
  if (values.fundingType !== undefined) stored.fundingType = values.fundingType;
  if (values.amountOre !== undefined) stored.amountOre = values.amountOre;
  if (values.status !== undefined) stored.status = values.status;
  if (values.confidence !== undefined) stored.confidence = values.confidence;
  if (values.expectedDate !== undefined) stored.expectedDate = values.expectedDate;
  if (values.receivedDate !== undefined) stored.receivedDate = values.receivedDate;
  if (values.ownerEmail !== undefined) stored.ownerEmail = values.ownerEmail;
  if (values.reportingRequired !== undefined) stored.reportingRequired = values.reportingRequired;
  if (values.agreementLink !== undefined) stored.agreementLink = values.agreementLink;
  if (values.note !== undefined) stored.note = values.note;
  return stored;
}

export function parseFundingChange(body: Record<string, unknown>): FundingParseResult {
  const action = body.action;
  if (typeof action !== "string" || !isFundingAction(action)) return { ok: false, errors: [{ field: "action", message: "Unknown request." }] };
  const bag: ErrorBag = { errors: [] };
  if (action === "addFunding") {
    const input = record(body.funding);
    if (!input) return { ok: false, errors: [{ field: "funding", message: "Enter the funding details." }] };
    const values = fundingValues(bag, input, true);
    if (bag.errors.length || !values.sourceName || !values.ownerName || !values.fundingType || !values.amountOre || !values.status || values.reportingRequired === undefined) {
      return { ok: false, errors: bag.errors };
    }
    return { ok: true, change: { action, sourceName: values.sourceName, ownerName: values.ownerName, fundingType: values.fundingType, amountOre: values.amountOre, status: values.status, confidence: values.confidence ?? null, expectedDate: values.expectedDate ?? null, receivedDate: values.receivedDate ?? null, ownerEmail: values.ownerEmail ?? null, reportingRequired: values.reportingRequired, agreementLink: values.agreementLink ?? null, note: values.note ?? null } };
  }
  if (action === "editFunding") {
    const fundingId = uuidField(bag, "fundingId", body.fundingId, "funding record");
    const expectedRevision = revisionField(body.expectedRevision);
    if (expectedRevision === undefined) fail(bag, "expectedRevision", "A valid revision is required.");
    const input = record(body.patch);
    if (!input) fail(bag, "patch", "Enter the funding changes.");
    if (input && Object.prototype.hasOwnProperty.call(input, "fundingId")) fail(bag, "fundingId", "A funding record cannot move to another season.");
    const present = input ? presentFundingFields(input) : {};
    const values = input ? fundingValues(bag, present, false) : {};
    const stored = toFundingValues(values);
    if (input && Object.keys(stored).length === 0 && bag.errors.length === 0) fail(bag, "patch", "Enter a funding change.");
    if (bag.errors.length || !fundingId || expectedRevision === undefined) return { ok: false, errors: bag.errors };
    return { ok: true, change: { action, fundingId, expectedRevision, fields: Object.keys(stored), values: stored } };
  }
  if (action === "deleteFunding" || action === "restoreFunding") {
    const fundingId = uuidField(bag, "fundingId", body.fundingId, "funding record");
    const expectedRevision = revisionField(body.expectedRevision);
    if (expectedRevision === undefined) fail(bag, "expectedRevision", "A valid revision is required.");
    if (bag.errors.length || !fundingId || expectedRevision === undefined) return { ok: false, errors: bag.errors };
    return { ok: true, change: { action, fundingId, expectedRevision } };
  }
  if (action === "addEarmark") {
    const fundingId = uuidField(bag, "fundingId", record(body.part)?.fundingId, "funding record");
    const expectedRevision = revisionField(body.expectedRevision);
    if (expectedRevision === undefined) fail(bag, "expectedRevision", "A valid revision is required.");
    const input = record(body.part);
    if (!input) return { ok: false, errors: [...bag.errors, { field: "part", message: "Enter the earmarked part." }] };
    const values = partValues(bag, input, true);
    if (bag.errors.length || !fundingId || expectedRevision === undefined || !values.purpose || !values.amountOre) return { ok: false, errors: bag.errors };
    return { ok: true, change: { action, fundingId, expectedRevision, purpose: values.purpose, amountOre: values.amountOre, spendBy: values.spendBy ?? null, conditions: values.conditions ?? null } };
  }
  const partId = uuidField(bag, "partId", body.partId, "earmarked part");
  const expectedRevision = revisionField(body.expectedRevision);
  if (expectedRevision === undefined) fail(bag, "expectedRevision", "A valid revision is required.");
  const input = record(body.patch);
  if (!input) fail(bag, "patch", "Enter the part changes.");
  if (input && Object.prototype.hasOwnProperty.call(input, "fundingId")) fail(bag, "fundingId", "A part cannot move to another funding source.");
  const values = input ? partValues(bag, input, false) : {};
  const stored: Record<string, string | null> = {};
  if (values.purpose !== undefined) stored.purpose = values.purpose;
  if (values.amountOre !== undefined) stored.amountOre = values.amountOre;
  if (values.spendBy !== undefined) stored.spendBy = values.spendBy;
  if (values.conditions !== undefined) stored.conditions = values.conditions;
  if (input && Object.keys(stored).length === 0 && bag.errors.length === 0 && !Object.prototype.hasOwnProperty.call(input, "fundingId")) fail(bag, "patch", "Enter a part change.");
  if (bag.errors.length || !partId || expectedRevision === undefined) return { ok: false, errors: bag.errors };
  return { ok: true, change: { action: "editEarmark", partId, expectedRevision, fields: Object.keys(stored), values: stored } };
}

export function fundingWarnings(excessOre: bigint, linkedItemCount: number): FinanceWarning[] {
  const warnings: FinanceWarning[] = [];
  if (excessOre > 0n) warnings.push({ message: `Earmarked parts exceed this funding by ${formatOre(excessOre)} NOK.` });
  if (linkedItemCount > 0) {
    const noun = linkedItemCount === 1 ? "budget item that is not cancelled" : "budget items that are not cancelled";
    warnings.push({ message: `This funding still pays for ${linkedItemCount} ${noun}.` });
  }
  return warnings;
}

export function derivePartUsage(amountOre: bigint, eligibleSpentOre: bigint, spendBy: string | null, today: string) {
  const eligible = eligibleSpentOre > 0n ? eligibleSpentOre : 0n;
  const usedOre = eligible > amountOre ? amountOre : eligible;
  const leftOre = amountOre - usedOre;
  const overdue = spendBy !== null && today > spendBy;
  return { usedOre, leftOre, overdue, mustReturnOre: overdue ? leftOre : 0n };
}

export function earmarkedOre(partOre: readonly bigint[]): bigint {
  return partOre.reduce((sum, value) => sum + value, 0n);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
}

export function fundingTypeLabel(value: FundingType): string {
  if (value === "sponsor_cash") return "Sponsor cash";
  if (value === "grant") return "Grant";
  if (value === "membership") return "Membership";
  return "Other";
}

export function fundingStatusLabel(value: FundingStatus | FundingConfidence): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
