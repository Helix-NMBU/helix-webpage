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
