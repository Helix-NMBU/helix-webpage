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
    session.capabilities = { registerActual: true, purchaseRegister: false } as FinanceCapabilitySet;
    session.purchases = { ownRequests: [], viewVersion: 1 };
    session.mutate.mockReset();
    session.loadPage.mockReset();
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
    expect(container.textContent).not.toContain("Purchase register");
  });

  it("shows the unpaid register and payment, void, and review controls to finance", async () => {
    session.capabilities = {
      registerActual: true,
      purchaseRegister: true,
      paymentsVoidReview: true,
      filesAndRefunds: true,
    } as FinanceCapabilitySet;
    session.purchases = {
      viewVersion: 2,
      ownRequests: [],
      unpaidCount: 1,
      register: [{
        id: "purchase-1",
        publicRef: "2026-0042",
        status: "registered",
        buyerName: "Buyer Example",
        supplierName: "Supplier Example",
        requesterMemberId: "member",
        requesterName: "Member Example",
        paymentMethod: "outlay",
        purchaseDate: "2026-10-01",
        justification: "Workshop material for the frame",
        documentKind: "invoice",
        documentNumber: "INV-1001",
        revision: 0,
        voidReason: null,
        totalNok: "250.00",
        refundAccount: "10000000001",
        refundPhone: null,
        unpaid: true,
        invoice: { dueDate: "2026-11-15", paid: false, paidOn: null },
        reimbursement: { paid: false, paidOn: null },
        lines: [{ id: "line-1", publicRef: "2026-0042-L1", systemName: "Frame", itemName: "Tube", description: "Tube set", amountNok: "250.00", allocationNok: "250.00" }],
        documents: [{ id: "doc-1", publicRef: "2026-0042-D1", kind: "invoice", documentNumber: "INV-1001", originalName: "evidence.pdf" }],
        exceptions: [{ id: "review-1", kind: "missing_approval", reviewStatus: "open", facts: { totalOre: "25000" }, reason: null, actorMemberId: null, reviewedAt: null }],
      }],
    };
    await act(async () => { root.render(<PurchasesBoard />); });
    expect(container.textContent).toContain("Purchase register");
    expect(container.textContent).toContain("Unpaid only (1)");
    expect(container.textContent).toContain("INV-1001");
    expect(container.textContent).toContain("Mark invoice paid");
    expect(container.textContent).toContain("Mark outlay reimbursed");
    expect(container.textContent).toContain("Void purchase");
    expect(container.textContent).toContain("Record review");
    expect(container.textContent).not.toContain("Unvoid");
    const unpaid = container.querySelector("#unpaid-only");
    await act(async () => { unpaid?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(session.loadPage).toHaveBeenCalledWith("purchases", { unpaidOnly: true });
  });

  it("keeps void and review text when the save fails", async () => {
    session.capabilities = {
      registerActual: true,
      purchaseRegister: true,
      paymentsVoidReview: true,
    } as FinanceCapabilitySet;
    session.purchases = {
      viewVersion: 2,
      ownRequests: [],
      unpaidCount: 0,
      register: [{
        id: "purchase-1",
        publicRef: "2026-0042",
        status: "registered",
        buyerName: "Buyer Example",
        supplierName: "Supplier Example",
        requesterMemberId: "member",
        requesterName: "Member Example",
        paymentMethod: "team_account",
        purchaseDate: "2026-10-01",
        justification: "Workshop material for the frame",
        documentKind: "receipt",
        documentNumber: null,
        revision: 3,
        voidReason: null,
        totalNok: "10.00",
        refundAccount: null,
        refundPhone: null,
        unpaid: false,
        invoice: null,
        reimbursement: null,
        lines: [],
        documents: [],
        exceptions: [{ id: "review-1", kind: "overrun", reviewStatus: "open", facts: {}, reason: null, actorMemberId: null, reviewedAt: null }],
      }],
    };
    session.mutate.mockRejectedValue(new Error("Could not save the purchase."));
    await act(async () => { root.render(<PurchasesBoard />); });
    const voidReason = container.querySelector("#void-purchase-1") as HTMLTextAreaElement;
    const reviewReason = container.querySelector("#review-review-1") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setter?.call(voidReason, "Wrong supplier");
      voidReason.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(reviewReason, "Accepted late");
      reviewReason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const voidButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Void purchase");
    const reviewButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Record review");
    await act(async () => { voidButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { reviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect((container.querySelector("#void-purchase-1") as HTMLTextAreaElement).value).toBe("Wrong supplier");
    expect((container.querySelector("#review-review-1") as HTMLTextAreaElement).value).toBe("Accepted late");
  });
});
