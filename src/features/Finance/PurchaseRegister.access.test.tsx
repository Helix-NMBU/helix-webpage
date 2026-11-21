// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurchaseRegister } from "./PurchaseRegister";
import type { FinancePurchaseSummary } from "./types";
const mocks = vi.hoisted(() => ({ notify: vi.fn(), end: undefined as undefined | (() => void) }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => mocks.notify }));
vi.mock("../MemberCV/session", () => ({ watchMemberSession: (end: () => void) => { mocks.end = end; return () => undefined; } }));
let root: Root, container: HTMLDivElement;
const changed = vi.fn(async () => undefined), ended = vi.fn();
const saved = { ok: true as const, id: "purchase", viewVersion: 2, warnings: [], errors: [] };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const row: FinancePurchaseSummary = {
  id: "purchase", publicRef: "PUR-1", status: "registered", buyerName: "Buyer", supplierName: "Private supplier",
  requesterMemberId: null, requesterName: null, paymentMethod: "invoice", purchaseDate: "2026-11-19",
  justification: "Private purchase details", documentKind: "invoice", documentNumber: "INV-1", revision: 2,
  voidReason: null, totalNok: "100.00", refundAccount: "private-account", refundPhone: null, unpaid: true,
  invoice: { paid: false, paidOn: null, dueDate: null }, reimbursement: null, lines: [], exceptions: [],
  documents: [
    { id: "stored", publicRef: "DOC-1", kind: "invoice", documentNumber: null, originalName: "Private.pdf", backend: "google_drive", transferStatus: "stored" },
    { id: "pending", publicRef: "DOC-2", kind: "invoice", documentNumber: null, originalName: "Pending.pdf", backend: "google_drive", transferStatus: "pending", transferRevision: 2, canRetry: true },
  ],
};
let mutate = vi.fn(async (_change: unknown) => saved);
async function render() {
  await act(async () => root.render(<PurchaseRegister register={[row]} unpaidCount={1} unpaidOnly={false} today="2026-11-20" canAct onToggleUnpaid={vi.fn()} onMutate={mutate} onChanged={changed} onAccessEnded={ended} />));
}
async function click(label: string) {
  const target = [...document.body.querySelectorAll("button")].find(button => button.textContent === label);
  expect(target).toBeTruthy();
  await act(async () => target!.click());
}
async function input(id: string, value: string) {
  await act(async () => {
    const target = document.getElementById(id)!;
    Object.getOwnPropertyDescriptor(target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.notify.mockReset(); mocks.end = undefined; changed.mockReset().mockResolvedValue(undefined); ended.mockReset();
  mutate = vi.fn(async () => saved);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([401, 403].flatMap(status => ["Open invoice", "Mark invoice paid"].map(action => ({ status, action }))))("clears all private register rows/forms on $action denial $status", async ({ status, action }) => {
  mutate.mockRejectedValueOnce(Object.assign(new Error("Authority revoked"), { status }));
  await render(); await input("void-purchase", "Private correction reason"); await click(action);
  expect(container.textContent).not.toContain("Private supplier");
  expect(document.getElementById("void-purchase")).toBeNull();
  expect(ended).toHaveBeenCalledOnce();
  expect(mocks.notify.mock.calls[mocks.notify.mock.calls.length - 1][2].action).toBeUndefined();
  await render();
  expect(container.textContent).not.toContain("Private supplier");
});
it("clears an open confirmation and all register fields when retry's refresh denies authority", async () => {
  const pending = deferred<typeof saved>(); mutate.mockReturnValueOnce(pending.promise);
  changed.mockRejectedValueOnce(Object.assign(new Error("Access ended"), { status: 403 }));
  await render(); await click("Retry invoice transfer");
  await input("void-purchase", "Private correction reason"); await click("Void purchase");
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  await act(async () => pending.resolve(saved));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).not.toContain("private-account");
  expect(ended).toHaveBeenCalledOnce();
});
it("ignores a late payment success after a concurrent invoice denial", async () => {
  const payment = deferred<typeof saved>();
  mutate.mockReturnValueOnce(payment.promise).mockRejectedValueOnce(Object.assign(new Error("Revoked"), { status: 401 }));
  await render(); await click("Mark invoice paid"); await click("Open invoice");
  await act(async () => payment.resolve(saved));
  expect(container.textContent).not.toContain("Private supplier");
  expect(changed).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalledWith("Invoice marked paid", expect.anything(), expect.anything());
  expect(ended).toHaveBeenCalledOnce();
});
it("drops a pending invoice open when the session ends", async () => {
  const opening = deferred<typeof saved & { viewerUrl: string }>();
  mutate.mockReturnValueOnce(opening.promise);
  const link = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await render(); await click("Open invoice"); await act(async () => mocks.end!());
  await act(async () => opening.resolve({ ...saved, viewerUrl: "https://drive.google.com/file/d/old/view" }));
  expect(link).not.toHaveBeenCalled(); expect(ended).toHaveBeenCalledOnce();
  expect(container.textContent).not.toContain("Private supplier");
});
it.each([400, 409, null])("retains recoverable register input and retry identity after %s", async status => {
  mutate.mockRejectedValueOnce(Object.assign(new Error("Try again"), status ? { status } : {}));
  await render(); await input("void-purchase", "Keep this reason"); await click("Mark invoice paid");
  expect((document.getElementById("void-purchase") as HTMLTextAreaElement).value).toBe("Keep this reason");
  expect(ended).not.toHaveBeenCalled();
  const retry = mocks.notify.mock.calls[mocks.notify.mock.calls.length - 1][2].action.onClick;
  await act(async () => retry());
  expect(mutate.mock.calls[0]).toEqual(mutate.mock.calls[1]);
});

it.each([401, 403])("clears the whole register when a successful payment's refresh denies authority: %s", async status => {
  changed.mockRejectedValueOnce(Object.assign(new Error("Refresh denied"), { status }));
  await render(); await click("Mark invoice paid");
  expect(container.textContent).not.toContain("Private supplier");
  expect(ended).toHaveBeenCalledOnce();
  expect(mutate).toHaveBeenCalledOnce();
  expect(mocks.notify.mock.calls[mocks.notify.mock.calls.length - 1][2].action).toBeUndefined();
});
it("retries only the read after a committed payment's refresh fails", async () => {
  changed.mockRejectedValueOnce(new Error("Read response lost"));
  await render(); await click("Mark invoice paid");
  expect(container.textContent).toContain("Private supplier");
  const notification = mocks.notify.mock.calls[mocks.notify.mock.calls.length - 1];
  expect(notification[0]).toBe("Could not refresh purchase register");
  await act(async () => notification[2].action.onClick());
  expect(changed).toHaveBeenCalledTimes(2);
  expect(mutate).toHaveBeenCalledOnce();
  expect(ended).not.toHaveBeenCalled();
});
