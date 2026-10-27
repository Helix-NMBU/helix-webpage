// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceCapabilitySet, PublicBudgets, PurchasesView } from "./types";

const notify = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  capabilities: {
    registerActual: true,
    purchaseRegister: false,
  } as FinanceCapabilitySet,
  today: "2026-10-01",
  budgets: {
    viewVersion: 1,
    seasonCode: "S27",
    budgetStatus: "approved",
    approvedOn: "2026-10-01",
    revision: 1,
    departments: [],
    choices: { systems: [], items: [] },
  } as PublicBudgets,
  purchases: { ownRequests: [], viewVersion: 1 } as PurchasesView,
  mutate: vi.fn(),
  loadPage: vi.fn(),
}));

vi.mock("../MemberPlatform/FinanceAccess", () => ({
  useFinanceAccess: () => session,
  FinanceGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));

import { PurchasesBoard } from "./PurchasesPage";

describe("PurchasesPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    notify.mockReset();
    session.mutate.mockReset();
    session.capabilities = { registerActual: true, purchaseRegister: false } as FinanceCapabilitySet;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the registration form for members who can register actuals", async () => {
    await act(async () => {
      root.render(<PurchasesBoard />);
    });
    expect(container.textContent).toContain("Register a purchase");
    expect(container.textContent).toContain("Line amount is the total in NOK");
    expect(container.textContent).not.toContain("Finance tools");
  });

  it("reports finance export and delivery results through shared notifications", async () => {
    session.capabilities = { registerActual: true, purchaseRegister: true } as FinanceCapabilitySet;
    session.mutate.mockResolvedValue({
      ok: true,
      viewVersion: 2,
      warnings: [],
      errors: [],
      exportFile: { fileName: "purchases.csv", csv: "row_kind\r\n", byteSize: 10, contentSha256: "abc", delivery: "inline" },
      recovery: { sent: 0, failed: 0, uncertain: 1, skipped: 0, deleted: 0, message: "A delivery outcome is unknown. Reconcile it before retrying." },
    });
    await act(async () => { root.render(<PurchasesBoard />); });
    expect(container.textContent).toContain("Finance tools");
    const exportButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Export purchases");
    await act(async () => { exportButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "exportPurchases" }));
    expect(notify).toHaveBeenCalledWith("Purchase export ready", "The export is ready to save.", expect.objectContaining({ variant: "success" }));
    expect(JSON.stringify(notify.mock.calls)).not.toContain("X-Amz-");
    const deliver = [...container.querySelectorAll("button")].find((button) => button.textContent === "Deliver notifications");
    await act(async () => { deliver?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(notify).toHaveBeenCalledWith("Delivery needs reconciliation", "A delivery outcome is unknown. Reconcile it before retrying.", expect.objectContaining({ variant: "warning" }));
  });
});
