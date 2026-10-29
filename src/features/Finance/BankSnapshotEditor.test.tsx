// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  viewVersion: 1,
  bankSnapshot: vi.fn(async () => null as null | { amountNok: string; asOfDate: string; updatedAt: string; revision: number }),
  mutate: vi.fn(async (_body: Record<string, unknown>) => { throw new Error("Balance changed"); }),
  setFormDirty: vi.fn(),
}));
vi.mock("../MemberPlatform/FinanceAccess", () => ({ useFinanceAccess: () => session }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
import { BankSnapshotEditor } from "./BankSnapshotEditor";

let root: Root | null = null;
afterEach(() => { if (root) act(() => root?.unmount()); root = null; vi.clearAllMocks(); });
it("keeps input after a failed save and provides recovery", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<BankSnapshotEditor />); });
  expect(container.textContent).toContain("No balance entered yet");
  await act(async () => { container.querySelector("button")?.click(); });
  const amount = container.querySelector<HTMLInputElement>("#bank-amount")!;
  const date = container.querySelector<HTMLInputElement>("#bank-date")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(amount, "123.45"); amount.dispatchEvent(new Event("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(date, "2026-10-29"); date.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(session.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "setBankSnapshot", amountNok: "123.45", asOfDate: "2026-10-29", expectedRevision: 0 }));
  expect(amount.value).toBe("123.45");
  expect(notify).toHaveBeenCalledWith("Could not save bank balance", "Balance changed", expect.objectContaining({ action: expect.objectContaining({ label: "Reload balance" }) }));
  container.remove();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const snapshot = (amountNok: string, revision: number) => ({ amountNok, revision, asOfDate: "2026-10-29", updatedAt: "2026-10-29T12:00:00Z" });

it("ignores older responses and responses after unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const older = deferred<ReturnType<typeof snapshot> | null>();
  const newer = deferred<ReturnType<typeof snapshot> | null>();
  session.bankSnapshot.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<BankSnapshotEditor />); });
  session.viewVersion++;
  await act(async () => { root?.render(<BankSnapshotEditor />); });
  await act(async () => { newer.resolve(snapshot("200.00", 2)); await newer.promise; });
  expect(container.textContent).toContain("200.00");
  await act(async () => { older.resolve(snapshot("100.00", 1)); await older.promise; });
  expect(container.textContent).toContain("200.00");
  expect(container.textContent).not.toContain("100.00");
  const later = deferred<ReturnType<typeof snapshot> | null>();
  session.bankSnapshot.mockImplementationOnce(() => later.promise);
  session.viewVersion++;
  await act(async () => { root?.render(<BankSnapshotEditor />); });
  await act(async () => { root?.unmount(); root = null; later.reject(new Error("offline")); try { await later.promise; } catch { /* expected */ } });
  expect(notify).not.toHaveBeenCalled();
  container.remove();
});

it("marks a failed refresh stale, retains unsaved input, and recovers after retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  session.bankSnapshot.mockResolvedValueOnce(snapshot("100.00", 1));
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root?.render(<BankSnapshotEditor />); });
  await act(async () => { container.querySelector("button")?.click(); });
  const amount = container.querySelector<HTMLInputElement>("#bank-amount")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(amount, "150"); amount.dispatchEvent(new Event("input", { bubbles: true })); });
  session.bankSnapshot.mockRejectedValueOnce(new Error("offline"));
  session.viewVersion++;
  await act(async () => { root?.render(<BankSnapshotEditor />); });
  expect(container.textContent).toContain("may be out of date");
  expect(amount.value).toBe("150");
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  const call = notify.mock.calls.find(([title]) => title === "Could not load bank balance");
  expect(call).toBeDefined();
  session.bankSnapshot.mockResolvedValueOnce(snapshot("120.00", 2));
  await act(async () => { call?.[2].action.onClick(); });
  expect(container.textContent).not.toContain("may be out of date");
  expect(container.textContent).toContain("120.00");
  expect(amount.value).toBe("150");
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  container.remove();
});
