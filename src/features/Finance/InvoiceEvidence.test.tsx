// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceEvidence, InvoiceLinks, invoiceEvidenceMessage } from "./InvoiceEvidence";
import type { InvoiceEvidenceActions } from "./invoice-repository";
import type { ProjectBudgetInvoiceReference } from "./project-budget-types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
let root: Root,
  container: HTMLDivElement,
  actions: InvoiceEvidenceActions,
  invoice: ProjectBudgetInvoiceReference;
const changed = vi.fn(async () => undefined),
  ended = vi.fn();
let clicked: HTMLAnchorElement[];
const result = {
  ok: true as const,
  id: "document",
  viewVersion: 2,
  warnings: [],
  errors: [],
};
const defer = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
async function render(compact = false) {
  await act(async () =>
    root.render(
      <InvoiceEvidence
        compact={compact}
        invoice={invoice}
        actions={actions}
        onChanged={changed}
        onAccessEnded={ended}
      />,
    ),
  );
}
function button(text: string) {
  const found = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  expect(found, text).toBeTruthy();
  return found!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  changed.mockReset().mockResolvedValue(undefined);
  ended.mockClear();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  actions = {
    open: vi.fn(async () => ({
      viewerUrl: "https://drive.google.com/file/d/authorized-file/view",
    })),
    retry: vi.fn(async () => ({
      ...result,
      invoiceEvidence: {
        pending: 1,
        transferring: 0,
        stored: 0,
        needsAttention: 0,
      },
    })),
  };
  invoice = {
    documentId: "document",
    purchaseId: "purchase",
    purchaseRef: "PUR-1",
    originalName: "Invoice.pdf",
    backend: "google_drive",
    transferStatus: "pending",
    viewerUrl: "https://drive.google.com/file/d/untrusted-metadata/view",
    transferRevision: 3,
    canRetry: true,
  };
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
describe("provider-aware invoice evidence", () => {
  it("only describes confirmed Drive storage after pending and attention counts are clear", () => {
    expect(
      invoiceEvidenceMessage({
        pending: 1,
        transferring: 0,
        stored: 1,
        needsAttention: 0,
      }),
    ).toContain("awaiting confirmed");
    expect(
      invoiceEvidenceMessage({
        pending: 0,
        transferring: 0,
        stored: 1,
        needsAttention: 1,
      }),
    ).toContain("need attention");
    expect(
      invoiceEvidenceMessage({
        pending: 0,
        transferring: 0,
        stored: 1,
        needsAttention: 0,
      }),
    ).toBe("Invoice evidence is confirmed in Drive.");
  });
  it.each([401, 403])(
    "clears evidence after authorization denial %s and offers no retry bypass",
    async (status) => {
      invoice.transferStatus = "stored";
      actions.open = vi.fn(async () => {
        throw Object.assign(new Error("Access ended"), { status });
      });
      await render();
      await click("Open invoice");
      expect(container.textContent).not.toContain("Invoice.pdf");
      expect(ended).toHaveBeenCalledOnce();
      expect(clicked).toHaveLength(0);
      expect(notify.mock.calls[notify.mock.calls.length - 1][2].action).toBeUndefined();
    },
  );
  it.each([401, 403])("clears a denied evidence refresh and cannot revive it from later metadata: %s", async status => {
    changed.mockRejectedValue(Object.assign(new Error("Authority changed"), { status }));
    await render();
    await click("Retry invoice transfer");
    expect(ended).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Invoice.pdf");
    expect(notify).toHaveBeenLastCalledWith("Invoice access ended", expect.any(String), expect.not.objectContaining({ action: expect.anything() }));
    invoice = { ...invoice, transferStatus: "stored", transferRevision: 4 };
    await render();
    expect(container.textContent).not.toContain("Invoice.pdf");
    expect(clicked).toHaveLength(0);
  });
  it.each([401, 403])("clears direct retry denial without leaving a retry action: %s", async status => {
    actions.retry = vi.fn(async () => { throw Object.assign(new Error("Access ended"), { status }); });
    await render();
    await click("Retry invoice transfer");
    expect(ended).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Invoice.pdf");
    expect(notify.mock.calls[notify.mock.calls.length - 1][2].action).toBeUndefined();
  });
  it("keeps its transfer subscription through metadata refresh and handles terminal updates with current callbacks", async () => {
    const stop = vi.fn();
    let update: Parameters<NonNullable<InvoiceEvidenceActions["watchSession"]>>[1];
    let end: (() => void) | undefined;
    actions.watchSession = vi.fn((onEnd, onInvoices) => { end = onEnd; update = onInvoices; return stop; });
    await render();
    invoice = { ...invoice, transferStatus: "transferring", transferRevision: 4 };
    await render();
    expect(actions.watchSession).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    await act(async () => update!({ ...result, invoiceEvidence: { pending: 0, transferring: 0, stored: 1, needsAttention: 0 } }));
    expect(changed).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("Invoice evidence updated", "Invoice evidence is confirmed in Drive.", expect.anything());
    await act(async () => end!());
    await act(async () => update!({ ...result, invoiceEvidence: { pending: 0, transferring: 0, stored: 1, needsAttention: 0 } }));
    expect(changed).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Invoice.pdf");
  });
  it("does not lose an authority denial when only transfer metadata changes during the request", async () => {
    invoice.transferStatus = "stored";
    const pending = defer<{ viewerUrl: string }>();
    actions.open = vi.fn(() => pending.promise);
    await render(); await click("Open invoice");
    invoice = { ...invoice, transferRevision: 4 }; await render();
    await act(async () => pending.reject(Object.assign(new Error("Revoked"), { status: 403 })));
    expect(ended).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Invoice.pdf");
  });
  it.each(["pending", "transferring", "needs_attention"] as const)(
    "never exposes a viewer or private fallback for %s evidence",
    async (status) => {
      invoice.transferStatus = status;
      invoice.canRetry = false;
      await render();
      expect(container.querySelector("a")).toBeNull();
      expect(container.querySelector("button")).toBeNull();
      expect(actions.open).not.toHaveBeenCalled();
      expect(container.textContent).toContain(
        status === "pending"
          ? "Transfer pending"
          : status === "transferring"
            ? "Transferring to Drive"
            : "Needs attention",
      );
    },
  );
  it("reauthorizes a confirmed Drive open and ignores the cached metadata URL", async () => {
    invoice.transferStatus = "stored";
    await render();
    await click("Open invoice");
    expect(actions.open).toHaveBeenCalledWith("document");
    expect(clicked[0].href).toBe(
      "https://drive.google.com/file/d/authorized-file/view",
    );
    expect(clicked[0].target).toBe("_blank");
    expect(clicked[0].rel).toContain("noopener");
    expect(clicked[0].download).toBe("");
    expect(container.textContent).not.toContain("Retry invoice transfer");
  });
  it("preserves authorized legacy private downloads", async () => {
    invoice.backend = "private_storage";
    invoice.transferStatus = "stored";
    actions.open = vi.fn(async () => ({
      downloadUrl: "https://storage.example/authorized-legacy",
    }));
    await render();
    await click("Download");
    expect(clicked[0].href).toBe("https://storage.example/authorized-legacy");
    expect(clicked[0].download).toBe("Invoice.pdf");
    expect(container.textContent).not.toContain("Stored in Drive");
  });
  it.each([
    "https://other.example/file",
    "javascript:alert(1)",
    "https://drive.google.com/file/d/id/view?access_token=secret",
  ])("rejects an invalid Drive viewer reference", async (url) => {
    invoice.transferStatus = "stored";
    actions.open = vi.fn(async () => ({
      viewerUrl: url,
      downloadUrl: "https://storage.example/private-bypass",
    }));
    await render();
    await click("Open invoice");
    expect(clicked).toHaveLength(0);
    expect(notify).toHaveBeenLastCalledWith(
      "Could not open invoice",
      expect.any(String),
      expect.anything(),
    );
  });
  it("deduplicates rapid retries and keeps its request ID after an uncertain response", async () => {
    const transfer =
      defer<Awaited<ReturnType<InvoiceEvidenceActions["retry"]>>>();
    const retry = vi
      .fn()
      .mockImplementationOnce(() => transfer.promise)
      .mockResolvedValue({
        ...result,
        invoiceEvidence: {
          pending: 0,
          transferring: 0,
          stored: 0,
          needsAttention: 1,
        },
      });
    actions.retry = retry;
    await render();
    await act(async () => {
      button("Retry invoice transfer").click();
      button("Retry invoice transfer").click();
    });
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => transfer.reject(new Error("Response interrupted")));
    const recovery =
      notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
    await act(async () => recovery());
    expect(retry).toHaveBeenCalledTimes(2);
    expect(retry.mock.calls[0]).toEqual(retry.mock.calls[1]);
    expect(retry.mock.calls[0][1]).toBe(3);
    expect(changed).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Transfer pending");
    expect(container.textContent).not.toContain("Stored in Drive");
  });
  it("refreshes stale evidence instead of retrying an obsolete revision", async () => {
    actions.retry = vi.fn(async () => {
      throw Object.assign(new Error("This transfer changed"), { status: 409 });
    });
    await render();
    await click("Retry invoice transfer");
    const recovery = notify.mock.calls[notify.mock.calls.length - 1][2].action;
    expect(recovery.label).toBe("Refresh evidence");
    await act(async () => recovery.onClick());
    expect(changed).toHaveBeenCalledOnce();
    expect(actions.retry).toHaveBeenCalledOnce();
  });
  it("ignores a late authorized URL after the session ends", async () => {
    invoice.transferStatus = "stored";
    const opening = defer<{ viewerUrl: string }>();
    actions.open = vi.fn(() => opening.promise);
    let end: (() => void) | undefined;
    actions.watchSession = (callback) => {
      end = callback;
      return () => undefined;
    };
    await render();
    await act(async () => button("Open invoice").click());
    await act(async () => end!());
    await act(async () =>
      opening.resolve({
        viewerUrl: "https://drive.google.com/file/d/old-account/view",
      }),
    );
    expect(clicked).toHaveLength(0);
    expect(container.textContent).not.toContain("Invoice.pdf");
    expect(ended).toHaveBeenCalledOnce();
  });
  it("invalidates recovery actions when a document or permission changes", async () => {
    actions.retry = vi.fn(async () => {
      throw new Error("Response interrupted");
    });
    await render();
    await click("Retry invoice transfer");
    const recovery =
      notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
    invoice = { ...invoice, documentId: "other-document", canRetry: false };
    await render();
    await act(async () => recovery());
    expect(actions.retry).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Retry invoice transfer");
  });
});

describe("budget invoice links", () => {
  it.each(["pending", "transferring", "needs_attention"] as const)("shows Invoice not found for an unconfirmed %s transfer without offering retries", async transferStatus => {
    invoice.transferStatus = transferStatus;
    await render(true);
    expect(container.textContent).toBe("Invoice not found");
    expect(container.querySelector("a,button")).toBeNull();
    expect(actions.open).not.toHaveBeenCalled(); expect(actions.retry).not.toHaveBeenCalled();
  });
  it("shows a hyperlink only for confirmed Drive evidence and reauthorizes a normal click", async () => {
    invoice.transferStatus = "stored";
    await render(true);
    const link = container.querySelector("a")!;
    expect(link.textContent).toBe("View invoice");
    expect(link.href).toBe("https://drive.google.com/file/d/untrusted-metadata/view");
    expect(link.target).toBe("_blank"); expect(link.rel).toContain("noopener");
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(actions.open).toHaveBeenCalledWith("document");
    expect(clicked[0].href).toBe("https://drive.google.com/file/d/authorized-file/view");
    expect(actions.retry).not.toHaveBeenCalled();
  });
  it.each([null, "javascript:alert(1)", "https://other.example/file", "https://drive.google.com/file/d/id/view?access_token=secret"])("shows Invoice not found if the stored invoice has a missing or invalid link: %s", async viewerUrl => {
    invoice = { ...invoice, transferStatus: "stored", viewerUrl };
    await render(true); expect(container.textContent).toBe("Invoice not found"); expect(container.querySelector("a")).toBeNull();
  });
  it("shows Invoice not found for a private file without a confirmed Drive reference", async () => {
    invoice = { ...invoice, backend: "private_storage", transferStatus: "stored" };
    await render(true); expect(container.textContent).toBe("Invoice not found"); expect(container.querySelector("a,button")).toBeNull();
  });
  it("clears a confirmed invoice hyperlink when access ends", async () => {
    invoice.transferStatus = "stored";
    let end!: () => void; actions.watchSession = callback => { end = callback; return () => {}; };
    await render(true); expect(container.querySelector("a")).not.toBeNull();
    await act(async () => end()); expect(container.querySelector("a")).toBeNull(); expect(container.textContent).toBe("");
  });
});

it("shows a single missing-file label for several unavailable invoices and retains every confirmed Drive link", async () => {
  const first = { ...invoice, documentId: "first", transferStatus: "stored" as const };
  const second = { ...invoice, documentId: "second", originalName: "Second.pdf" };
  const third = { ...invoice, documentId: "third", originalName: "Third.pdf" };
  await act(async () => root.render(<InvoiceLinks invoices={[second, third]} actions={actions} />));
  expect(container.textContent).toBe("Invoice not found");
  await act(async () => root.render(<InvoiceLinks invoices={[first, second, third, { ...first, documentId: "fourth" }]} actions={actions} />));
  expect(container.querySelectorAll("a")).toHaveLength(2);
  expect(container.textContent).not.toContain("Invoice not found");
  expect(actions.open).not.toHaveBeenCalled(); expect(actions.retry).not.toHaveBeenCalled();
});
