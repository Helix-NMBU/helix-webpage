// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DepartmentProjectBudgetReview } from "./DepartmentProjectBudgetReview";
import type {
  ProjectBudgetEntry,
  ProjectBudgetVersion,
} from "./project-budget-types";
vi.mock("./InvoiceEvidence", () => ({
  InvoiceEvidence: ({ invoice }: { invoice: { originalName: string } }) => (
    <button>{invoice.originalName}</button>
  ),
}));
const entry = (
  id: string,
  changes: Partial<ProjectBudgetEntry> = {},
): ProjectBudgetEntry => ({
  entryId: id,
  budgetItemId: id,
  publicRef: id,
  systemId: "physical-system",
  description: id,
  category: "material",
  plannedNok: "100.00",
  ordinaryPriority: "P2",
  priority: "P2",
  reuseStatus: "new",
  status: "planned",
  actualNok: "0.00",
  completion: "not_purchased",
  ...changes,
});
const version = (
  entries: ProjectBudgetEntry[],
  totalNok: string,
): ProjectBudgetVersion => ({
  id: crypto.randomUUID(),
  versionNumber: 1,
  revision: 1,
  status: "approved",
  submittedAt: null,
  departmentApprovedBy: null,
  departmentApprovedAt: null,
  approvedBy: null,
  approvedAt: null,
  entries,
  totalNok,
});
const systems = [
  {
    id: "physical-system",
    code: "SYS",
    name: "Other department system",
    departmentName: "Other department",
  },
];
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shows every project entry with New, Changed, Removed and unchanged values, preserving physical systems", async () => {
  const before = version(
      [entry("changed"), entry("removed"), entry("unchanged")],
      "300.00",
    ),
    after = version(
      [
        entry("changed", { plannedNok: "120.25", note: "Quote updated" }),
        entry("removed", { removed: true }),
        entry("unchanged"),
        entry("new", { plannedNok: "30.00" }),
      ],
      "250.25",
    );
  await act(async () =>
    root.render(
      <DepartmentProjectBudgetReview
        approved={before}
        proposed={after}
        systems={systems}
        evidence={[]}
      />,
    ),
  );
  const rows = [...container.querySelectorAll("tbody tr")];
  expect(rows).toHaveLength(4);
  for (const text of [
    "New",
    "Changed",
    "Removed",
    "Unchanged",
    "NOK 300.00",
    "NOK 250.25",
    "NOK -49.75",
    "Previous:",
    "Package:",
    "Quote updated",
    "Other department system",
  ])
    expect(container.textContent).toContain(text);
  expect(
    rows.find((row) => row.textContent?.startsWith("removed"))?.textContent,
  ).toContain("NOK 100.00");
  expect(
    rows.find((row) => row.textContent?.startsWith("unchanged"))?.textContent,
  ).toContain("Unchanged");
});
it("refreshes actuals and all invoice evidence without mutating the fixed plan or its diff", async () => {
  const approved = version([entry("Frame")], "100.00"),
    proposed = version([entry("Frame", { plannedNok: "120.00" })], "120.00"),
    snapshot = JSON.stringify({ approved, proposed });
  const render = (amount: string) =>
    root.render(
      <DepartmentProjectBudgetReview
        approved={approved}
        proposed={proposed}
        systems={systems}
        evidence={[
          entry("Frame", {
            plannedNok: "9999.00",
            actualNok: amount,
            completion: "partial",
            invoices: [
              {
                documentId: "a",
                purchaseId: "purchase",
                purchaseRef: "2026-1",
                originalName: "First.pdf",
                backend: "private_storage",
                transferStatus: "stored",
                viewerUrl: null,
              },
              {
                documentId: "b",
                purchaseId: "purchase2",
                purchaseRef: "2026-2",
                originalName: "Second.pdf",
                backend: "google_drive",
                transferStatus: "needs_attention",
                viewerUrl: null,
              },
            ],
          }),
        ]}
      />,
    );
  await act(async () => render("60.00"));
  await act(async () => render("85.00"));
  expect(container.textContent).toContain("NOK 85.00");
  expect(container.textContent).toContain("NOK 120.00");
  expect(container.textContent).not.toContain("9,999");
  expect(container.textContent).toContain("Partially purchased");
  expect(container.querySelectorAll("button")).toHaveLength(2);
  expect(JSON.stringify({ approved, proposed })).toBe(snapshot);
});
it("compares a first submission without inventing an approved version", async () => {
  await act(async () =>
    root.render(
      <DepartmentProjectBudgetReview
        approved={null}
        proposed={version([entry("First entry")], "100.00")}
        systems={systems}
        evidence={[]}
      />,
    ),
  );
  expect(container.textContent).toContain("No approved budget");
  expect(container.textContent).toContain("New");
  expect(container.textContent).toContain("Previous: None");
  expect(container.textContent).toContain("NOK 100.00");
});

it("shows a newly awarded live P0 priority without rewriting the submitted plan or change comparison", async () => {
  const approved = version([entry("Frame")], "100.00"),
    proposed = version([entry("Frame", { plannedNok: "120.00" })], "120.00"),
    pinned = JSON.stringify({ approved, proposed });
  await act(async () =>
    root.render(
      <DepartmentProjectBudgetReview
        approved={approved}
        proposed={proposed}
        systems={systems}
        evidence={[entry("Frame")]}
      />,
    ),
  );
  await act(async () =>
    root.render(
      <DepartmentProjectBudgetReview
        approved={approved}
        proposed={proposed}
        systems={systems}
        evidence={[entry("Frame", { priority: "P0" })]}
      />,
    ),
  );
  expect(container.textContent).toContain("Current priority");
  expect(
    container.querySelector("tbody tr")?.children[3].textContent,
  ).toContain("P0");
  expect(container.textContent).toContain("Submitted priority P2");
  expect(
    [...container.querySelectorAll("dt")].some(
      (node) => node.textContent === "Effective priority",
    ),
  ).toBe(false);
  expect(JSON.stringify({ approved, proposed })).toBe(pinned);
});
