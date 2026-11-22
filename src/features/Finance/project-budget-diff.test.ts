import { describe, expect, it } from "vitest";
import { projectBudgetDiff } from "./project-budget-diff";
import type {
  ProjectBudgetEntry,
  ProjectBudgetVersion,
} from "./project-budget-types";
const entry: ProjectBudgetEntry = {
  entryId: "stable",
  budgetItemId: "stable",
  publicRef: "BI-001",
  systemId: "system",
  description: "Frame tubes",
  category: "material",
  plannedNok: "100.00",
  ordinaryPriority: "P2",
  priority: "P2",
  reuseStatus: "new",
  status: "planned",
  actualNok: "25.00",
  completion: "partial",
};
const version = (
  entries: ProjectBudgetEntry[],
  totalNok: string,
): ProjectBudgetVersion => ({
  id: crypto.randomUUID(),
  versionNumber: 1,
  revision: 1,
  status: "approved",
  submittedAt: null,
  departmentApprovedAt: null,
  departmentApprovedBy: null,
  approvedAt: null,
  approvedBy: null,
  entries,
  totalNok,
});
describe("reviewing proposed budget contents", () => {
  it("shows every changed plan field and exact old/new totals without treating actuals as plan changes", () => {
    const before = version([entry], "999999999999999.99");
    const after = version(
      [
        {
          ...entry,
          description: "Replacement tubes",
          plannedNok: "101.01",
          systemId: "electronics",
          ordinaryPriority: "P1",
          priority: "P1",
          category: "component",
          reuseStatus: "reuse",
          expectedPurchaseDate: "2026-12-01",
          ownerMemberId: "owner",
          ownerEmail: "owner@example.invalid",
          status: "active",
          note: "Supplier quote",
          earmarkId: "funding",
          actualNok: "75.00",
          invoices: [],
        },
      ],
      "1000000000000000.00",
    );
    const diff = projectBudgetDiff(before, after);
    expect(diff.netTotalNok).toBe("0.01");
    expect(diff.entries[0].changes.map((change) => change.field)).toEqual([
      "description",
      "systemId",
      "plannedNok",
      "ordinaryPriority",
      "priority",
      "category",
      "reuseStatus",
      "expectedPurchaseDate",
      "ownerMemberId",
      "ownerEmail",
      "status",
      "note",
      "earmarkId",
    ]);
    expect(
      diff.entries[0].changes.find((change) => change.field === "plannedNok"),
    ).toEqual({ field: "plannedNok", before: "100.00", after: "101.01" });
  });
  it("classifies stable removals and additions and keeps purchased removed-entry history available", () => {
    const diff = projectBudgetDiff(
      version([entry], "100.00"),
      version(
        [
          { ...entry, removed: true },
          {
            ...entry,
            entryId: "new",
            description: "Motor",
            plannedNok: "40.00",
            budgetItemId: null,
          },
        ],
        "40.00",
      ),
    );
    expect(diff.counts).toEqual({
      added: 1,
      removed: 1,
      changed: 0,
      unchanged: 0,
    });
    expect(diff.netTotalNok).toBe("-60.00");
    expect(diff.entries[0]).toMatchObject({
      kind: "removed",
      entryId: "stable",
      before: { actualNok: "25.00", publicRef: "BI-001" },
      after: null,
    });
  });
  it("does not claim a change when only fulfillment or invoice facts change", () => {
    const diff = projectBudgetDiff(
      version([entry], "100.00"),
      version(
        [
          {
            ...entry,
            actualNok: "100.00",
            completion: "complete",
            invoices: [],
          },
        ],
        "100.00",
      ),
    );
    expect(diff.counts.unchanged).toBe(1);
    expect(diff.netTotalNok).toBe("0.00");
  });
});
