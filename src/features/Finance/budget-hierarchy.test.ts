import { expect, it } from "vitest";
import { buildBudgetHierarchy } from "./budget-hierarchy.js";
import type { PublicBudgetItem } from "./types.js";
const item = (id: string, overrides: Partial<PublicBudgetItem> = {}): PublicBudgetItem => ({
  id, publicRef: id, systemId: "sys", systemCode: "SYS", description: id, category: "material", plannedNok: "200.00", effectivePlanNok: "200.00", actualNok: "50.00", differenceNok: "150.00", priority: "P0", reuseStatus: "new", expectedPurchaseDate: null, status: "planned", revision: 1, earmarked: false, earmarkPurpose: null, earmarkAmountNok: null, approved: true, commitmentNok: "100.00", ...overrides,
});
const systems = [{ id: "sys", code: "SYS", name: "System", active: true, departmentKey: "dep", departmentName: "Department", sortOrder: 1 }];
it("sums effective plans and every actual once while retaining removed and unbudgeted expenses", () => {
  const input = { systems, items: [item("approved"), item("removed", { plannedNok: "500.00", effectivePlanNok: "0.00", actualNok: "25.00", status: "cancelled", commitmentNok: "0.00" }), item("unapproved", { approved: false, plannedNok: "1000.00", effectivePlanNok: "0.00", actualNok: "0.00", commitmentNok: "0.00" })], unallocated: [{ id: "unallocated", publicRef: "UNALLOCATED", systemId: "sys", note: "Private note", revision: 1, actualNok: "10.00" }], includePrivateUnallocated: false };
  const view = buildBudgetHierarchy(input);
  expect(view.departments[0]).toMatchObject({ plannedNok: "200.00", actualNok: "85.00", unbudgetedNok: "10.00", commitmentNok: "100.00" });
  expect(view.choices.items.map(choice => choice.id)).toEqual(["approved"]);
  expect(view.departments[0].systems[0].items).toHaveLength(3);
  expect(view.departments[0].systems[0].unallocated).toBeUndefined();
  expect(JSON.stringify(view)).not.toContain("Private note");
});
it("refuses duplicate stable identities rather than doubling a mapping copy", () => {
  expect(() => buildBudgetHierarchy({ systems, items: [item("same"), item("same")], unallocated: [], includePrivateUnallocated: true })).toThrow(/once/);
});

it("rejects a normal plan duplicated across accounting departments",()=>{
 expect(()=>buildBudgetHierarchy({systems:[...systems,{...systems[0],departmentKey:"other"}],items:[item("same",{allocationDepartmentKey:"dep"}),item("same",{allocationDepartmentKey:"other"})],unallocated:[],includePrivateUnallocated:false})).toThrow(/once/);
});
