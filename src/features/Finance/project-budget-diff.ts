import { formatOre } from "./money";
import type { DepartmentBudgetPlanEntry } from "./department-budget-types";
import type {
  ProjectBudgetEntry,
  ProjectBudgetVersion,
} from "./project-budget-types";

export const PROJECT_BUDGET_FIELD_LABELS = {
  description: "Description",
  systemId: "System",
  plannedNok: "Planned amount",
  ordinaryPriority: "Ordinary priority",
  priority: "Effective priority",
  category: "Category",
  reuseStatus: "Purchase type",
  expectedPurchaseDate: "Expected purchase date",
  ownerMemberId: "Owner",
  ownerEmail: "Owner email",
  status: "Status",
  note: "Note",
  earmarkId: "Restricted funding",
} as const;
export type ProjectBudgetDiffField = keyof typeof PROJECT_BUDGET_FIELD_LABELS;
export interface ProjectBudgetFieldChange {
  field: ProjectBudgetDiffField;
  before: string | null;
  after: string | null;
}
export interface ProjectBudgetEntryChange<
  Entry extends DepartmentBudgetPlanEntry = ProjectBudgetEntry,
> {
  entryId: string;
  kind: "added" | "changed" | "removed" | "unchanged";
  before: Entry | null;
  after: Entry | null;
  changes: ProjectBudgetFieldChange[];
}
export function canonicalNokOre(value: string): bigint {
  if (!/^-?\d+\.\d{2}$/.test(value))
    throw new Error(
      "The budget contains an invalid amount. Refresh it before reviewing.",
    );
  const negative = value.startsWith("-"),
    [whole, fraction] = value.replace(/^-/, "").split(".");
  return (BigInt(whole) * 100n + BigInt(fraction)) * (negative ? -1n : 1n);
}
export function projectBudgetMoney(value: string): string {
  const [whole, fraction] = formatOre(canonicalNokOre(value)).split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
export function compareProjectBudgetEntries(
  before: DepartmentBudgetPlanEntry | null,
  after: DepartmentBudgetPlanEntry | null,
): ProjectBudgetFieldChange[] {
  return (
    Object.keys(PROJECT_BUDGET_FIELD_LABELS) as ProjectBudgetDiffField[]
  ).flatMap((field) => {
    const oldValue = before?.[field] ?? null,
      newValue = after?.[field] ?? null;
    return oldValue === newValue
      ? []
      : [{ field, before: oldValue, after: newValue }];
  });
}
export function projectBudgetDiff<Entry extends DepartmentBudgetPlanEntry>(
  approved:
    | (Pick<ProjectBudgetVersion, "totalNok"> & { entries: Entry[] })
    | null,
  proposed:
    | (Pick<ProjectBudgetVersion, "totalNok"> & { entries: Entry[] })
    | null,
) {
  const before = new Map(
    (approved?.entries ?? [])
      .filter((entry) => !entry.removed)
      .map((entry) => [entry.entryId, entry]),
  );
  const after = new Map(
    (proposed?.entries ?? [])
      .filter((entry) => !entry.removed)
      .map((entry) => [entry.entryId, entry]),
  );
  const entries: ProjectBudgetEntryChange<Entry>[] = [
    ...new Set([...before.keys(), ...after.keys()]),
  ].map((entryId) => {
    const oldEntry = before.get(entryId) ?? null,
      newEntry = after.get(entryId) ?? null;
    const changes = compareProjectBudgetEntries(oldEntry, newEntry);
    return {
      entryId,
      kind: !oldEntry
        ? "added"
        : !newEntry
          ? "removed"
          : changes.length
            ? "changed"
            : "unchanged",
      before: oldEntry,
      after: newEntry,
      changes,
    };
  });
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const entry of entries) counts[entry.kind]++;
  return {
    entries,
    counts,
    approvedTotalNok: approved?.totalNok ?? "0.00",
    proposedTotalNok: proposed?.totalNok ?? "0.00",
    netTotalNok: formatOre(
      canonicalNokOre(proposed?.totalNok ?? "0.00") -
        canonicalNokOre(approved?.totalNok ?? "0.00"),
    ),
  };
}
