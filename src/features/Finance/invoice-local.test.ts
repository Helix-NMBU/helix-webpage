// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalInvoiceEvidenceApi,
  localInvoiceRecovery,
  type LocalInvoiceFact,
} from "./invoice-local";
const gates = vi.hoisted(() => ({
  local: true,
  signedIn: true,
  finance: true,
  register: true,
  project: "project",
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
}));
vi.mock("../MemberPlatform/member-access-api", () => ({
  localMemberHasFinancials: () => gates.finance,
}));
vi.mock("./project-budget-local", () => ({
  createLocalProjectBudgetRepository: () => ({
    load: async () => ({
      scopes: [
        {
          projectId: gates.project,
          capabilities: { canRead: true, canRegisterPurchase: gates.register },
        },
      ],
    }),
  }),
}));
const fact = (id = "document"): LocalInvoiceFact => ({
  documentId: id,
  purchaseId: "purchase",
  purchaseRef: "2026-0001",
  projectId: "project",
  originalName: "invoice.pdf",
  backend: "google_drive",
  transferStatus: "needs_attention",
  transferRevision: 0,
  canRetry: true,
  viewerUrl: null,
  attempts: 0,
  updatedAt: "2026-10-01T12:00:00.000Z",
  safeError: "configuration_missing",
});
beforeEach(() => {
  Object.assign(gates, {
    local: true,
    signedIn: true,
    finance: true,
    register: true,
    project: "project",
  });
  localStorage.clear();
  localStorage.setItem(
    "helix-project-budgets-local-v1",
    JSON.stringify({ version: 1, budgets: [] }),
  );
  localStorage.setItem(
    "helix-project-purchases-local-v1",
    JSON.stringify({ evidence: { document: fact() } }),
  );
});
describe("local invoice recovery fixture", () => {
  it("shows no-header incurred evidence honestly with independent pagination and no private/provider keys", () => {
    const result = localInvoiceRecovery();
    expect(result.invoiceTransfers).toEqual([
      expect.objectContaining({
        documentId: "document",
        transferStatus: "needs_attention",
        viewerUrl: null,
        canRetry: true,
      }),
    ]);
    expect(result.invoiceTransfers[0]).not.toHaveProperty("projectId");
    localStorage.setItem(
      "helix-project-purchases-local-v1",
      JSON.stringify({
        evidence: Object.fromEntries(
          Array.from({ length: 52 }, (_, i) => {
            const id = `doc-${String(i).padStart(3, "0")}`;
            return [id, fact(id)];
          }),
        ),
      }),
    );
    const page = localInvoiceRecovery();
    expect(page.invoiceTransfers).toHaveLength(50);
    expect(page.invoiceNextCursor).toBe("doc-049");
    expect(
      localInvoiceRecovery(page.invoiceNextCursor!).invoiceTransfers,
    ).toHaveLength(2);
  });
  it("requires both local mode and signed-in status plus current Finance fixture access", () => {
    gates.local = false;
    expect(() => localInvoiceRecovery()).toThrow(/Sign in/);
    expect(() => createLocalInvoiceEvidenceApi()).toThrow(/Sign in/);
    gates.local = true;
    gates.signedIn = false;
    expect(() => localInvoiceRecovery()).toThrow(/Sign in/);
    gates.signedIn = true;
    gates.finance = false;
    expect(() => localInvoiceRecovery()).toThrow(/Finance access/);
  });
  it("records a failed setup retry once without pretending Drive storage or another actual expense", async () => {
    const api = createLocalInvoiceEvidenceApi(),
      id = crypto.randomUUID();
    const first = await api.retry("document", 0, id);
    expect(first.invoiceEvidence).toEqual({
      pending: 0,
      transferring: 0,
      stored: 0,
      needsAttention: 1,
    });
    expect(await api.retry("document", 0, id)).toEqual(first);
    const state = JSON.parse(
      localStorage.getItem("helix-project-purchases-local-v1")!,
    );
    expect(state.evidence.document).toMatchObject({
      attempts: 1,
      transferRevision: 2,
      transferStatus: "needs_attention",
      viewerUrl: null,
      safeError: "configuration_missing",
    });
    expect(state).not.toHaveProperty("newPurchase");
    await expect(
      api.retry("document", 0, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(api.open("document")).rejects.toMatchObject({ status: 409 });
  });
  it("keeps department retries scoped and denies read-only project leads or a changed session", async () => {
    gates.finance = false;
    const api = createLocalInvoiceEvidenceApi();
    await api.retry("document", 0, crypto.randomUUID());
    gates.project = "another-project";
    await expect(
      api.retry("document", 2, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    gates.project = "project";
    gates.register = false;
    await expect(
      api.retry("document", 2, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    gates.signedIn = false;
    await expect(api.open("document")).rejects.toMatchObject({ status: 401 });
  });
});
