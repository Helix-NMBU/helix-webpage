import { compareDepartmentOrder, compareNb } from "./budget-domain.js";
import { nokToOre, usedFraction } from "./finance-calculations.js";
import { formatOre } from "./money.js";
import type { BudgetChoices, PublicBudgetItem, PublicDepartmentBudget, PublicSystemBudget, UnallocatedBudgetItem } from "./types.js";

export interface BudgetHierarchySystem {
  id: string; code: string; name: string; active: boolean;
  departmentKey: string; departmentName: string; sortOrder: number;
}
export interface BudgetHierarchyUnallocated extends UnallocatedBudgetItem {
  systemId: string; commitmentNok?: string;
}
/** Present already authorized, canonical effective rows. Candidate versions are never inputs. */
export function buildBudgetHierarchy(input: {
  systems: readonly BudgetHierarchySystem[];
  items: readonly PublicBudgetItem[];
  unallocated: readonly BudgetHierarchyUnallocated[];
  includePrivateUnallocated: boolean;
  /** Aggregate-only actuals from unpublished legacy rows; no private entry metadata. */
  retainedActuals?: readonly { systemId: string; actualNok: string; commitmentNok?: string }[];
}): { departments: PublicDepartmentBudget[]; choices: BudgetChoices } {
  const seen = new Set<string>();
  for (const entry of [...input.items, ...input.unallocated]) {
    if (seen.has(entry.id)) throw new Error("A stable budget entry must occur once in the effective hierarchy.");
    seen.add(entry.id);
  }
  const departments = new Map<string, PublicDepartmentBudget & { sortOrder: number }>();
  const choices: BudgetChoices = { systems: [], items: [] };
  const ordered = [...input.systems].sort((a, b) => compareDepartmentOrder(
    { departmentKey: a.departmentKey, name: a.departmentName, sortOrder: a.sortOrder },
    { departmentKey: b.departmentKey, name: b.departmentName, sortOrder: b.sortOrder },
  ) || compareNb(a.name, b.name) || compareNb(a.code, b.code));
  for (const catalog of ordered) {
    const items = input.items.filter(item => item.systemId === catalog.id).sort((a, b) => compareNb(a.publicRef, b.publicRef));
    const unallocated = input.unallocated.find(item => item.systemId === catalog.id);
    const retained = input.retainedActuals?.filter(entry => entry.systemId === catalog.id) ?? [];
    if (!catalog.active && !items.length && !unallocated && !retained.length) continue;
    const planned = items.reduce((total, item) => total + nokToOre(item.effectivePlanNok), 0n);
    const unbudgeted = nokToOre(unallocated?.actualNok ?? "0.00");
    const retainedActual = retained.reduce((total, entry) => total + nokToOre(entry.actualNok), 0n);
    const actual = items.reduce((total, item) => total + nokToOre(item.actualNok), unbudgeted + retainedActual);
    const commitment = items.reduce((total, item) => total + nokToOre(item.commitmentNok ?? "0.00"), nokToOre(unallocated?.commitmentNok ?? "0.00") + retained.reduce((total, entry) => total + nokToOre(entry.commitmentNok ?? "0.00"), 0n));
    const system: PublicSystemBudget = {
      id: catalog.id, code: catalog.code, name: catalog.name, active: catalog.active,
      plannedNok: formatOre(planned), actualNok: formatOre(actual), differenceNok: formatOre(planned - actual),
      unbudgetedNok: formatOre(unbudgeted), commitmentNok: formatOre(commitment), usedFraction: usedFraction(actual, planned),
      unbudgetedItemId: unallocated?.id ?? null, unbudgetedPublicRef: unallocated?.publicRef ?? null,
      ...(input.includePrivateUnallocated && unallocated ? { unallocated: { id: unallocated.id, publicRef: unallocated.publicRef, note: unallocated.note, revision: unallocated.revision, actualNok: unallocated.actualNok } } : {}),
      items,
    };
    let department = departments.get(catalog.departmentKey);
    if (!department) {
      department = { departmentKey: catalog.departmentKey, name: catalog.departmentName, sortOrder: catalog.sortOrder,
        plannedNok: "0.00", actualNok: "0.00", differenceNok: "0.00", unbudgetedNok: "0.00", commitmentNok: "0.00", usedFraction: null, systems: [] };
      departments.set(catalog.departmentKey, department);
    }
    department.systems.push(system);
    if (catalog.active) choices.systems.push({ id: catalog.id, code: catalog.code, name: catalog.name, departmentKey: catalog.departmentKey, active: catalog.active,
      unbudgetedItemId: system.unbudgetedItemId, unbudgetedPublicRef: system.unbudgetedPublicRef });
    for (const item of items) if (item.approved === true && item.status !== "cancelled") choices.items.push({ id: item.id, publicRef: item.publicRef, description: item.description, systemId: item.systemId, status: item.status });
  }
  return { choices, departments: [...departments.values()].map(({ sortOrder: _order, ...department }) => {
    const sum = (field: "plannedNok" | "actualNok" | "unbudgetedNok" | "commitmentNok") => department.systems.reduce((total, system) => total + nokToOre(system[field] ?? "0.00"), 0n);
    const plan = sum("plannedNok"), actual = sum("actualNok");
    return { ...department, plannedNok: formatOre(plan), actualNok: formatOre(actual), differenceNok: formatOre(plan - actual), unbudgetedNok: formatOre(sum("unbudgetedNok")), commitmentNok: formatOre(sum("commitmentNok")), usedFraction: usedFraction(actual, plan) };
  }) };
}
