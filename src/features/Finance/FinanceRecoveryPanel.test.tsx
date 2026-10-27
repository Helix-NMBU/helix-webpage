// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinanceRecoveryPanel } from "./FinanceRecoveryPanel";

const mocks = vi.hoisted(() => ({ recovery: vi.fn(), mutate: vi.fn(), notify: vi.fn(), retry: vi.fn(), allowed: true }));
vi.mock("./repository", async (original) => ({ ...await original<typeof import("./repository")>(), createFinanceApi: () => ({ recovery: mocks.recovery }) }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => mocks.notify }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({ useFinanceAccess: () => ({
  access: "allowed", capabilities: { purchaseRegister: mocks.allowed }, mutate: mocks.mutate, retry: mocks.retry,
}) }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.allowed = true;
  mocks.notify.mockReset();
  mocks.retry.mockReset();
  mocks.mutate.mockReset().mockResolvedValue({ recovery: { message: "Recorded" } });
  mocks.recovery.mockReset().mockResolvedValue({
    deliveries: [{ id: "delivery-1", eventType: "request.submitted", recipient: "Head", status: "uncertain", safeError: "provider_unknown", attemptCount: 1, updatedAt: "2026-10-27", providerMessageId: null }],
    uploads: [{ id: "upload-1", owner: "Member", status: "pending", commitState: "uncertain", createdAt: "2026-10-27", expiresAt: "2026-10-28" }],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("exposes actionable records only to Finance and sends explicit observations", async () => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(container.textContent).toContain("delivery-1");
  expect(container.textContent).toContain("upload-1");
  const buttons = [...container.querySelectorAll("button")];
  await act(async () => buttons.find((button) => button.textContent === "Recorded as not sent")!.click());
  expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "retryOutbox", outboxId: "delivery-1", reconciliation: "not_sent" }));
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Recorded as absent")!.click());
  expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "cleanupUploads", uploadId: "upload-1", reconciliation: "absent" }));
  mocks.allowed = false;
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(container.textContent).not.toContain("delivery-1");
  expect(container.textContent).not.toContain("upload-1");
});

it("shows a shared recovery notification when a read fails", async () => {
  mocks.recovery.mockRejectedValueOnce(new Error("No service"));
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(mocks.notify).toHaveBeenCalledWith("Could not load finance recovery", "No service", expect.objectContaining({ variant: "error" }));
});
