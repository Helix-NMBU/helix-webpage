// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FinanceRecoveryPanel } from "./FinanceRecoveryPanel";

const mocks = vi.hoisted(() => ({ recovery: vi.fn(), mutate: vi.fn(), notify: vi.fn(), retry: vi.fn(), allowed: true, viewVersion: 1, endSession: undefined as undefined | (() => void) }));
vi.mock("../MemberCV/session", () => ({ watchMemberSession: (end: () => void) => { mocks.endSession = end; return () => undefined; } }));
vi.mock("./repository", async (original) => ({ ...await original<typeof import("./repository")>(), createFinanceApi: () => ({ recovery: mocks.recovery }) }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => mocks.notify }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({ useFinanceAccess: () => ({
  access: "allowed", viewVersion: mocks.viewVersion, capabilities: { purchaseRegister: mocks.allowed }, mutate: mocks.mutate, retry: mocks.retry,
}) }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.allowed = true;
  mocks.viewVersion = 1;
  mocks.endSession = undefined;
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

it("navigates delivery and upload pages independently", async () => {
  const delivery = { id: "delivery-first", eventType: "request.submitted", recipient: "Head", status: "uncertain", safeError: "provider_unknown", attemptCount: 1, updatedAt: "2026-10-27", providerMessageId: null };
  const upload = { id: "upload-first", owner: "Member", status: "pending", commitState: "uncertain", referenced: false, candidateCount: 0, createdAt: "2026-10-27", expiresAt: "2026-10-28" };
  mocks.recovery.mockImplementation(async (deliveryAfter?: string, uploadAfter?: string) => ({
    deliveries: [{ ...delivery, id: deliveryAfter ? "delivery-second" : "delivery-first" }],
    uploads: [{ ...upload, id: uploadAfter ? "upload-second" : "upload-first" }],
    deliveryNextCursor: deliveryAfter ? null : "delivery-cursor",
    uploadNextCursor: uploadAfter ? null : "upload-cursor",
  }));
  await act(async () => root.render(<FinanceRecoveryPanel />));
  const click = async (label: string) => {
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());
  };
  await click("Next deliveries");
  expect(mocks.recovery).toHaveBeenLastCalledWith("delivery-cursor", undefined, undefined);
  expect(container.textContent).toContain("delivery-second");
  expect(container.textContent).toContain("upload-first");
  await click("Next uploads");
  expect(mocks.recovery).toHaveBeenLastCalledWith("delivery-cursor", "upload-cursor", undefined);
  expect(container.textContent).toContain("upload-second");
  await click("Previous deliveries");
  expect(mocks.recovery).toHaveBeenLastCalledWith(undefined, "upload-cursor", undefined);
  expect(container.textContent).toContain("delivery-first");
  expect(container.textContent).toContain("upload-second");
});

it("drops a late recovery page after access is revoked", async () => {
  let resolvePage!: (value: unknown) => void;
  const pending = new Promise((resolve) => { resolvePage = resolve; });
  mocks.recovery.mockReturnValueOnce(pending);
  await act(async () => root.render(<FinanceRecoveryPanel />));
  mocks.allowed = false;
  await act(async () => root.render(<FinanceRecoveryPanel />));
  await act(async () => resolvePage({ deliveries: [{ id: "private-late" }], uploads: [], deliveryNextCursor: null, uploadNextCursor: null }));
  expect(container.textContent).not.toContain("private-late");
});

it("pages and retries invoice transfers without changing the other recovery cursors", async () => {
  mocks.recovery.mockImplementation(async (deliveryAfter?: string, uploadAfter?: string, invoiceAfter?: string) => ({
    deliveries: [], uploads: [], deliveryNextCursor: deliveryAfter ? null : "delivery-cursor", uploadNextCursor: uploadAfter ? null : "upload-cursor",
    invoiceTransfers: [{ documentId: invoiceAfter ? "document-second" : "document-first", purchaseId: "purchase", purchaseRef: "PUR-001", originalName: "Invoice.pdf", backend: "google_drive", transferStatus: "needs_attention", viewerUrl: null, transferRevision: 4, canRetry: true, attempts: 2, updatedAt: "2026-11-20", safeError: "Storage needs attention" }],
    invoiceNextCursor: invoiceAfter ? null : "invoice-cursor",
  }));
  await act(async () => root.render(<FinanceRecoveryPanel />));
  const click = async (label: string) => { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click()); };
  expect(container.textContent).toContain("Needs attention"); expect(container.textContent).not.toContain("Open invoice");
  await click("Next deliveries"); await click("Next invoices");
  expect(mocks.recovery).toHaveBeenLastCalledWith("delivery-cursor", undefined, "invoice-cursor");
  await click("Retry invoice transfer");
  expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "retryInvoiceTransfer", documentId: "document-second", expectedRevision: 4, requestId: expect.any(String) }));
  await click("Previous invoices"); expect(mocks.recovery).toHaveBeenLastCalledWith("delivery-cursor", undefined, undefined);
});

it("does not revive old recovery actions after changing invoice pages", async () => {
  mocks.recovery.mockResolvedValue({ deliveries: [{ id: "outbox", eventType: "request.submitted", recipient: "Head", status: "uncertain", safeError: null, attemptCount: 1, updatedAt: "2026-11-20", providerMessageId: null }], uploads: [], invoiceTransfers: [], invoiceNextCursor: "invoice-next" });
  mocks.mutate.mockRejectedValueOnce(new Error("Response lost"));
  await act(async () => root.render(<FinanceRecoveryPanel />));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Recorded as not sent")!.click());
  const retry = mocks.notify.mock.calls.find(call => call[0] === "Could not update recovery")![2].action.onClick;
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Next invoices")!.click());
  await act(async () => retry()); expect(mocks.mutate).toHaveBeenCalledOnce();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
async function clickRecovery(label: string) {
  const target = [...container.querySelectorAll("button")].find(button => button.textContent === label);
  expect(target).toBeTruthy();
  await act(async () => target!.click());
}
it.each([401, 403].flatMap(status => ["read", "mutation"].map(phase => ({ status, phase }))))("clears and latches recovery access on $phase denial $status", async ({ status, phase }) => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  const error = Object.assign(new Error("Current Finance grant revoked"), { status });
  if (phase === "read") {
    mocks.recovery.mockRejectedValueOnce(error);
    await clickRecovery("Refresh recovery");
  } else {
    mocks.mutate.mockRejectedValueOnce(error);
    await clickRecovery("Recorded as not sent");
  }
  expect(container.textContent).not.toContain("delivery-1");
  expect(container.textContent).not.toContain("upload-1");
  expect(mocks.retry).toHaveBeenCalledOnce();
  const last = mocks.notify.mock.calls[mocks.notify.mock.calls.length - 1];
  expect(last[0]).toBe("Finance access ended");
  expect(last[2].action).toBeUndefined();
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(container.textContent).not.toContain("delivery-1");
});
it("rejects an old recovery read after a concurrent mutation denial", async () => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  const old = deferred<unknown>();
  mocks.recovery.mockReturnValueOnce(old.promise);
  await clickRecovery("Refresh recovery");
  mocks.mutate.mockRejectedValueOnce(Object.assign(new Error("Revoked"), { status: 403 }));
  await clickRecovery("Recorded as not sent");
  await act(async () => old.resolve({ deliveries: [{ id: "PRIVATE_OLD" }], uploads: [] }));
  expect(container.textContent).not.toContain("PRIVATE_OLD");
  expect(container.textContent).not.toContain("delivery-1");
  expect(mocks.retry).toHaveBeenCalledOnce();
});
it("drops late reconciliation success when a later read ends authority", async () => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  const old = deferred<unknown>();
  mocks.mutate.mockReturnValueOnce(old.promise);
  await clickRecovery("Recorded as not sent");
  // A session-ending event invalidates both reads and writes regardless of the pending operation.
  await act(async () => mocks.endSession!());
  await act(async () => old.resolve({ recovery: { message: "Old success" } }));
  expect(container.textContent).not.toContain("delivery-1");
  expect(mocks.notify).not.toHaveBeenCalledWith("Recovery updated", expect.anything(), expect.anything());
  expect(mocks.retry).toHaveBeenCalledOnce();
});
it.each([400, 409, null])("retains safe recovery rows on a recoverable refresh error: %s", async status => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  mocks.recovery.mockRejectedValueOnce(Object.assign(new Error("Try again"), status ? { status } : {}));
  await clickRecovery("Refresh recovery");
  expect(container.textContent).toContain("delivery-1");
  expect(container.textContent).toContain("upload-1");
  expect(mocks.retry).not.toHaveBeenCalled();
});
it.each(["configuration_missing", "provider_permission", "provider_unavailable", "provider_mismatch", "source_unavailable", "source_mismatch", "transfer_uncertain", "private?access_token=secret"])("uses plain safe invoice recovery explanations for %s", async safeError => {
  mocks.recovery.mockResolvedValue({ deliveries: [], uploads: [], invoiceTransfers: [{ documentId: "doc", purchaseRef: "PUR-1", originalName: "Invoice.pdf", backend: "google_drive", transferStatus: "needs_attention", transferRevision: 1, canRetry: true, attempts: 1, updatedAt: "2026-11-20", safeError }] });
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(container.textContent).toContain("Needs attention");
  expect(container.textContent).not.toContain(safeError);
  expect(container.textContent).toMatch(/Finance|Google Drive|transfer result/);
});

it("refreshes current recovery facts after a background invoice version update", async () => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  mocks.recovery.mockResolvedValueOnce({ deliveries: [], uploads: [], invoiceTransfers: [{ documentId: "confirmed", purchaseRef: "PUR-1", originalName: "Invoice.pdf", backend: "google_drive", transferStatus: "stored", transferRevision: 2, canRetry: false, attempts: 1, updatedAt: "2026-11-20", safeError: null }] });
  mocks.viewVersion = 2;
  await act(async () => root.render(<FinanceRecoveryPanel />));
  expect(mocks.recovery).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Stored in Drive");
  expect(container.textContent).not.toContain("delivery-1");
  expect(container.textContent).not.toContain("Retry invoice transfer");
});

it("treats an overlapping older read's authority denial as invalidation, even after a newer page response", async () => {
  await act(async () => root.render(<FinanceRecoveryPanel />));
  const old = deferred<unknown>();
  mocks.recovery.mockReturnValueOnce(old.promise);
  await clickRecovery("Refresh recovery");
  mocks.recovery.mockResolvedValueOnce({ deliveries: [], uploads: [{ id: "NEW_PRIVATE", owner: "Member", status: "pending", commitState: "uncertain", referenced: false, candidateCount: 0, createdAt: "2026-11-20", expiresAt: "2026-11-21" }] });
  await clickRecovery("Refresh recovery");
  expect(container.textContent).toContain("NEW_PRIVATE");
  await act(async () => old.reject(Object.assign(new Error("Revoked"), { status: 403 })));
  expect(container.textContent).not.toContain("NEW_PRIVATE");
  expect(mocks.retry).toHaveBeenCalledOnce();
});
