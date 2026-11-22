// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PurchaseRegister } from "./PurchaseRegister";
import type { FinanceMutation, FinancePurchaseSummary } from "./types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps legacy downloads, authorizes Drive opens and retries only pending evidence without changing payment controls", async () => {
  const clickAnchor = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  const onChanged = vi.fn(async () => undefined);
  const mutate = vi.fn(async (action: FinanceMutation) => ({
    ok: true as const,
    id: "purchase",
    viewVersion: 2,
    warnings: [],
    errors: [],
    ...(action.action === "downloadDocument"
      ? action.documentId === "legacy"
        ? { downloadUrl: "https://storage.example/private-invoice" }
        : {
            viewerUrl: "https://drive.google.com/file/d/current-confirmed/view",
          }
      : {}),
  }));
  const row: FinancePurchaseSummary = {
    id: "purchase",
    publicRef: "PUR-1",
    status: "registered",
    buyerName: "Buyer",
    supplierName: "Supplier",
    requesterMemberId: null,
    requesterName: null,
    paymentMethod: "invoice",
    purchaseDate: "2026-11-19",
    justification: "Frame",
    documentKind: "invoice",
    documentNumber: "INV-1",
    revision: 2,
    voidReason: null,
    totalNok: "100.00",
    refundAccount: null,
    refundPhone: null,
    unpaid: true,
    invoice: { paid: false, paidOn: null, dueDate: null },
    reimbursement: null,
    lines: [],
    exceptions: [],
    documents: [
      {
        id: "legacy",
        publicRef: "DOC-1",
        kind: "invoice",
        documentNumber: "INV-1",
        originalName: "Legacy.pdf",
      },
      {
        id: "drive",
        publicRef: "DOC-2",
        kind: "invoice",
        documentNumber: null,
        originalName: "Drive.pdf",
        backend: "google_drive",
        transferStatus: "stored",
        viewerUrl: "https://drive.google.com/file/d/obsolete/view",
      },
      {
        id: "pending",
        publicRef: "DOC-3",
        kind: "invoice",
        documentNumber: null,
        originalName: "Pending.pdf",
        backend: "google_drive",
        transferStatus: "pending",
        transferRevision: 8,
        canRetry: true,
      },
    ],
  };
  await act(async () =>
    root.render(
      <PurchaseRegister
        register={[row]}
        unpaidCount={1}
        unpaidOnly={false}
        today="2026-11-20"
        canAct
        onToggleUnpaid={vi.fn()}
        onMutate={mutate}
        onChanged={onChanged}
      />,
    ),
  );
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    );
    expect(button).toBeTruthy();
    await act(async () => button!.click());
  };
  expect(container.textContent).toContain("Unpaid");
  expect(container.textContent).toContain("Mark invoice paid");
  expect(container.textContent).toContain("Transfer pending");
  await click("Download");
  expect(mutate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "downloadDocument",
      documentId: "legacy",
    }),
  );
  await click("Open invoice");
  expect(mutate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "downloadDocument",
      documentId: "drive",
    }),
  );
  expect(clickAnchor).toHaveBeenCalledTimes(2);
  await click("Retry invoice transfer");
  expect(mutate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      action: "retryInvoiceTransfer",
      documentId: "pending",
      expectedRevision: 8,
      requestId: expect.any(String),
    }),
  );
  expect(onChanged).toHaveBeenCalledOnce();
});
