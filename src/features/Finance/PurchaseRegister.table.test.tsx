// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurchaseRegister } from "./PurchaseRegister";
import type { FinancePurchaseSummary } from "./types";

const mocks = vi.hoisted(() => ({ notify: vi.fn(), end: undefined as undefined | (() => void) }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => mocks.notify }));
vi.mock("../MemberCV/session", () => ({ watchMemberSession: (end: () => void) => { mocks.end = end; return () => undefined; } }));
const row: FinancePurchaseSummary = { id: "purchase", departmentId: "mechanical", departmentName: "Mechanical & Production", projectId: "project", projectName: "Chassis development", publicRef: "PUR-1", status: "registered", buyerName: "Buyer", supplierName: "Workshop supplier", requesterMemberId: null, requesterName: null, paymentMethod: "invoice", purchaseDate: "2026-11-19", justification: "Frame materials", documentKind: "invoice", documentNumber: "INV-1", revision: 2, voidReason: null, totalNok: "1250.50", refundAccount: "private-account", refundPhone: null, unpaid: true, invoice: { paid: false, paidOn: null, dueDate: "2026-12-01" }, reimbursement: null,
  lines: [{ id: "line", publicRef: "L-1", systemName: "Frame", itemName: "Tube", description: "Tube set", amountNok: "1250.50", allocationNok: "1250.50" }], exceptions: [], documents: [] };
let root: Root, container: HTMLDivElement;
const mutate = vi.fn(async (_action: unknown) => ({ ok: true as const, viewVersion: 2, warnings: [], errors: [] }));
const changed = vi.fn(async () => undefined), ended = vi.fn(), toggle = vi.fn();
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.notify.mockReset(); changed.mockClear(); ended.mockClear(); toggle.mockClear(); mutate.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(canAct = true) { await act(async () => root.render(<PurchaseRegister presentation="table" register={[row]} unpaidCount={1} unpaidOnly={false} today="2026-11-22" canAct={canAct} onToggleUnpaid={toggle} onMutate={mutate} onChanged={changed} onAccessEnded={ended} />)); }
async function open() { await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open purchase PUR-1"]')!.click()); }
it("shows compact purchase rows with no payment or review forms until opened", async () => {
  await render();
  expect([...container.querySelectorAll("th")].map(cell => cell.textContent)).toEqual(["Purchase", "Project", "Date", "Amount", "Payment", "Invoice"]);
  expect(container.textContent).toContain("Chassis development"); expect(container.textContent).not.toContain("Workshop supplier"); expect(container.textContent).toContain("Tube set"); expect(container.textContent).toContain("NOK 1,250.50"); expect(container.textContent).not.toContain("Link to invoice"); expect(container.querySelector('[aria-label="Purchase actions for PUR-1"]')).not.toBeNull();
  expect(container.textContent).not.toContain("private-account"); expect(document.querySelector('[role="dialog"]')).toBeNull();
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Open purchase PUR-1"]')!;
  trigger.focus(); await open();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Mark paid");
  const mark = [...document.querySelectorAll("button")].find(button => button.textContent === "Mark paid")!;
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Payment date");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Void reason");
  await act(async () => mark.click());
  const savePayment = [...document.querySelectorAll("button")].find(button => button.textContent === "Save payment")!;
  await act(async () => savePayment.click());
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "markInvoicePaid", purchaseId: "purchase", paidOn: "2026-11-22", expectedRevision: 2 }));
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot="sheet-close"]')!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull(); await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
it("searches purchases and keeps the existing unpaid filter", async () => {
  await render();
  const search = container.querySelector<HTMLInputElement>('[aria-label="Search purchases"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(search,"non-matching"); search.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).toContain("No purchases match your filters."); expect(container.textContent).not.toContain("Workshop supplier");
  await act(async () => container.querySelector<HTMLButtonElement>('#unpaid-only')!.click());
  expect(toggle).toHaveBeenCalledWith(true);
});
it("keeps read-only viewers from payment controls and clears an open panel when access ends", async () => {
  await render(false); await open();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Workshop supplier");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Mark paid");
  await act(async () => mocks.end!());
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(container.textContent).not.toContain("Workshop supplier"); expect(ended).toHaveBeenCalledOnce();
});

it("shows specific open review reasons once and preserves reviewed or voided records without pills", async () => {
  const reviews = ["overrun", "budget_overrun", "unbudgeted"] as const;
  const flagged: FinancePurchaseSummary = { ...row, exceptions: reviews.map((kind,index) => ({ id: String(index), kind, reviewStatus: "open", facts: {}, reason: null, actorMemberId: null, reviewedAt: null })) };
  const renderRow = async (value: FinancePurchaseSummary) => act(async () => root.render(<PurchaseRegister presentation="table" register={[value]} unpaidCount={1} unpaidOnly={false} today="2026-11-22" canAct onToggleUnpaid={toggle} onMutate={mutate} onChanged={changed} onAccessEnded={ended} />));
  await renderRow(flagged);
  expect(container.textContent).toContain("Over budget"); expect(container.textContent).toContain("Unbudgeted"); expect(container.textContent).not.toContain("Review needed");
  expect(container.querySelectorAll('[data-variant="destructive"]')).toHaveLength(2);
  expect([...container.querySelectorAll('[data-slot="badge"]')].filter(badge => badge.textContent === "Over budget")).toHaveLength(1);
  await renderRow({ ...flagged, exceptions: flagged.exceptions.map(review => ({ ...review, reviewStatus: "reviewed" })) });
  expect(container.textContent).not.toContain("Over budget"); expect(container.textContent).not.toContain("Unbudgeted");
  await renderRow({ ...flagged, status: "voided" });
  expect(container.textContent).not.toContain("Over budget"); expect(container.textContent).not.toContain("Unbudgeted");
});

it("combines department, project and unpaid filters, narrows projects, and clears selections", async () => {
  const rows = [row, { ...row, id: "wheels", publicRef: "PUR-2", projectId: "wheels", projectName: "Wheel assembly", unpaid: false }, { ...row, id: "software", publicRef: "PUR-3", departmentId: "software", departmentName: "Software", projectId: "autonomy", projectName: "Autonomous systems" }];
  const renderRows = async (unpaidOnly=false) => act(async () => root.render(<PurchaseRegister presentation="table" register={rows} unpaidCount={2} unpaidOnly={unpaidOnly} today="2026-11-22" canAct onToggleUnpaid={toggle} onMutate={mutate} onChanged={changed} onAccessEnded={ended} />));
  const choose = async (label:string, option:string) => {
    await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === option)!.click());
  };
  await renderRows();
  await choose("Filter by department", "Mechanical & Production");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Filter by project"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  expect([...document.querySelectorAll('[role="option"]')].map(option=>option.textContent)).toEqual(["All projects", "Chassis development", "Wheel assembly"]);
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent === "Wheel assembly")!.click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1); expect(container.querySelector("tbody")?.textContent).toContain("PUR-2");
  await renderRows(true); expect(container.textContent).toContain("No purchases match your filters.");
  await choose("Filter by department", "Software");
  expect(container.querySelector('[aria-label="Filter by project"]')?.textContent).toBe("All projects");
  expect(container.querySelector("tbody")?.textContent).toContain("Autonomous systems");
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent === "Clear filters")!.click());
  expect(toggle).toHaveBeenLastCalledWith(false); await renderRows();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
});

it("opens review and correction forms only when requested and retains the existing review operation", async () => {
  const flagged: FinancePurchaseSummary = { ...row, exceptions: [{ id: "review-1", kind: "budget_overrun", reviewStatus: "open", facts: {}, reason: null, actorMemberId: null, reviewedAt: null }] };
  await act(async () => root.render(<PurchaseRegister presentation="table" register={[flagged]} unpaidCount={1} unpaidOnly={false} today="2026-11-22" canAct onToggleUnpaid={toggle} onMutate={mutate} onChanged={changed} onAccessEnded={ended} />));
  await open();
  const click = async (name: string) => act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === name)!.click());
  expect(document.querySelector("textarea")).toBeNull();
  expect([...document.querySelectorAll("button")].some(button=>button.textContent === "Void purchase")).toBe(false);
  await click("Review");
  const comment = document.getElementById("panel-review-review-1") as HTMLTextAreaElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(comment,"Reviewed the supplier price increase."); comment.dispatchEvent(new Event("input", { bubbles: true })); });
  await click("Record review");
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "reviewException", reviewId: "review-1", reason: "Reviewed the supplier price increase." }));
  expect(document.getElementById("panel-review-review-1")).toBeNull();
  await click("More details");
  await click("Void purchase");
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  expect(document.getElementById("panel-void-purchase")).not.toBeNull();
  expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent === "Confirm void")!.disabled).toBe(true);
  await click("Cancel");
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(mutate.mock.calls.some(call => (call[0] as {action?:string})?.action === "voidPurchase")).toBe(false);
});

it("groups repeated budget flags and records each audit review with the shared comment", async () => {
  const flagged: FinancePurchaseSummary = { ...row, exceptions: ["review-a", "review-b"].map(id => ({ id, kind: "unbudgeted", reviewStatus: "open", facts: {}, reason: null, actorMemberId: null, reviewedAt: null })) };
  await act(async () => root.render(<PurchaseRegister presentation="table" register={[flagged]} unpaidCount={1} unpaidOnly={false} today="2026-11-22" canAct onToggleUnpaid={toggle} onMutate={mutate} onChanged={changed} onAccessEnded={ended} />));
  await open();
  const reviews = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(button=>button.textContent === "Review");
  expect(reviews).toHaveLength(1);
  await act(async () => reviews[0].click());
  const comment = document.getElementById("panel-review-review-a") as HTMLTextAreaElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(comment,"Reviewed incurred costs."); comment.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Applies to all 2 related flags.");
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent === "Record review")!.click());
  expect(mutate.mock.calls.map(call=>(call[0] as {reviewId:string}).reviewId)).toEqual(["review-a", "review-b"]);
  expect(mutate).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: "reviewException", reason: "Reviewed incurred costs." }));
});
