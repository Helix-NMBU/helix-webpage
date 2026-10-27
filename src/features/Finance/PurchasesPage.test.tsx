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
    session.capabilities = { registerActual: true, purchaseRegister: false } as FinanceCapabilitySet;
    session.purchases = { ownRequests: [], viewVersion: 1 };
    session.mutate.mockReset();
    session.loadPage.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(container.textContent).not.toContain("Finance tools");
  });

  it("keeps different upload IDs for files with the same name", async () => {
    let count = 0;
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    session.mutate.mockImplementation(async (body: { action: string }) => {
      if (body.action === "authorizeUpload") return { id: ids[count++], uploadUrl: "https://upload.test", ok: true, warnings: [], errors: [] };
      if (body.action === "checkPurchase") return { ok: true, warnings: [], errors: [{ field: "purchase", message: "Stop before registration" }] };
      return { ok: true, warnings: [], errors: [] };
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await act(async () => { root.render(<PurchasesBoard />); });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    for (let i = 0; i < 2; i += 1) {
      const file = new File(["%PDF-1.4"], "receipt.pdf", { type: "application/pdf" });
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    }
    expect([...container.querySelectorAll("li")].filter((item) => item.textContent === "receipt.pdf — ready")).toHaveLength(2);
    await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const check = session.mutate.mock.calls.find(([body]) => body.action === "checkPurchase")?.[0] as unknown as { purchase: { uploadIds: string[] } };
    expect(check.purchase.uploadIds).toEqual(ids);
  });

  it("reuses the registration ID after a lost response", async () => {
    let attempts = 0;
    session.mutate.mockImplementation(async (body: { action: string }) => {
      if (body.action === "registerPurchase" && attempts++ === 0) throw new Error("Response lost");
      return { ok: true, warnings: [], errors: [], id: "saved" };
    });
    await act(async () => { root.render(<PurchasesBoard />); });
    for (let i = 0; i < 2; i += 1) {
      await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    }
    const calls = session.mutate.mock.calls.map(([body]) => body).filter((body) => body.action === "registerPurchase") as Array<{ requestId: string }>;
    expect(calls).toHaveLength(2);
    expect(calls[0].requestId).toBe(calls[1].requestId);
  });

  it("submits the ID and revision returned when a new request is saved", async () => {
    session.mutate.mockImplementation(async (body: { action: string }) => body.action === "saveRequest"
      ? { ok: true, viewVersion: 2, warnings: [], errors: [], id: "new-request", revision: 4 }
      : { ok: true, viewVersion: 3, warnings: [], errors: [], id: "new-request" });
    await act(async () => { root.render(<PurchasesBoard />); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "New request")!.click(); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Submit")!.click(); });
    const submit = session.mutate.mock.calls.map(([body]) => body).find((body) => body.action === "submitRequest");
    expect(submit).toEqual(expect.objectContaining({ requestRecordId: "new-request", expectedRevision: 4 }));
  });

  it("retries an unchanged request save with the same ID after a lost response", async () => {
    let saves = 0;
    session.mutate.mockImplementation(async (body: { action: string }) => {
      if (body.action === "saveRequest" && saves++ === 0) throw new Error("Response lost");
      return { ok: true, viewVersion: 2, warnings: [], errors: [], id: "new-request", revision: 0 };
    });
    await act(async () => { root.render(<PurchasesBoard />); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "New request")!.click(); });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Submit")!.click(); });
    }
    const savesMade = session.mutate.mock.calls.map(([body]) => body).filter((body) => body.action === "saveRequest") as Array<{ requestId: string }>;
    expect(savesMade).toHaveLength(2);
    expect(savesMade[0].requestId).toBe(savesMade[1].requestId);
  });

  it("opens the selected request after its asynchronous detail arrives", async () => {
    session.purchases = { viewVersion: 1, ownRequests: [{ id: "draft-1", publicRef: "RQ-S27-001", status: "draft", plannedDate: null,
      approvedNok: null, fulfilledNok: "0.00", remainingNok: "0.00", releasedNok: "0.00" }] };
    await act(async () => { root.render(<PurchasesBoard />); });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "RQ-S27-001")!.click(); });
    session.purchases = { ...session.purchases, detail: { id: "draft-1", publicRef: "RQ-S27-001", status: "draft", revision: 2,
      supplierName: "Selected supplier", justification: "Frame materials", plannedDate: "2026-10-10", lateReason: null, closeReason: null,
      releasedNok: "0.00", draftLines: [], submittedRevisionId: null, approvedRevisionId: null, revisions: [],
      approvedNok: null, fulfilledNok: "0.00", remainingNok: "0.00" } };
    await act(async () => { root.render(<PurchasesBoard />); });
    expect((container.querySelector("#supplier") as HTMLInputElement).value).toBe("Selected supplier");
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
    expect(session.mutate).not.toHaveBeenCalled();
    const confirmVoid = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Confirm void");
    expect(confirmVoid).toBeDefined();
    await act(async () => { confirmVoid?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "voidPurchase" }));
    await act(async () => { reviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect((container.querySelector("#void-purchase-1") as HTMLTextAreaElement).value).toBe("Wrong supplier");
    expect((container.querySelector("#review-review-1") as HTMLTextAreaElement).value).toBe("Accepted late");
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
