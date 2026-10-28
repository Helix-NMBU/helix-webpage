import { createHash } from "node:crypto";
import { parseBudgetCsv, normalizeImportDescription, parseImportAmount, MAX_IMPORT_ROWS, type BudgetCsvResult } from "../../src/features/Finance/budget-import.js";
import { formatOre } from "./finance-money.js";
import { FinanceError } from "./finance-error.js";
import { mapBudgetError, type BudgetCaller } from "./finance-budgets.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { BudgetImportPreview, BudgetImportRow, FinanceMutationResult } from "./finance-types.js";

type System = { id: string; code: string; name: string; department_key: string; active: boolean };
type Item = { id: string; system_id: string; system_code: string; department_key: string; description: string; category: string; planned_ore: string; priority: string; reuse_status: string; expected_purchase_date: string | null; note: string | null; earmark_id: string | null; earmark_ref: string | null; status: string; revision: number; actual_ore: string };
type Part = { id: string; public_ref: string; season_id: string; status: string };
type Desired = { systemId: string; description: string; category: string; plannedOre: string; priority: string; reuseStatus: string; expectedPurchaseDate: string | null; note: string | null; earmarkId: string | null; status: string };
type Operation = { kind: "add" | "change" | "remove"; id?: string; revision?: number; desired?: Desired; oldStatus?: string; oldValues?: Record<string, string | null> };

type Snapshot = { version: number; budgetId: string; budgetRevision: number; budgetStatus: string; seasonId: string; systems: System[]; items: Item[]; parts: Part[] };
const MAX_PREVIEW_BYTES = 1024 * 1024;
const MAX_RELATED_SNAPSHOT_ROWS = 5_000;
const byId = <T extends { id: string }>(a: T, b: T) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
async function snapshot(db: CvDatabase, caller: BudgetCaller, department: string): Promise<Snapshot> {
  const [budget] = (await db.query<{ version: string; id: string; revision: number; status: string; season_id: string }>(
    `select v.version::text, b.id, b.revision, b.status, b.season_id from finance.view_versions v
     join finance.settings st on st.setting_key = 'current_season' join finance.seasons s on s.code = st.setting_value #>> '{}'
     join finance.budgets b on b.season_id = s.id where v.singleton and s.status <> 'closed'`,
  )).rows;
  if (!budget) throw new FinanceError(409, "Create a current season budget first.");
  const [departmentCount] = (await db.query<{ count: string }>(
    `select count(*)::text as count from finance.budget_items i join finance.systems s on s.id = i.system_id
     where i.budget_id = $1::uuid and not i.protected and s.department_key = $2`, [budget.id, department],
  )).rows;
  if (Number(departmentCount?.count ?? 0) > MAX_IMPORT_ROWS) {
    throw new FinanceError(413, "This department has more than 500 budget items. Contact an administrator before importing.");
  }
  const systems = (await db.query<System>(
    "select id, code, name, department_key, active from finance.systems where department_key = $1 order by id limit 5001", [department],
  )).rows.sort(byId);
  const items = (await db.query<Item>(
    `select i.id, i.system_id, s.code as system_code, s.department_key, i.description, i.category,
      i.planned_ore::text, i.priority, i.reuse_status, i.expected_purchase_date::text, i.note,
      i.earmark_id, part.public_ref as earmark_ref, i.status, i.revision,
      coalesce((select sum(a.amount_ore) from finance.allocations a join finance.purchase_lines l on l.id = a.line_id
        join finance.purchases p on p.id = l.purchase_id and p.status = 'registered' where a.budget_item_id = i.id), 0)::text as actual_ore
     from finance.budget_items i join finance.systems s on s.id = i.system_id
     left join finance.funding_parts part on part.id = i.earmark_id
     where i.budget_id = $1::uuid and not i.protected
       and (s.department_key = $2 or (i.earmark_id is not null and i.status <> 'cancelled'))
     order by i.id limit 5001`, [budget.id, department],
  )).rows.sort(byId);
  const parts = (await db.query<Part>(
    "select p.id, p.public_ref, f.season_id, f.status from finance.funding_parts p join finance.funding f on f.id = p.funding_id where f.season_id = $1::uuid order by p.id limit 5001", [budget.season_id],
  )).rows.sort(byId);
  if ([systems.length, items.length, parts.length].some((count) => count > MAX_RELATED_SNAPSHOT_ROWS)) {
    throw new FinanceError(413, "The budget has too many related records to preview. Contact an administrator before importing.");
  }
  const [end] = (await db.query<{ version: string }>("select version::text from finance.view_versions where singleton")).rows;
  if (!end || end.version !== budget.version) throw new FinanceError(409, "Finance changed while preparing the preview. Try again.");
  return { version: Number(budget.version), budgetId: budget.id, budgetRevision: Number(budget.revision), budgetStatus: budget.status, seasonId: budget.season_id, systems, items, parts };
}

function view(item: Desired, earmarkRef: string | null): Record<string, string | null> {
  return { description: item.description, planned_nok: formatOre(BigInt(item.plannedOre)), priority: item.priority, category: item.category,
    reuse_status: item.reuseStatus, expected_purchase_date: item.expectedPurchaseDate, note: item.note, earmark_id: earmarkRef, status: item.status };
}
function desiredFrom(item: Item): Desired {
  return { systemId: item.system_id, description: item.description, category: item.category, plannedOre: item.planned_ore, priority: item.priority,
    reuseStatus: item.reuse_status, expectedPurchaseDate: item.expected_purchase_date, note: item.note, earmarkId: item.earmark_id, status: item.status };
}
function preview(source: string, department: string, data: Snapshot, parsed: BudgetCsvResult): { result: BudgetImportPreview; operations: Operation[] } {
  const errors = [...parsed.errors];
  const systems = data.systems.filter((entry) => entry.department_key === department);
  if (!systems.length) errors.push({ field: "departmentKey", message: "Choose a department with budget systems." });
  const prior = data.items.filter((entry) => entry.department_key === department);
  const matched = new Set<string>(); const seenKeys = new Set<string>(); const resultRows: BudgetImportRow[] = []; const operations: Operation[] = [];
  const totals = new Map<string, { systemCode: string; systemName: string; amount: bigint }>();
  const resultingLinks = new Map<string, string>();
  const finalRows: Desired[] = [];
  for (const record of parsed.rows) {
    const v = record.values;
    const system = systems.find((entry) => entry.code === v.system_id || entry.id === v.system_id);
    if (!system || !system.active) { errors.push({ field: "system_id", line: record.line, message: `Line ${record.line}, system_id: choose an active system in the selected department.` }); continue; }
    const resolvedKey = `${system.id}\0${normalizeImportDescription(v.description ?? "")}`;
    if (seenKeys.has(resolvedKey)) errors.push({ field: "description", line: record.line, message: `Line ${record.line}, description: this system and description occur more than once.` });
    seenKeys.add(resolvedKey);
    const candidates = prior.filter((item) => item.system_id === system.id && normalizeImportDescription(item.description) === normalizeImportDescription(v.description ?? ""));
    candidates.sort((a, b) => Number(a.status === "cancelled") - Number(b.status === "cancelled") || a.id.localeCompare(b.id));
    const current = candidates[0]; if (current) matched.add(current.id);
    let amount: bigint;
    try {
      const parsedAmount = parseImportAmount(v.planned_nok ?? "");
      if (parsedAmount === null || parsedAmount < 0n) continue;
      amount = parsedAmount;
    } catch { continue; }
    const old = current ? desiredFrom(current) : undefined;
    const part = v.earmark_id ? data.parts.find((entry) => entry.public_ref === v.earmark_id || entry.id === v.earmark_id) : undefined;
    if (v.earmark_id && (!part || part.season_id !== data.seasonId || (part.status === "deleted" && current?.earmark_id !== part.id))) {
      errors.push({ field: "earmark_id", line: record.line, message: `Line ${record.line}, earmark_id: choose an available part from this season.` });
    }
    const next: Desired = { systemId: system.id, description: old?.description ?? v.description ?? "", plannedOre: amount.toString(),
      category: v.category ?? old?.category ?? "other", priority: v.priority ?? old?.priority ?? "P2",
      reuseStatus: v.reuse_status ?? old?.reuseStatus ?? "new", expectedPurchaseDate: v.expected_purchase_date === undefined ? old?.expectedPurchaseDate ?? null : v.expected_purchase_date || null,
      note: v.note === undefined ? old?.note ?? null : v.note || null,
      earmarkId: v.earmark_id === undefined ? old?.earmarkId ?? null : part?.id ?? null,
      status: old && old.status !== "cancelled" ? old.status : "planned" };
    if ((next.priority === "EM") !== Boolean(next.earmarkId)) errors.push({ field: "earmark_id", line: record.line, message: `Line ${record.line}, earmark_id: EM priority requires an earmarked part, and other priorities cannot use one.` });
    const before = old ? view(old, current.earmark_ref) : null;
    const after = view(next, data.parts.find((entry) => entry.id === next.earmarkId)?.public_ref ?? null);
    const changed = !before || JSON.stringify(before) !== JSON.stringify(after);
    const kind = current ? changed ? "changed" : "unchanged" : "added";
    resultRows.push({ line: record.line, systemCode: system.code, systemName: system.name, kind, before, after, actualNok: current ? formatOre(BigInt(current.actual_ore)) : "0.00" });
    if (kind === "added") operations.push({ kind: "add", desired: next });
    else if (kind === "changed") operations.push({ kind: "change", id: current?.id, revision: Number(current?.revision), desired: next, oldValues: current ? { system_id: current.system_id, description: current.description, category: current.category, planned_ore: current.planned_ore, priority: current.priority, reuse_status: current.reuse_status, expected_purchase_date: current.expected_purchase_date, note: current.note, earmark_id: current.earmark_id, status: current.status } : {} });
    const subtotal = totals.get(system.id) ?? { systemCode: system.code, systemName: system.name, amount: 0n };
    subtotal.amount += amount; totals.set(system.id, subtotal); finalRows.push(next);
  }
  for (const item of prior) if (!matched.has(item.id) && item.status !== "cancelled") {
    const system = systems.find((entry) => entry.id === item.system_id);
    resultRows.push({ line: null, systemCode: item.system_code, systemName: system?.name ?? item.system_code, kind: "removed", before: view(desiredFrom(item), item.earmark_ref), after: null, actualNok: formatOre(BigInt(item.actual_ore)) });
    operations.push({ kind: "remove", id: item.id, revision: Number(item.revision), oldStatus: item.status });
  }
  for (const item of data.items.filter((entry) => entry.department_key !== department && entry.status !== "cancelled")) {
    if (item.earmark_id) resultingLinks.set(item.earmark_id, item.system_id);
  }
  for (const item of finalRows) if (item.earmarkId) {
    const previous = resultingLinks.get(item.earmarkId);
    if (previous && previous !== item.systemId) errors.push({ field: "earmark_id", message: "An earmarked part can only link active items in one system." });
    resultingLinks.set(item.earmarkId, item.systemId);
  }
  const counts = { added: 0, changed: 0, unchanged: 0, removed: 0 };
  resultRows.forEach((row) => { counts[row.kind] += 1; });
  const warnings = resultRows.flatMap((row) => {
    const actual = BigInt(row.actualNok.replace(".", ""));
    const label = `${row.after?.description ?? row.before?.description ?? "Item"} (${row.systemCode})`;
    if (row.kind === "removed") {
      return actual > 0n ? [`${label} will be cancelled but retains ${row.actualNok} NOK of spending.`] : [];
    }
    const planned = row.after?.planned_nok ? BigInt(row.after.planned_nok.replace(".", "")) : null;
    if (planned === null || actual <= planned) return [];
    return [`Line ${row.line}: ${label} has ${row.actualNok} NOK of spending, exceeding the imported plan of ${formatOre(planned)} NOK by ${formatOre(actual - planned)} NOK.`];
  });
  warnings.unshift("Descriptions identify imported items. Changing a description can add a new item and cancel the old one.");
  const subtotals = [...totals.values()].map((entry) => ({ systemCode: entry.systemCode, systemName: entry.systemName, plannedNok: formatOre(entry.amount) }));
  const previewToken = createHash("sha256").update(JSON.stringify({ source, department, version: data.version, operations })).digest("hex");
  return { operations, result: { previewToken, viewVersion: data.version, departmentKey: department, rows: resultRows, counts, subtotals,
    totalNok: formatOre([...totals.values()].reduce((sum, entry) => sum + entry.amount, 0n)), warnings, errors } };
}

export async function performBudgetImport(db: CvDatabase, caller: BudgetCaller, body: Record<string, unknown>): Promise<FinanceMutationResult> {
  if (typeof body.csv !== "string" || typeof body.departmentKey !== "string" || !body.departmentKey.trim()) throw new FinanceError(400, "Choose a department and enter CSV text.");
  const parsed = parseBudgetCsv(body.csv);
  if (parsed.limitError) throw new FinanceError(413, parsed.limitError);
  const action = String(body.action);
  const hash = createHash("sha256").update(JSON.stringify({ action, csv: body.csv, departmentKey: body.departmentKey, expectedRevision: body.expectedRevision, previewToken: body.previewToken, reason: body.reason ?? "" })).digest("hex");
  try {
    if (action === "importItems") {
      const replay = (await db.query<{ result: FinanceMutationResult | null }>("select finance.replay_budget_mutation($1::uuid,$2::uuid,$3,$4) as result", [caller.memberId, body.requestId, action, hash])).rows[0]?.result;
      if (replay) return replay;
    }
    const data = await snapshot(db, caller, body.departmentKey);
    const prepared = preview(body.csv, body.departmentKey, data, parsed);
    if (Buffer.byteLength(JSON.stringify(prepared.result), "utf8") > MAX_PREVIEW_BYTES) {
      throw new FinanceError(413, "The preview exceeds 1 MiB. Reduce the department budget size or contact an administrator.");
    }
    if (action === "previewImport") return { ok: true, viewVersion: data.version, warnings: [], errors: [], importPreview: prepared.result };
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== data.version) throw new FinanceError(409, "Finance changed since the preview. Preview the import again.");
    if (body.previewToken !== prepared.result.previewToken) throw new FinanceError(409, "The CSV or budget changed since the preview. Preview the import again.");
    if (prepared.result.errors.length) throw new FinanceError(400, "Fix the CSV errors and preview again.", prepared.result.errors);
    const value = (await db.query<{ result: FinanceMutationResult }>(
      "select finance.apply_budget_import($1::uuid,$2::uuid,$3,$4::bigint,$5::uuid,$6,$7::jsonb,$8) as result",
      [caller.memberId, body.requestId, hash, data.version, data.budgetId, body.departmentKey, JSON.stringify(prepared.operations), body.reason ?? ""],
    )).rows[0]?.result;
    if (!value) throw new FinanceError(503, "The finance service is temporarily unavailable. Please try again.");
    return value;
  } catch (error) { throw mapBudgetError(error); }
}
