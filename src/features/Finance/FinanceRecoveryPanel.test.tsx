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
    uploads: [{ id: "upload-1", owner: "Member", status: "pending", commitState: "uncertain", referenced: false, candidateCount: 0, createdAt: "2026-10-27", expiresAt: "2026-10-28" }],
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

it("keeps the same request ID when the notification retries a failed reconciliation", async () => {
  mocks.mutate.mockRejectedValueOnce(new Error("Response lost"));
  await act(async () => root.render(<FinanceRecoveryPanel />));
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Recorded as not sent")!.click());
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  const first = mocks.mutate.mock.calls[0][0] as { requestId: string };
  const notification = mocks.notify.mock.calls.find((call) => call[0] === "Could not update recovery");
  expect(notification).toBeTruthy();
  await act(async () => notification![2].action.onClick());
  expect(mocks.mutate).toHaveBeenCalledTimes(2);
  const second = mocks.mutate.mock.calls[1][0] as { requestId: string };
  expect(second.requestId).toBe(first.requestId);
});

it("allows saved reconciliation and prevents absent reconciliation for a referenced upload", async () => {
  mocks.recovery.mockResolvedValueOnce({ deliveries: [], uploads: [{ id: "saved-upload", owner: "Member", status: "finalized", commitState: "uncertain", referenced: true, candidateCount: 0, createdAt: "2026-10-27", expiresAt: "2026-10-28" }] });
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(container.textContent).toContain("Saved purchase reference found");
  const buttons = [...container.querySelectorAll("button")];
  const saved = buttons.find((button) => button.textContent === "Recorded as saved")!;
  expect(saved.disabled).toBe(false);
  expect(buttons.find((button) => button.textContent === "Recorded as absent")!.disabled).toBe(true);
  await act(async () => saved.click());
  expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "cleanupUploads", uploadId: "saved-upload", reconciliation: "saved" }));
});

it("offers candidate-only cleanup for a referenced purchase without exposing a storage key", async () => {
  mocks.recovery.mockResolvedValueOnce({ deliveries: [], uploads: [{ id: "saved-upload", owner: "Member", status: "finalized", commitState: "settled", referenced: true, candidateCount: 1, createdAt: "2026-10-27", expiresAt: "2026-10-28" }] });
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(container.textContent).toContain("1 final upload object needs cleanup.");
  expect(container.textContent).not.toContain("Recorded as absent");
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Clean up final objects")!.click());
  expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "cleanupUploads", uploadId: "saved-upload", candidateOnly: true }));
});
