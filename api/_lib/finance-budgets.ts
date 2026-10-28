import { createHash } from "node:crypto";
import type { CvDatabase } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import { osloToday } from "./finance-money.js";
import {
  compareDepartmentOrder,
  compareNb,
  differenceOre,
  effectivePlanOre,
  normalizeItemPatch,
  normalizeManualItem,
  optionalReason,
  type NormalizedBudgetItem,
} from "../../src/features/Finance/budget-domain.js";
import type {
  BudgetChoices,
  BudgetEarmarkChoice,
  FinanceCapabilitySet,
  FinanceFieldError,
  FinanceMutationResult,
  PublicBudgetItem,
  PublicBudgets,
  PublicDepartmentBudget,
  PublicSystemBudget,
  UnallocatedBudgetItem,
} from "./finance-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = "The finance service is temporarily unavailable. Please try again.";
const BUDGET_ACTIONS = new Set(["createBudget", "approveBudget", "addItem", "editItem", "cancelItem", "restoreItem", "ensureUnallocated"]);

export type BudgetCaller = {
  memberId: string;
  viewVersion: number;
  seasonCode: string | null;
  capabilities: FinanceCapabilitySet;
};

type BudgetState = { status: "absent" | "draft" | "approved"; approvedOn: string | null; budgetId: string | null; revision: number };

export function isBudgetMutation(action: string): boolean {
  return BUDGET_ACTIONS.has(action);
}

function canonical(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function mapBudgetError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const message = textOf(error);
  const tagged = /FINANCE\|(conflict|denied|invalid|stale|not_found)\|([^|]*)(?:\|([A-Za-z][A-Za-z0-9]*))?/.exec(message);
  if (tagged) {
    const kind = tagged[1];
    const text = tagged[2] || "Could not save the budget change.";
    const field = tagged[3];
    const status = kind === "denied" ? 403 : kind === "not_found" ? 404 : kind === "invalid" ? 400 : 409;
    return new FinanceError(status, text, field ? [{ field, message: text }] : undefined);
  }
  if (/season is closed/i.test(message)) return new FinanceError(409, "This season is closed.");
  if (/one system/i.test(message)) {
    const text = "An earmarked part can only link items in one system.";
    return new FinanceError(400, text, [{ field: "earmarkId", message: text }]);
  }
  if (/same season/i.test(message)) {
    const text = "Choose an earmarked part from this season.";
    return new FinanceError(400, text, [{ field: "earmarkId", message: text }]);
  }
  if (/invalid input syntax for type date/i.test(message)) return new FinanceError(400, "Enter a valid date.", [{ field: "expectedPurchaseDate", message: "Enter a valid date." }]);
  if (/violates check constraint/i.test(message)) return new FinanceError(400, "This budget change is not allowed.");
  return new FinanceError(503, UNAVAILABLE);
}

async function call(db: CvDatabase, sql: string, params: unknown[]): Promise<FinanceMutationResult> {
  try {
    const result = await db.query<{ result: FinanceMutationResult | string }>(sql, params);
    const value = result.rows[0]?.result;
    const parsed = typeof value === "string" ? JSON.parse(value) as FinanceMutationResult : value;
    const viewVersion = Number(parsed?.viewVersion);
    if (!parsed || parsed.ok !== true || !Number.isSafeInteger(viewVersion)) throw new FinanceError(503, UNAVAILABLE);
    return { ok: true, viewVersion, id: parsed.id, warnings: parsed.warnings ?? [], errors: parsed.errors ?? [] };
  } catch (error) {
    throw mapBudgetError(error);
  }
}

function invalid(errors: FinanceFieldError[]): FinanceError {
  return new FinanceError(400, errors[0]?.message ?? "Enter a valid budget item.", errors);
}

function requireUuid(value: unknown, field: string, message: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new FinanceError(400, message, [{ field, message }]);
  return value;
}

function serializeItem(item: NormalizedBudgetItem) {
  return { ...item, plannedOre: item.plannedOre.toString() };
}

export async function performBudgetMutation(db: CvDatabase, caller: BudgetCaller, body: Record<string, unknown>): Promise<FinanceMutationResult> {
  const action = body.action;
  const requestId = body.requestId;
  if (action === "createBudget") {
    return call(db, "select finance.create_season_budget($1::uuid, $2::uuid, $3) as result", [
      caller.memberId, requestId, payloadHash({ action }),
    ]);
  }
  if (action === "approveBudget") {
    return call(db, "select finance.approve_season_budget($1::uuid, $2::uuid, $3, $4::integer, $5::date) as result", [
      caller.memberId, requestId, payloadHash({ action, expectedRevision: body.expectedRevision }), body.expectedRevision, osloToday(),
    ]);
  }
  if (action === "addItem") {
    const normalized = normalizeManualItem(body.item);
    const reason = optionalReason(body.reason);
    const errors = [...normalized.errors, ...reason.errors];
    if (errors.length || !normalized.item) throw invalid(errors.length ? errors : [{ field: "item", message: "Enter the budget item." }]);
    const item = normalized.item;
    return call(
      db,
      `select finance.add_budget_item(
         $1::uuid, $2::uuid, $3, $4::integer, $5::uuid, $6, $7, $8::bigint, $9, $10, $11::date, $12, $13, $14, $15::uuid, $16
       ) as result`,
      [
        caller.memberId, requestId, payloadHash({ action, expectedRevision: body.expectedRevision, item: serializeItem(item), reason: reason.reason }),
        body.expectedRevision, item.systemId, item.description, item.category, item.plannedOre.toString(), item.priority,
        item.reuseStatus, item.expectedPurchaseDate, item.ownerEmail, item.status, item.note, item.earmarkId, reason.reason,
      ],
    );
  }
  if (action === "editItem") {
    const itemId = requireUuid(body.itemId, "itemId", "Choose a budget item.");
    const normalized = normalizeItemPatch(body.patch);
    const reason = optionalReason(body.reason);
    const errors = [...normalized.errors, ...reason.errors];
    if (errors.length || !normalized.patch) throw invalid(errors);
    const patch = normalized.patch;
    const sqlPatch: Record<string, unknown> = {};
    if (patch.systemId !== undefined) sqlPatch.systemId = patch.systemId;
    if (patch.description !== undefined) sqlPatch.description = patch.description;
    if (patch.category !== undefined) sqlPatch.category = patch.category;
    if (patch.plannedOre !== undefined) sqlPatch.plannedOre = patch.plannedOre.toString();
    if (patch.priority !== undefined) sqlPatch.priority = patch.priority;
    if (patch.reuseStatus !== undefined) sqlPatch.reuseStatus = patch.reuseStatus;
    if (patch.expectedPurchaseDate !== undefined) sqlPatch.expectedPurchaseDate = patch.expectedPurchaseDate;
    if (patch.ownerEmail !== undefined) sqlPatch.ownerEmail = patch.ownerEmail;
    if (patch.status !== undefined) sqlPatch.status = patch.status;
    if (patch.note !== undefined) sqlPatch.note = patch.note;
    if (patch.earmarkId !== undefined) sqlPatch.earmarkId = patch.earmarkId;
    if (Object.keys(sqlPatch).length === 0) throw invalid([{ field: "patch", message: "Enter the fields to change." }]);
    return call(db, "select finance.edit_budget_item($1::uuid, $2::uuid, $3, $4::uuid, $5::integer, $6::jsonb, $7) as result", [
      caller.memberId, requestId, payloadHash({ action, itemId, expectedRevision: body.expectedRevision, patch: sqlPatch, reason: reason.reason }),
      itemId, body.expectedRevision, JSON.stringify(sqlPatch), reason.reason,
    ]);
  }
  if (action === "cancelItem" || action === "restoreItem") {
    const itemId = requireUuid(body.itemId, "itemId", "Choose a budget item.");
    const reason = optionalReason(body.reason);
    if (reason.errors.length) throw invalid(reason.errors);
    const fn = action === "cancelItem" ? "cancel_budget_item" : "restore_budget_item";
    return call(db, `select finance.${fn}($1::uuid, $2::uuid, $3, $4::uuid, $5::integer, $6) as result`, [
      caller.memberId, requestId, payloadHash({ action, itemId, expectedRevision: body.expectedRevision, reason: reason.reason }),
      itemId, body.expectedRevision, reason.reason,
    ]);
  }
  const systemId = requireUuid(body.systemId, "systemId", "Choose a system.");
  return call(db, "select finance.ensure_unallocated_item($1::uuid, $2::uuid, $3, $4::uuid) as result", [
    caller.memberId, requestId, payloadHash({ action, systemId }), systemId,
  ]);
}

type HierarchyRow = {
  department_key: string;
  department_name: string;
  sort_order: number;
  system_id: string;
  system_code: string;
  system_name: string;
  system_active: boolean;
  item_id: string | null;
  public_ref: string | null;
  description: string | null;
  category: string | null;
  planned_ore: string | null;
  priority: PublicBudgetItem["priority"] | null;
  reuse_status: PublicBudgetItem["reuseStatus"] | null;
  expected_purchase_date: string | null;
  status: PublicBudgetItem["status"] | null;
  note: string | null;
  owner_email: string | null;
  protected: boolean | null;
  revision: number | null;
  earmark_id: string | null;
  earmark_purpose: string | null;
  earmark_amount_ore: string | null;
  earmark_conditions: string | null;
  earmark_source: string | null;
  earmark_funding_status: string | null;
  actual_ore: string | null;
};

function ore(value: string | null): bigint {
  return BigInt(value ?? "0");
}

export async function loadBudgetHierarchy(db: CvDatabase, caller: BudgetCaller, budget: BudgetState): Promise<PublicBudgets> {
  const emptyChoices: BudgetChoices = { systems: [], items: [] };
  const base = {
    viewVersion: caller.viewVersion,
    seasonCode: caller.seasonCode,
    budgetStatus: budget.status,
    approvedOn: budget.approvedOn,
    revision: budget.revision,
    departments: [] as PublicDepartmentBudget[],
    choices: emptyChoices,
  };
  if (!budget.budgetId || (budget.status === "draft" && !caller.capabilities.draftBudgetItems)) return base;
  let rows: HierarchyRow[];
  try {
    rows = (await db.query<HierarchyRow>(
      `select d.department_key, d.name as department_name, d.sort_order,
              sys.id as system_id, sys.code as system_code, sys.name as system_name, sys.active as system_active,
              i.id as item_id, i.public_ref, i.description, i.category, i.planned_ore::text as planned_ore,
              i.priority, i.reuse_status, i.expected_purchase_date::text as expected_purchase_date, i.status,
              i.note, i.owner_email, i.protected, i.revision, i.earmark_id,
              part.purpose as earmark_purpose, part.amount_ore::text as earmark_amount_ore, part.conditions as earmark_conditions,
              fund.source_name as earmark_source, fund.status as earmark_funding_status,
              coalesce(act.actual_ore, 0)::text as actual_ore
       from finance.systems sys
       join identity.departments d on d.department_key = sys.department_key
       left join finance.budget_items i on i.system_id = sys.id and i.budget_id = $1::uuid
       left join finance.funding_parts part on part.id = i.earmark_id
       left join finance.funding fund on fund.id = part.funding_id
       left join lateral (
         select coalesce(sum(a.amount_ore), 0) as actual_ore
         from finance.allocations a
         join finance.purchase_lines l on l.id = a.line_id
         join finance.purchases p on p.id = l.purchase_id and p.status = 'registered'
         where a.budget_item_id = i.id
       ) act on i.id is not null
       where i.id is not null or sys.active
       order by d.sort_order, d.name, d.department_key, sys.name, sys.code`,
      [budget.budgetId],
    )).rows;
  } catch (error) {
    throw mapBudgetError(error);
  }
  const departments = new Map<string, PublicDepartmentBudget & { sortOrder: number }>();
  for (const row of rows) {
    let department = departments.get(row.department_key);
    if (!department) {
      department = {
        departmentKey: row.department_key,
        name: row.department_name,
        sortOrder: Number(row.sort_order),
        plannedNok: formatOre(0n),
        actualNok: formatOre(0n),
        differenceNok: formatOre(0n),
        unbudgetedNok: formatOre(0n),
        systems: [],
      };
      departments.set(row.department_key, department);
    }
    let system = department.systems.find((entry) => entry.id === row.system_id);
    if (!system) {
      system = {
        id: row.system_id,
        code: row.system_code,
        name: row.system_name,
        active: row.system_active,
        plannedNok: formatOre(0n),
        actualNok: formatOre(0n),
        differenceNok: formatOre(0n),
        unbudgetedNok: formatOre(0n),
        unbudgetedItemId: null,
        unbudgetedPublicRef: null,
        items: [],
      };
      department.systems.push(system);
    }
    if (!row.item_id || !row.public_ref || !row.description || !row.category || !row.priority || !row.reuse_status || !row.status) continue;
    const planned = ore(row.planned_ore);
    const actual = ore(row.actual_ore);
    const unallocated = row.protected === true;
    const effective = effectivePlanOre(planned, row.status, unallocated);
    if (unallocated) {
      system.unbudgetedItemId = row.item_id;
      system.unbudgetedPublicRef = row.public_ref;
      if (caller.capabilities.draftBudgetItems) {
        const detail: UnallocatedBudgetItem = {
          id: row.item_id,
          publicRef: row.public_ref,
          note: row.note,
          revision: Number(row.revision ?? 0),
          actualNok: formatOre(actual),
        };
        system.unallocated = detail;
      }
      continue;
    }
    const publicFunding = row.earmark_funding_status === "secured" || row.earmark_funding_status === "received";
    const showEarmark = caller.capabilities.financing || publicFunding;
    const item: PublicBudgetItem = {
      id: row.item_id,
      publicRef: row.public_ref,
      systemId: row.system_id,
      systemCode: row.system_code,
      description: row.description,
      category: row.category,
      plannedNok: formatOre(planned),
      effectivePlanNok: formatOre(effective),
      actualNok: formatOre(actual),
      differenceNok: formatOre(differenceOre(effective, actual)),
      priority: row.priority,
      reuseStatus: row.reuse_status,
      expectedPurchaseDate: row.expected_purchase_date,
      status: row.status,
      revision: Number(row.revision ?? 0),
      earmarked: row.priority === "EM",
      earmarkPurpose: showEarmark ? row.earmark_purpose : null,
      earmarkAmountNok: showEarmark && row.earmark_amount_ore !== null ? formatOre(ore(row.earmark_amount_ore)) : null,
    };
    if (caller.capabilities.draftBudgetItems) {
      item.note = row.note;
      item.ownerEmail = row.owner_email;
      item.earmarkId = row.earmark_id;
    }
    if (caller.capabilities.financing) {
      item.earmarkSourceName = row.earmark_source;
      item.earmarkConditions = row.earmark_conditions;
    }
    system.items.push(item);
  }
  const ordered = [...departments.values()].sort(compareDepartmentOrder);
  const choices: BudgetChoices = { systems: [], items: [] };
  for (const department of ordered) {
    department.systems.sort((left, right) => compareNb(left.name, right.name) || compareNb(left.code, right.code));
    let departmentPlan = 0n;
    let departmentActual = 0n;
    let departmentUnbudgeted = 0n;
    for (const system of department.systems) {
      system.items.sort((left, right) => compareNb(left.publicRef, right.publicRef));
      let plan = 0n;
      let actual = 0n;
      let unbudgeted = 0n;
      for (const item of system.items) {
        plan += item.status === "cancelled" ? 0n : oreFromCanonical(item.plannedNok);
        actual += oreFromCanonical(item.actualNok);
        if (item.status !== "cancelled") {
          choices.items.push({
            id: item.id,
            publicRef: item.publicRef,
            description: item.description,
            systemId: item.systemId,
            status: item.status,
          });
        }
      }
      if (system.unallocated) unbudgeted += oreFromCanonical(system.unallocated.actualNok);
      else if (system.unbudgetedItemId) {
        const source = rows.find((row) => row.item_id === system.unbudgetedItemId);
        unbudgeted += ore(source?.actual_ore ?? null);
      }
      actual += unbudgeted;
      system.plannedNok = formatOre(plan);
      system.actualNok = formatOre(actual);
      system.differenceNok = formatOre(plan - actual);
      system.unbudgetedNok = formatOre(unbudgeted);
      departmentPlan += plan;
      departmentActual += actual;
      departmentUnbudgeted += unbudgeted;
      if (system.active) {
        choices.systems.push({
          id: system.id,
          code: system.code,
          name: system.name,
          departmentKey: department.departmentKey,
          active: system.active,
          unbudgetedItemId: system.unbudgetedItemId,
          unbudgetedPublicRef: system.unbudgetedPublicRef,
        });
      }
    }
    department.plannedNok = formatOre(departmentPlan);
    department.actualNok = formatOre(departmentActual);
    department.differenceNok = formatOre(departmentPlan - departmentActual);
    department.unbudgetedNok = formatOre(departmentUnbudgeted);
  }
  let earmarkChoices: BudgetEarmarkChoice[] | undefined;
  if (caller.capabilities.financing && caller.seasonCode) {
    try {
      const parts = await db.query<{ id: string; public_ref: string; purpose: string; amount_ore: string; source_name: string }>(
        `select p.id, p.public_ref, p.purpose, p.amount_ore::text as amount_ore, f.source_name
         from finance.funding_parts p
         join finance.funding f on f.id = p.funding_id
         join finance.seasons s on s.id = f.season_id
         where s.code = $1 and f.status <> 'deleted'
         order by p.public_ref`,
        [caller.seasonCode],
      );
      earmarkChoices = parts.rows.map((row) => ({
        id: row.id,
        publicRef: row.public_ref,
        purpose: row.purpose,
        amountNok: formatOre(ore(row.amount_ore)),
        sourceName: row.source_name,
      }));
    } catch (error) {
      throw mapBudgetError(error);
    }
  }
  return {
    viewVersion: caller.viewVersion,
    seasonCode: caller.seasonCode,
    budgetStatus: budget.status,
    approvedOn: budget.approvedOn,
    revision: budget.revision,
    departments: ordered.map(({ sortOrder: _sortOrder, ...department }) => department),
    choices,
    ...(earmarkChoices ? { earmarkChoices } : {}),
  };
}

function oreFromCanonical(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = "00"] = value.slice(negative ? 1 : 0).split(".");
  const oreValue = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -oreValue : oreValue;
}
