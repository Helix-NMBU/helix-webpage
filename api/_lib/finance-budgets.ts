import {allocatedSystemCatalog} from "../../src/features/Finance/department-allocation.js";
import { buildBudgetHierarchy, type BudgetHierarchyUnallocated } from "../../src/features/Finance/budget-hierarchy.js";
import { hasVisibleApprovedFinances } from "../../src/features/Finance/finance-calculations.js";
import { OPEN_APPROVED_COMMITMENT_ORE, type EffectiveFinancePresence } from "./finance-effective-read.js";
import { loadBudgetEntryInvoiceReferences } from "./finance-invoices.js";
import type { WorkspaceIdentity } from "./member-cv-service.js";
import { createHash } from "node:crypto";
import type { CvDatabase } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import { osloToday } from "./finance-money.js";
import {
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

type BudgetState = { status: "absent" | "draft" | "approved"; approvedOn: string | null; budgetId: string | null; revision: number } & Partial<EffectiveFinancePresence>;

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
  allocation_department_key:string; allocation_department_name:string; allocation_sort_order:number;
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
  stored_planned_ore: string | null;
  commitment_ore: string; purchase_count: number; complete: boolean; approved: boolean;
  ordinary_priority: PublicBudgetItem["ordinaryPriority"];
  source: "legacy" | "project"; project_budget_id: string | null; project_id: string | null; project_name: string | null;
  responsible_department_id: string | null; approved_version_id: string | null;
};

function ore(value: string | null): bigint {
  return BigInt(value ?? "0");
}

export async function loadBudgetHierarchy(db: CvDatabase, caller: BudgetCaller, budget: BudgetState, identity?: WorkspaceIdentity): Promise<PublicBudgets> {
  const base = {
    viewVersion: caller.viewVersion, seasonCode: caller.seasonCode, budgetStatus: budget.status,
    approvedOn: budget.approvedOn, revision: budget.revision,
    ...(budget.approvedPresence ? { approvedPresence: budget.approvedPresence } : {}),
    ...(budget.hasRecordedActuals !== undefined ? { hasRecordedActuals: budget.hasRecordedActuals } : {}),
    departments: [] as PublicDepartmentBudget[], choices: { systems: [], items: [] } as BudgetChoices,
  };
  if (!budget.budgetId || (!caller.capabilities.draftBudgetItems && !hasVisibleApprovedFinances({ ...budget, budgetStatus: budget.status }))) return base;
  let rows: HierarchyRow[];
  try {
    rows = (await db.query<HierarchyRow>(
      `select d.department_key,d.name as department_name,d.sort_order,allocation.department_key as allocation_department_key,allocated_department.name as allocation_department_name,allocated_department.sort_order as allocation_sort_order,
        sys.id as system_id,sys.code as system_code,sys.name as system_name,sys.active as system_active,
        i.id as item_id,i.public_ref,i.description,i.category,i.planned_ore::text as planned_ore,
        case when $2::boolean or i.approved_version_id is not null or i.legacy_budget_status='approved'
          then coalesce(ve.planned_ore,anchor.planned_ore)::text else '0' end as stored_planned_ore,
        i.priority,i.ordinary_priority,i.reuse_status,i.expected_purchase_date::text as expected_purchase_date,i.status,
        i.note,case when i.approved_version_id is not null then ve.owner_email else anchor.owner_email end as owner_email,
        i.protected,i.revision,i.earmark_id,i.source,i.project_budget_id,i.project_id,project.name as project_name,
        i.responsible_department_id,i.approved_version_id,i.complete,
        (i.approved_version_id is not null or i.legacy_budget_status='approved') as approved,
        part.purpose as earmark_purpose,part.amount_ore::text as earmark_amount_ore,part.conditions as earmark_conditions,
        fund.source_name as earmark_source,fund.status as earmark_funding_status,
        allocation.actual_ore::text as actual_ore,allocation.purchase_count,allocation.commitment_ore::text as commitment_ore
       from finance.systems sys join identity.departments d on d.department_key=sys.department_key
       left join finance.effective_budget_entries i on i.system_id=sys.id and i.budget_id=$1::uuid
         and ($2::boolean or i.approved_version_id is not null or i.legacy_budget_status='approved' or i.protected
           or exists(select 1 from finance.registered_allocation_facts actual where actual.budget_item_id=i.id)
           or ${OPEN_APPROVED_COMMITMENT_ORE}>0)
       left join finance.department_entry_financials allocation on allocation.entry_id=i.id
       left join identity.departments allocated_department on allocated_department.department_key=allocation.department_key
       left join finance.budget_items anchor on anchor.id=i.id
       left join finance.project_budget_version_entries ve on ve.version_id=i.approved_version_id and ve.entry_id=i.id
       left join project_management.projects project on project.id=i.project_id
       left join finance.funding_parts part on part.id=i.earmark_id left join finance.funding fund on fund.id=part.funding_id
       where i.id is not null or sys.active order by d.sort_order,d.name,d.department_key,sys.name,sys.code,i.public_ref`,
      [budget.budgetId, caller.capabilities.draftBudgetItems],
    )).rows;
  } catch (error) { throw mapBudgetError(error); }
  const items: PublicBudgetItem[] = [];
  const unallocated: BudgetHierarchyUnallocated[] = [];
  const retainedActuals: { systemId: string; actualNok: string; commitmentNok: string; allocationDepartmentKey:string }[] = [];
  const privateFinance = caller.capabilities.purchaseRegister && caller.capabilities.filesAndRefunds;
  const systems = new Map<string, Parameters<typeof buildBudgetHierarchy>[0]["systems"][number]>();
  const evidence = identity && privateFinance ? await loadBudgetEntryInvoiceReferences(db, identity, rows.flatMap(row => row.item_id && !row.protected ? [row.item_id] : [])) : new Map();
  for (const row of rows) {
    systems.set(row.system_id, { id: row.system_id, code: row.system_code, name: row.system_name, active: row.system_active,
      departmentKey: row.department_key, departmentName: row.department_name, sortOrder: Number(row.sort_order) });
    if (!row.item_id || !row.public_ref || !row.description || !row.category || !row.priority || !row.reuse_status || !row.status) continue;
    const actual = ore(row.actual_ore), effective = ore(row.planned_ore);
    if (row.protected) {
      unallocated.push({ id: row.item_id, publicRef: row.public_ref, systemId: row.system_id, allocationDepartmentKey:row.allocation_department_key, actualNok: formatOre(actual),
        note: row.note, revision: Number(row.revision), commitmentNok: formatOre(ore(row.commitment_ore)) });
      continue;
    }
    if (!row.approved && !caller.capabilities.draftBudgetItems) {
      retainedActuals.push({ systemId: row.system_id, allocationDepartmentKey:row.allocation_department_key, actualNok: formatOre(actual), commitmentNok: formatOre(ore(row.commitment_ore)) });
      continue;
    }
    const showEarmark = caller.capabilities.financing || row.earmark_funding_status === "secured" || row.earmark_funding_status === "received";
    const item: PublicBudgetItem = {
      id: row.item_id, publicRef: row.public_ref, systemId: row.system_id, allocationDepartmentKey:row.allocation_department_key, systemCode: row.system_code,
      description: row.description, category: row.category, plannedNok: formatOre(ore(row.stored_planned_ore)), effectivePlanNok: formatOre(effective),
      actualNok: formatOre(actual), differenceNok: formatOre(effective-actual), priority: row.priority, ordinaryPriority: row.ordinary_priority,
      approved: row.approved, source: row.source, reuseStatus: row.reuse_status, expectedPurchaseDate: row.expected_purchase_date,
      status: row.status, revision: Number(row.revision), earmarked: row.earmark_id !== null,
      earmarkPurpose: showEarmark ? row.earmark_purpose : null, earmarkAmountNok: showEarmark && row.earmark_amount_ore !== null ? formatOre(ore(row.earmark_amount_ore)) : null,
      commitmentNok: formatOre(ore(row.commitment_ore)),
      ...(privateFinance ? { completion: row.complete ? "complete" as const : row.purchase_count > 0 ? "partial" as const : "not_purchased" as const } : {}),
      ...(identity && privateFinance ? { invoices: evidence.get(row.item_id) ?? [] } : {}),
    };
    if (caller.capabilities.purchaseRegister) Object.assign(item, { projectBudgetId: row.project_budget_id, projectId: row.project_id, projectName: row.project_name,
      responsibleDepartmentId: row.responsible_department_id, approvedVersionId: row.approved_version_id });
    if (caller.capabilities.draftBudgetItems) Object.assign(item, { note: row.note, ownerEmail: row.owner_email, earmarkId: row.earmark_id });
    if (caller.capabilities.financing) Object.assign(item, { earmarkSourceName: row.earmark_source, earmarkConditions: row.earmark_conditions });
    items.push(item);
  }
  const departments=rows.map(row=>({departmentKey:row.allocation_department_key,departmentName:row.allocation_department_name,sortOrder:Number(row.allocation_sort_order)}));
  const catalog=allocatedSystemCatalog([...systems.values()],departments,[...items,...unallocated,...retainedActuals].map(item=>({systemId:item.systemId,departmentKey:item.allocationDepartmentKey!})));
  const hierarchy = buildBudgetHierarchy({ systems: catalog, items, unallocated, includePrivateUnallocated: caller.capabilities.draftBudgetItems, retainedActuals });
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
  return { ...base, ...hierarchy, ...(earmarkChoices ? { earmarkChoices } : {}) };
}
