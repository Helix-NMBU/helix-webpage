import { FinanceMoneyError, parseIsoDate, parseNokToOre } from "./money.js";
import type { BudgetItemPriority, BudgetItemReuse, BudgetItemStatus, FinanceFieldError } from "./types.js";

export const BUDGET_ITEM_CATEGORIES = [
  "material",
  "component",
  "tooling",
  "manufacturing_service",
  "travel",
  "fees",
  "marketing",
  "other",
] as const;

export type BudgetItemCategory = (typeof BUDGET_ITEM_CATEGORIES)[number];

export const MANUAL_ITEM_DEFAULTS = {
  priority: "P1",
  category: "material",
  reuseStatus: "new",
  status: "planned",
} as const;

const PRIORITIES = ["P1", "P2", "P3", "P4", "EM"] as const;
const REUSES = ["new", "reuse", "inspect", "consumable"] as const;
const OPEN_STATUSES = ["planned", "active", "done"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

export type NormalizedBudgetItem = {
  systemId: string;
  description: string;
  category: BudgetItemCategory;
  plannedOre: bigint;
  priority: BudgetItemPriority;
  reuseStatus: BudgetItemReuse;
  expectedPurchaseDate: string | null;
  ownerEmail: string | null;
  status: Exclude<BudgetItemStatus, "cancelled">;
  note: string | null;
  earmarkId: string | null;
};

export type ItemPatch = Partial<NormalizedBudgetItem>;

export function compareNb(left: string, right: string): number {
  return left.localeCompare(right, "nb") || left.localeCompare(right, "en");
}

/** Department order is sort_order, then name, then department id. */
export function compareDepartmentOrder(
  left: { sortOrder: number; name: string; departmentKey: string },
  right: { sortOrder: number; name: string; departmentKey: string },
): number {
  return left.sortOrder - right.sortOrder || compareNb(left.name, right.name) || compareNb(left.departmentKey, right.departmentKey);
}

export function effectivePlanOre(plannedOre: bigint, status: BudgetItemStatus, unallocated: boolean): bigint {
  if (unallocated || status === "cancelled") return 0n;
  return plannedOre;
}

export function differenceOre(effectivePlan: bigint, actualOre: bigint): bigint {
  return effectivePlan - actualOre;
}

export function protectedItemFieldsChanged(current: Pick<NormalizedBudgetItem, "plannedOre" | "priority" | "earmarkId">, patch: ItemPatch): boolean {
  if (patch.plannedOre !== undefined && patch.plannedOre !== current.plannedOre) return true;
  if (patch.priority !== undefined && patch.priority !== current.priority) return true;
  if (patch.earmarkId !== undefined && patch.earmarkId !== current.earmarkId) return true;
  return false;
}

function fieldError(field: string, message: string): FinanceFieldError {
  return { field, message };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function present(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function category(value: string): value is BudgetItemCategory {
  return (BUDGET_ITEM_CATEGORIES as readonly string[]).includes(value);
}

function priority(value: string): value is BudgetItemPriority {
  return (PRIORITIES as readonly string[]).includes(value);
}

function reuse(value: string): value is BudgetItemReuse {
  return (REUSES as readonly string[]).includes(value);
}

function openStatus(value: string): value is Exclude<BudgetItemStatus, "cancelled"> {
  return (OPEN_STATUSES as readonly string[]).includes(value);
}

function readOptionalText(errors: FinanceFieldError[], record: Record<string, unknown>, key: string, label: string, max: number): string | null | undefined {
  if (!present(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push(fieldError(key, `Enter a valid ${label}.`));
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    errors.push(fieldError(key, `Enter a shorter ${label}.`));
    return undefined;
  }
  return trimmed;
}

export function normalizeManualItem(input: unknown): { item?: NormalizedBudgetItem; errors: FinanceFieldError[] } {
  const errors: FinanceFieldError[] = [];
  const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  if (input === null || typeof input !== "object" || Array.isArray(input)) errors.push(fieldError("item", "Enter the budget item."));
  const systemId = text(record.systemId);
  if (!UUID.test(systemId)) errors.push(fieldError("systemId", "Choose a system."));
  const description = text(record.description);
  if (!description || description.length > 300) errors.push(fieldError("description", "Enter a description."));
  const categoryText = text(record.category) || MANUAL_ITEM_DEFAULTS.category;
  if (!category(categoryText)) errors.push(fieldError("category", "Choose a category."));
  let plannedOre = 0n;
  if (!present(record, "plannedNok") || text(record.plannedNok) === "") errors.push(fieldError("plannedNok", "Enter an amount."));
  else {
    try {
      const parsed = parseNokToOre(text(record.plannedNok));
      if (parsed === null || parsed < 0n) errors.push(fieldError("plannedNok", "Enter an amount of zero or more."));
      else plannedOre = parsed;
    } catch (error) {
      errors.push(fieldError("plannedNok", error instanceof FinanceMoneyError ? error.message : "Enter a valid amount."));
    }
  }
  const priorityText = text(record.priority) || MANUAL_ITEM_DEFAULTS.priority;
  if (!priority(priorityText)) errors.push(fieldError("priority", "Choose a priority."));
  const reuseText = text(record.reuseStatus) || MANUAL_ITEM_DEFAULTS.reuseStatus;
  if (!reuse(reuseText)) errors.push(fieldError("reuseStatus", "Choose a reuse status."));
  const statusText = text(record.status) || MANUAL_ITEM_DEFAULTS.status;
  if (statusText === "cancelled") errors.push(fieldError("status", "Use cancel to cancel an item."));
  else if (!openStatus(statusText)) errors.push(fieldError("status", "Choose a status."));
  let expectedPurchaseDate: string | null = null;
  if (present(record, "expectedPurchaseDate") && record.expectedPurchaseDate !== null && text(record.expectedPurchaseDate) !== "") {
    try { expectedPurchaseDate = parseIsoDate(text(record.expectedPurchaseDate)); }
    catch (error) { errors.push(fieldError("expectedPurchaseDate", error instanceof FinanceMoneyError ? error.message : "Enter a valid date.")); }
  }
  let ownerEmail: string | null = null;
  const email = readOptionalText(errors, record, "ownerEmail", "email address", 200);
  if (email) {
    if (!EMAIL.test(email)) errors.push(fieldError("ownerEmail", "Enter a valid email address."));
    else ownerEmail = email;
  }
  const note = readOptionalText(errors, record, "note", "note", 2000) ?? null;
  let earmarkId: string | null = null;
  if (present(record, "earmarkId") && record.earmarkId !== null && text(record.earmarkId) !== "") {
    earmarkId = text(record.earmarkId);
    if (!UUID.test(earmarkId)) errors.push(fieldError("earmarkId", "Choose an earmarked part."));
  }
  if (priority(priorityText) && priorityText === "EM" && !earmarkId) errors.push(fieldError("earmarkId", "Choose an earmarked part for this item."));
  if (priority(priorityText) && priorityText !== "EM" && earmarkId) errors.push(fieldError("earmarkId", "Clear the earmarked part unless the priority is EM."));
  if (errors.length || !category(categoryText) || !priority(priorityText) || !reuse(reuseText) || !openStatus(statusText)) return { errors };
  return {
    errors,
    item: {
      systemId,
      description,
      category: categoryText,
      plannedOre,
      priority: priorityText,
      reuseStatus: reuseText,
      expectedPurchaseDate,
      ownerEmail,
      status: statusText,
      note,
      earmarkId,
    },
  };
}

const PATCH_KEYS = new Set([
  "systemId", "description", "category", "plannedNok", "priority", "reuseStatus",
  "expectedPurchaseDate", "ownerEmail", "status", "note", "earmarkId",
]);

export function normalizeItemPatch(input: unknown): { patch?: ItemPatch; errors: FinanceFieldError[] } {
  const errors: FinanceFieldError[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: [fieldError("patch", "Enter the fields to change.")] };
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!PATCH_KEYS.has(key)) errors.push(fieldError(key, "This field cannot be changed."));
  }
  const patch: ItemPatch = {};
  if (present(record, "systemId")) {
    const systemId = text(record.systemId);
    if (!UUID.test(systemId)) errors.push(fieldError("systemId", "Choose a system."));
    else patch.systemId = systemId;
  }
  if (present(record, "description")) {
    const description = text(record.description);
    if (!description || description.length > 300) errors.push(fieldError("description", "Enter a description."));
    else patch.description = description;
  }
  if (present(record, "category")) {
    const categoryText = text(record.category);
    if (!category(categoryText)) errors.push(fieldError("category", "Choose a category."));
    else patch.category = categoryText;
  }
  if (present(record, "plannedNok")) {
    try {
      const parsed = parseNokToOre(text(record.plannedNok));
      if (parsed === null || parsed < 0n) errors.push(fieldError("plannedNok", "Enter an amount of zero or more."));
      else patch.plannedOre = parsed;
    } catch (error) {
      errors.push(fieldError("plannedNok", error instanceof FinanceMoneyError ? error.message : "Enter a valid amount."));
    }
  }
  if (present(record, "priority")) {
    const priorityText = text(record.priority);
    if (!priority(priorityText)) errors.push(fieldError("priority", "Choose a priority."));
    else patch.priority = priorityText;
  }
  if (present(record, "reuseStatus")) {
    const reuseText = text(record.reuseStatus);
    if (!reuse(reuseText)) errors.push(fieldError("reuseStatus", "Choose a reuse status."));
    else patch.reuseStatus = reuseText;
  }
  if (present(record, "status")) {
    const statusText = text(record.status);
    if (statusText === "cancelled") errors.push(fieldError("status", "Use cancel to cancel an item."));
    else if (!openStatus(statusText)) errors.push(fieldError("status", "Choose a status."));
    else patch.status = statusText;
  }
  if (present(record, "expectedPurchaseDate")) {
    if (record.expectedPurchaseDate === null || text(record.expectedPurchaseDate) === "") patch.expectedPurchaseDate = null;
    else {
      try { patch.expectedPurchaseDate = parseIsoDate(text(record.expectedPurchaseDate)); }
      catch (error) { errors.push(fieldError("expectedPurchaseDate", error instanceof FinanceMoneyError ? error.message : "Enter a valid date.")); }
    }
  }
  if (present(record, "ownerEmail")) {
    const email = readOptionalText(errors, record, "ownerEmail", "email address", 200);
    if (email === null) patch.ownerEmail = null;
    else if (email && EMAIL.test(email)) patch.ownerEmail = email;
    else if (email) errors.push(fieldError("ownerEmail", "Enter a valid email address."));
  }
  if (present(record, "note")) {
    const note = readOptionalText(errors, record, "note", "note", 2000);
    if (note !== undefined) patch.note = note;
  }
  if (present(record, "earmarkId")) {
    if (record.earmarkId === null || text(record.earmarkId) === "") patch.earmarkId = null;
    else if (!UUID.test(text(record.earmarkId))) errors.push(fieldError("earmarkId", "Choose an earmarked part."));
    else patch.earmarkId = text(record.earmarkId);
  }
  const nextPriority = patch.priority;
  const nextEarmark = patch.earmarkId;
  if (nextPriority === "EM" && nextEarmark === null) errors.push(fieldError("earmarkId", "Choose an earmarked part for this item."));
  if (nextPriority && nextPriority !== "EM" && nextEarmark) errors.push(fieldError("earmarkId", "Clear the earmarked part unless the priority is EM."));
  if (errors.length) return { errors };
  return { patch, errors };
}

export function optionalReason(value: unknown): { reason: string | null; errors: FinanceFieldError[] } {
  if (value === undefined || value === null) return { reason: null, errors: [] };
  if (typeof value !== "string") return { reason: null, errors: [fieldError("reason", "Enter a reason.")] };
  const reason = value.trim();
  if (!reason) return { reason: null, errors: [] };
  if (reason.length > 500) return { reason: null, errors: [fieldError("reason", "Enter a shorter reason.")] };
  return { reason, errors: [] };
}
