// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceCapabilitySet, PublicBudgets, PurchasesView } from "./types";

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
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => vi.fn() }));

import { PurchasesBoard } from "./PurchasesPage";

describe("PurchasesPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
  });
});
