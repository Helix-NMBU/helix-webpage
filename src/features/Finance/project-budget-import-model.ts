import {
  normalizeImportDescription,
  parseBudgetCsv,
  parseImportAmount,
} from "./budget-import";
import { formatOre } from "./money";
import { compareProjectBudgetEntries } from "./project-budget-diff";
import type {
  ProjectBudgetDetail,
  ProjectBudgetEntry,
  ProjectBudgetImportPreview,
  ProjectBudgetSystemChoice,
} from "./project-budget-types";
function record(entry: ProjectBudgetEntry): Record<string, string | null> {
  return {
    description: entry.description,
    system_id: entry.systemId,
    planned_nok: entry.plannedNok,
    priority: entry.ordinaryPriority,
    category: entry.category,
    reuse_status: entry.reuseStatus,
    expected_purchase_date: entry.expectedPurchaseDate ?? null,
    note: entry.note ?? null,
    earmark_id: entry.earmarkId ?? null,
    status: entry.status,
  };
}
/** Dedicated loopback fixture planner. Production previews come from the authenticated server. */
export function planLocalProjectBudgetImport(
  budget: ProjectBudgetDetail,
  csv: string,
  systems: ProjectBudgetSystemChoice[],
  viewVersion: number,
) {
  const parsed = parseBudgetCsv(csv),
    current = budget.pendingVersion!.entries,
    matched = new Set<string>(),
    keys = new Set<string>();
  const errors = [...parsed.errors],
    rows: ProjectBudgetImportPreview["rows"] = [],
    entries: ProjectBudgetEntry[] = [];
  const totals = new Map<
    string,
    { systemCode: string; systemName: string; amount: bigint }
  >();
  for (const row of parsed.rows) {
    const v = row.values,
      system = systems.find(
        (item) => item.id === v.system_id || item.code === v.system_id,
      );
    if (!system) {
      errors.push({
        field: "system_id",
        message: `Line ${row.line}: choose a system in this project.`,
      });
      continue;
    }
    const key = `${system.id}\0${normalizeImportDescription(v.description ?? "")}`;
    if (keys.has(key)) {
      errors.push({
        field: "description",
        message: `Line ${row.line}: this system and description occur more than once.`,
      });
      continue;
    }
    keys.add(key);
    const old = current.find(
      (item) =>
        item.systemId === system.id &&
        normalizeImportDescription(item.description) ===
          normalizeImportDescription(v.description ?? ""),
    );
    if (old) matched.add(old.entryId);
    if (
      v.priority !== undefined &&
      !["P1", "P2", "P3", "P4"].includes(v.priority)
    ) {
      errors.push({
        field: "priority",
        message: `Line ${row.line}: choose P1, P2, P3 or P4.`,
      });
      continue;
    }
    let amount: bigint | null;
    try {
      amount = parseImportAmount(v.planned_nok ?? "");
    } catch {
      continue;
    }
    if (amount === null || amount < 0n) continue;
    const priority = (v.priority ??
      old?.ordinaryPriority ??
      "P2") as ProjectBudgetEntry["ordinaryPriority"];
    const next: ProjectBudgetEntry = {
      ...old,
      entryId: old?.entryId ?? crypto.randomUUID(),
      budgetItemId: old?.budgetItemId ?? null,
      publicRef: old?.publicRef ?? null,
      actualNok: old?.actualNok ?? "0.00",
      completion: old?.completion ?? "not_purchased",
      systemId: system.id,
      description: old?.description ?? v.description ?? "",
      plannedNok: formatOre(amount),
      ordinaryPriority: priority,
      priority: old?.priority === "P0" ? "P0" : priority,
      category: v.category ?? old?.category ?? "other",
      reuseStatus: (v.reuse_status ??
        old?.reuseStatus ??
        "new") as ProjectBudgetEntry["reuseStatus"],
      expectedPurchaseDate:
        v.expected_purchase_date === undefined
          ? (old?.expectedPurchaseDate ?? null)
          : v.expected_purchase_date || null,
      note: v.note === undefined ? (old?.note ?? null) : v.note || null,
      earmarkId:
        v.earmark_id === undefined
          ? (old?.earmarkId ?? null)
          : v.earmark_id || null,
      status: old && old.status !== "cancelled" ? old.status : "planned",
      removed: false,
    };
    if (
      old?.priority === "P0" &&
      amount < (parseImportAmount(old.plannedNok) ?? 0n)
    )
      errors.push({
        field: "planned_nok",
        message: `Line ${row.line}: mandatory P0 purchases cannot be reduced through import.`,
      });
    entries.push(next);
    rows.push({
      line: row.line,
      systemCode: system.code,
      systemName: system.name,
      kind:
        !old || old.removed
          ? "added"
          : compareProjectBudgetEntries(old, next).length
            ? "changed"
            : "unchanged",
      before: old && !old.removed ? record(old) : null,
      after: record(next),
      actualNok: next.actualNok,
    });
    const subtotal = totals.get(system.id) ?? {
      systemCode: system.code,
      systemName: system.name,
      amount: 0n,
    };
    if (next.status !== "cancelled") subtotal.amount += amount;
    totals.set(system.id, subtotal);
  }
  for (const old of current.filter((item) => !matched.has(item.entryId))) {
    entries.push({ ...old, removed: true });
    if (old.removed) continue;
    if (old.priority === "P0")
      errors.push({
        field: "csv",
        message: `The mandatory P0 entry ${old.description} cannot be removed.`,
      });
    const system = systems.find((item) => item.id === old.systemId);
    rows.push({
      line: null,
      systemCode: system?.code ?? old.systemId,
      systemName: system?.name ?? old.systemId,
      kind: "removed",
      before: record(old),
      after: null,
      actualNok: old.actualNok,
    });
  }
  const counts = { added: 0, changed: 0, unchanged: 0, removed: 0 };
  for (const row of rows) counts[row.kind]++;
  const preview: ProjectBudgetImportPreview = {
    projectBudgetId: budget.id,
    candidateRevision: budget.revision,
    previewToken: crypto.randomUUID(),
    departmentKey: "",
    viewVersion,
    rows,
    counts,
    subtotals: [...totals.values()].map((item) => ({
      systemCode: item.systemCode,
      systemName: item.systemName,
      plannedNok: formatOre(item.amount),
    })),
    totalNok: formatOre(
      [...totals.values()].reduce((sum, item) => sum + item.amount, 0n),
    ),
    warnings: rows.some(
      (row) => row.kind === "removed" && row.actualNok !== "0.00",
    )
      ? ["Removed entries retain their purchase and invoice history."]
      : [],
    errors,
  };
  return { preview, entries };
}
