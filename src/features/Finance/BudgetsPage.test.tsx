// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceRequestError } from "./repository";
import type { FinanceCapabilitySet, FinanceMutation, PublicBudgets } from "./types";

const notify = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  access: "allowed" as const,
  capabilities: null as FinanceCapabilitySet | null,
  profiles: [] as string[],
  viewVersion: 1,
  seasonCode: "S27",
  approvalThresholdNok: null,
  today: "2026-10-26",
  overview: null,
  budgets: null as PublicBudgets | null,
  purchases: null,
  financing: null,
  pageLoading: false,
  retry: vi.fn(),
  loadPage: vi.fn(async () => undefined),
  mutate: vi.fn(async (_action: FinanceMutation) => ({ ok: true as const, viewVersion: 2, id: "saved", warnings: [], errors: [] })),
}));

vi.mock("../MemberPlatform/FinanceAccess", () => ({
  useFinanceAccess: () => session,
  FinanceGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));

const memberCapabilities: FinanceCapabilitySet = {
  publicBudgets: true, publicEarmarks: true, registerActual: true, ownRequests: true,
  financing: false, manageFunding: false, purchaseRegister: false, filesAndRefunds: false, paymentsVoidReview: false,
  draftBudgetItems: false, permittedImports: false, createBudget: false, approveBudget: false, protectedBudgetEdits: false, decideRequests: false,
};

const openItem = {
  id: "item-open",
  publicRef: "BI-S27-001",
  systemId: "system-frame",
  systemCode: "SYS-FR",
  description: "Frame tube",
  category: "material",
  plannedNok: "20.00",
  effectivePlanNok: "20.00",
  actualNok: "9.00",
  differenceNok: "11.00",
  priority: "P1" as const,
  reuseStatus: "new" as const,
  expectedPurchaseDate: null,
  status: "planned" as const,
  revision: 3,
  earmarked: false,
  earmarkPurpose: null,
  earmarkAmountNok: null,
};

const cancelledItem = {
  ...openItem,
  id: "item-cancelled",
  publicRef: "BI-S27-002",
  description: "Old bracket",
  plannedNok: "50.00",
  effectivePlanNok: "0.00",
  actualNok: "9.00",
  differenceNok: "-9.00",
  status: "cancelled" as const,
  revision: 4,
};

function budgets(status: PublicBudgets["budgetStatus"] = "approved"): PublicBudgets {
  return {
    viewVersion: 1,
    seasonCode: "S27",
    budgetStatus: status,
    approvedOn: status === "approved" ? "2026-10-26" : null,
    revision: status === "approved" ? 1 : 0,
    choices: {
      systems: [{ id: "system-frame", code: "SYS-FR", name: "Frame", departmentKey: "mechanical-production", active: true, unbudgetedItemId: "unallocated", unbudgetedPublicRef: "BI-S27-FR-UNALLOC" }],
      items: [{ id: openItem.id, publicRef: openItem.publicRef, description: openItem.description, systemId: openItem.systemId, status: "planned" }],
    },
    departments: status === "absent" ? [] : [{
      departmentKey: "mechanical-production",
      name: "Mechanical",
      plannedNok: "20.00",
      actualNok: "18.00",
      differenceNok: "2.00",
      unbudgetedNok: "9.00",
      systems: [{
        id: "system-frame",
        code: "SYS-FR",
        name: "Frame",
        active: true,
        plannedNok: "20.00",
        actualNok: "18.00",
        differenceNok: "-9.00",
        unbudgetedNok: "9.00",
        unbudgetedItemId: "unallocated",
        unbudgetedPublicRef: "BI-S27-FR-UNALLOC",
        items: [openItem, cancelledItem],
      }],
    }],
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(page: "board" | "entry" = "board") {
  const { BudgetsBoard } = await import("./BudgetsPage");
  const { FinanceEntry } = await import("./FinancePages");
  const element = page === "board" ? <BudgetsBoard /> : <FinanceEntry page="budgets" />;
  const router = createMemoryRouter([{ path: "/", element }]);
  await act(async () => root.render(<RouterProvider router={router} />));
}

function setValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  session.loadPage.mockClear();
  session.mutate.mockReset().mockResolvedValue({ ok: true, viewVersion: 2, id: "saved", warnings: [], errors: [] });
  session.capabilities = memberCapabilities;
  session.budgets = budgets();
  session.viewVersion = 1;
  session.pageLoading = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("season budget page", () => {
  it("shows a public earmark and leaves a withheld one blank", async () => {
    const current = budgets();
    const frame = current.departments[0]?.systems[0];
    if (!frame) throw new Error("Missing system");
    frame.items = [
      { ...openItem, description: "Public tube", earmarked: true, earmarkPurpose: "Frame work", earmarkAmountNok: "80.00" },
      { ...openItem, id: "item-withheld", publicRef: "BI-S27-003", description: "Prospect tube", earmarked: true, earmarkPurpose: null, earmarkAmountNok: null },
    ];
    session.budgets = current;
    await render();
    expect(container.textContent).toContain("Public tube");
    expect(container.textContent).toContain("Frame work");
    expect(container.textContent).toContain("80.00");
    expect(container.textContent).toContain("Prospect tube");
    expect(container.textContent).not.toContain("Prospect work");
    expect(container.textContent).not.toContain("null");
  });

  it("shows members the hierarchy and keeps cancelled rows and maintenance hidden", async () => {
    await render();
    expect(container.textContent).toContain("Frame tube");
    expect(container.textContent).toContain("BI-S27-FR-UNALLOC");
    expect(container.textContent).toContain("Unbudgeted spending 9.00");
    expect(container.textContent).toContain("-9.00 Over plan");
    expect(container.textContent).toContain("Totals include spending on cancelled items");
    expect(container.textContent).not.toContain("Old bracket");
    expect(container.textContent).not.toContain("Create season budget");
    expect(container.textContent).not.toContain("Edit");
    await act(async () => { document.getElementById("show-cancelled")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("Old bracket");
    expect(container.textContent).toContain("Stored plan 50.00");
    expect(container.textContent).toContain("Effective plan 0.00");
  });

  it("lets the head create a missing budget and approve a draft from the budgets page", async () => {
    session.capabilities = { ...memberCapabilities, createBudget: true, approveBudget: true, draftBudgetItems: true, protectedBudgetEdits: true };
    session.budgets = { ...budgets("absent"), departments: [], choices: { systems: [], items: [] } };
    await render("entry");
    expect(container.textContent).not.toContain("No budget is published yet");
    expect(container.textContent).toContain("Create season budget");
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Create season budget")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "createBudget" }));
    session.budgets = { ...budgets("draft"), departments: [] };
    await render("entry");
    await act(async () => { [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Approve budget")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Approve")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "approveBudget", expectedRevision: 0 }));
    expect(notify).toHaveBeenCalledWith("Budget saved", "The season budget was approved.", expect.objectContaining({ variant: "success" }));
  });

  it("keeps a finance edit when the save is stale and uses the revision from when editing started", async () => {
    session.capabilities = { ...memberCapabilities, draftBudgetItems: true, financing: true };
    const current = budgets();
    const frame = current.departments[0]?.systems[0];
    if (!frame) throw new Error("Missing system");
    frame.unbudgetedItemId = null;
    session.budgets = current;
    const { BudgetsBoard } = await import("./BudgetsPage");
    await act(async () => root.render(<BudgetsBoard />));
    expect(container.textContent).toContain("Create unallocated item");
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Create unallocated item")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "ensureUnallocated", systemId: "system-frame" }));
    session.mutate.mockRejectedValue(new FinanceRequestError("This record changed before it could be saved. Review the latest values and try again.", 409));
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Edit")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const input = document.getElementById("Edit budget item-description");
    if (!(input instanceof HTMLInputElement)) throw new Error("Missing description field");
    await act(async () => { setValue(input, "Replaced tube"); });
    const refreshed = budgets();
    const revised = refreshed.departments[0]?.systems[0]?.items[0];
    if (revised) revised.revision = 9;
    session.budgets = refreshed;
    session.capabilities = { ...memberCapabilities, draftBudgetItems: true, financing: true };
    await act(async () => root.render(<BudgetsBoard />));
    const field = document.getElementById("Edit budget item-description");
    if (!(field instanceof HTMLInputElement)) throw new Error("Missing description field");
    expect(field.value).toBe("Replaced tube");
    const form = document.querySelector('form[aria-label="Edit budget item"]');
    await act(async () => { form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({
      action: "editItem",
      expectedRevision: 3,
      patch: expect.objectContaining({ description: "Replaced tube" }),
    }));
    expect(field.value).toBe("Replaced tube");
    expect(notify).toHaveBeenCalledWith("Could not save the budget change", expect.stringContaining("changed"), expect.objectContaining({ variant: "error" }));
    session.capabilities = memberCapabilities;
    await act(async () => root.render(<BudgetsBoard />));
    expect(container.textContent).not.toContain("Edit budget item");
  });
});
