// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBudgetsPanel } from "./ProjectBudgetsPanel";
import type { ProjectBudgetRepository } from "./project-budget-repository";
import type {
  ProjectBudgetDetail,
  ProjectBudgetEntry,
  ProjectBudgetStage,
  ProjectBudgetWorkspace,
} from "./project-budget-types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("./ProjectBudgetPurchases",()=>({ProjectBudgetPurchases:()=>null}));
vi.mock("./FundingBudgetProposals",()=>({FundingBudgetProposals:()=>null}));
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
}));
const caps = {
  canRead: true,
  canDraft: false,
  canReviewDepartment: false,
  canApproveFinance: true,
  canRequestChanges: true,
  canRegisterPurchase: true,
  canReadFinance: true,
  canRecordAward: true,
  canReleaseObligation: true,
};
let root: Root,
  container: HTMLDivElement,
  repository: ProjectBudgetRepository,
  workspace: ProjectBudgetWorkspace,
  details: ProjectBudgetDetail[];
function header(
  index: number,
  approved: boolean,
  stage: ProjectBudgetStage | null,
  department = "Mechanical & Production",
): ProjectBudgetDetail {
  const entry: ProjectBudgetEntry = {
    entryId: `entry-${index}`,
    budgetItemId: `entry-${index}`,
    publicRef: `BI-${index}`,
    systemId: "system",
    description: `Material ${index}`,
    plannedNok: "100.00",
    actualNok: "0.00",
    completion: "partial",
    priority: "P0",
    ordinaryPriority: "P2",
    category: "material",
    reuseStatus: "new",
    status: "planned",
    invoices: [],
  };
  const version = (id: string, status: ProjectBudgetStage) => ({
    id,
    versionNumber: status === "approved" ? 1 : 2,
    revision: 1,
    status,
    submittedAt: null,
    departmentApprovedBy: null,
    departmentApprovedAt: null,
    approvedBy: null,
    approvedAt: null,
    entries: [structuredClone(entry)],
    totalNok: "100.00",
  });
  return {
    id: `budget-${index}`,
    projectId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    projectName: `Project ${index}`,
    seasonId: "season",
    seasonCode: "S27",
    responsibleDepartmentId:
      department === "Mechanical & Production" ? "mechanical" : "electronics",
    responsibleDepartmentName: department,
    revision: 3,
    approvedVersionId: approved ? `approved-${index}` : null,
    pendingVersionId: stage ? `pending-${index}` : null,
    pendingStage: stage,
    approvedTotalNok: approved ? "100.00" : "0.00",
    pendingTotalNok: stage ? "150.00" : null,
    capabilities: { ...caps },
    approvedVersion: approved ? version(`approved-${index}`, "approved") : null,
    pendingVersion: stage
      ? { ...version(`pending-${index}`, stage), totalNok: "150.00" }
      : null,
    decisions: [],
  };
}
async function render() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ProjectBudgetsPanel repository={repository} />
      </MemoryRouter>,
    ),
  );
}

async function choose(id: string, label: string) {
  const trigger = document.getElementById(id)!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((o) => o.textContent === label);
  expect(option, label).toBeTruthy();
  await act(async () => option!.click());
  expect(document.activeElement).toBe(trigger);
}
const rows = () =>
  [
    ...container.querySelectorAll(
      '[aria-label="Project budget list"] tbody tr',
    ),
  ].map((row) => row.textContent);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  notify.mockReset();
  details = [
    header(1, true, "draft"),
    header(2, false, "finance_pending", "Electronics"),
    header(3, false, "department_pending"),
    header(4, true, null, "Electronics"),
  ];
  workspace = {
    viewVersion: 1,
    budgets: details,
    scopes: details.map((b) => ({
      memberId: "finance",
      projectId: b.projectId,
      seasonId: b.seasonId,
      seasonCode: b.seasonCode,
      projectName: b.projectName,
      projectLeadIds: [],
      responsibleDepartmentId: b.responsibleDepartmentId,
      departments: [
        {
          id: b.responsibleDepartmentId,
          name: b.responsibleDepartmentName,
          leadIds: [],
        },
      ],
      capabilities: { ...caps },
    })),
    systems: [
      {
        id: "system",
        name: "Frame",
        code: "SYS-FR",
        departmentName: "Mechanical & Production",
      },
    ],
  };
  repository = {
    load: vi.fn(async () => structuredClone(workspace)),
    detail: vi.fn(async (id) =>
      structuredClone(details.find((b) => b.id === id)!),
    ),
    mutate: vi.fn(),
    watchSession: () => () => {},
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("project budget overview", () => {
  it("keeps approved budgets in the approved filter during a pending revision and filters all submissions", async () => {
    await render();
    await choose("budget-stage-filter", "Approved");
    expect(rows()).toHaveLength(2);
    expect(rows().join(" ")).toContain("Project 1");
    expect(rows().join(" ")).toContain("Approved version remains available");
    await choose("budget-stage-filter", "All submitted budgets");
    expect(rows()).toHaveLength(2);
    expect(rows().join(" ")).toContain("Project 2");
    expect(rows().join(" ")).toContain("Project 3");
    expect(rows().join(" ")).not.toContain("Project 1");
  });
  it("combines project, responsible-department and stage filters with Radix focus recovery", async () => {
    await render();
    await choose("budget-project-filter", "Project 1");
    expect(rows()).toHaveLength(1);
    await choose("budget-department-filter", "Electronics");
    expect(rows()).toHaveLength(0);
    expect(container.textContent).toContain("No budgets match these filters.");
    await choose("budget-department-filter", "Mechanical & Production");
    await choose("budget-stage-filter", "Approved");
    expect(rows()).toHaveLength(1);
  });
  it("shows approved and proposed provenance, zero-cost partial fulfillment and every evidence provider", async () => {
    const row = details[0].pendingVersion!.entries[0];
    row.invoices = [
      {
        documentId: "legacy",
        purchaseId: "purchase-1",
        purchaseRef: "PUR-1",
        originalName: "Old invoice.pdf",
        backend: "private_storage",
        transferStatus: "stored",
        viewerUrl: null,
      },
      {
        documentId: "new",
        purchaseId: "purchase-2",
        purchaseRef: "PUR-2",
        originalName: "New invoice.pdf",
        backend: "google_drive",
        transferStatus: "needs_attention",
        transferRevision: 2,
        canRetry: true,
        viewerUrl: null,
      },
    ];
    await render();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open Project 1 budget"]',
        )!
        .click(),
    );
    expect(container.textContent).toContain(
      "Approved plan: NOK 100.00 · Proposed plan: NOK 150.00",
    );
    expect(container.textContent).toContain("Partially purchased");
    expect(container.textContent).toContain("NOK 0.00");
    expect(container.textContent).toContain("Old invoice.pdf");
    expect(container.textContent).toContain("New invoice.pdf");
    expect(
      container.querySelector(
        'a[href="/projects/10000000-0000-4000-8000-000000000001?tab=budget"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'a[href="/departments/mechanical-and-production?tab=budgets"]',
      ),
    ).not.toBeNull();
  });
  it("offers final approval only for the department-approved candidate", async () => {
    await render();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open Project 3 budget"]',
        )!
        .click(),
    );
    expect(
      [...container.querySelectorAll("button")].some(
        (b) => b.textContent === "Approve budget",
      ),
    ).toBe(false);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Open Project 2 budget"]',
        )!
        .click(),
    );
    expect(
      [...container.querySelectorAll("button")].some(
        (b) => b.textContent === "Approve budget",
      ),
    ).toBe(true);
  });
});
