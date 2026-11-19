import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectPurchaseRepository } from "./project-purchase-repository";
import { createFinanceApi } from "./repository";
import type { FinanceMutationResult, PurchaseInput } from "./types";
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: async (owner: { current: string | null }) => {
    owner.current ??= "verified-member";
    return "verified-token";
  },
  watchMemberSession: () => () => {},
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => false,
  localMemberSignedIn: () => false,
}));
const purchase: PurchaseInput = {
  buyerName: "Buyer",
  supplierName: "Supplier",
  paymentMethod: "team_account",
  purchaseDate: "2026-10-01",
  justification: "Incurred material",
  documentKind: "receipt",
  uploadIds: ["upload"],
  lines: [],
};
const saved: FinanceMutationResult = {
  ok: true,
  id: "saved-purchase",
  publicRef: "2026-0001",
  viewVersion: 1,
  warnings: [],
  errors: [],
  invoiceEvidence: {
    pending: 1,
    transferring: 0,
    stored: 0,
    needsAttention: 0,
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("registration response and invoice continuation", () => {
  for (const scoped of [true, false])
    it(`returns ${scoped ? "scoped" : "generic"} saved actual before continuation and cancels late work on disposal`, async () => {
      let finish!: (response: Response) => void;
      const pending = new Promise<Response>((resolve) => (finish = resolve));
      let signal: AbortSignal | undefined;
      const fetcher = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          if (body.action === "continueInvoiceTransfers") {
            signal = init?.signal ?? undefined;
            return pending;
          }
          return Response.json(saved);
        },
      );
      vi.stubGlobal("fetch", fetcher);
      const changed = vi.fn();
      let dispose: () => void;
      let result: FinanceMutationResult;
      if (scoped) {
        const repository = createProjectPurchaseRepository();
        dispose = repository.watchSession!(() => {}, changed);
        result = await repository.mutate({
          action: "registerProjectPurchase",
          projectId: "project",
          responsibleDepartmentId: "department",
          requestId: "request",
          purchase,
        });
      } else {
        const api = createFinanceApi({ current: null });
        dispose = api.watchInvoices({
          updated: changed,
          accessEnded: () => {},
        });
        result = await api.mutate({
          action: "registerPurchase",
          requestId: "request",
          purchase,
        });
      }
      expect(result).toMatchObject(saved);
      await Promise.resolve();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(changed).not.toHaveBeenCalled();
      dispose();
      expect(signal?.aborted).toBe(true);
      finish(
        Response.json({
          ...saved,
          viewVersion: 2,
          invoiceEvidence: {
            pending: 0,
            transferring: 0,
            stored: 1,
            needsAttention: 0,
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(changed).not.toHaveBeenCalled();
    });
});
