// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
vi.mock("../MemberPlatform/local-mode", () => ({ isLocalMemberMode: () => true, localMemberSignedIn: () => true }));
vi.mock("../MemberPlatform/member-access-api", () => ({ localMemberHasFinancials: () => true }));
vi.mock("../PartnerDeals/local-fixture", () => ({ localSponsorFunding: () => [], localPipelineIncomeForecast: () => [], localWonIncome: () => [] }));
it("loads local recovery and keeps all finance views at the same revision after a balance update", async () => {
 const { createFinanceApi } = await import("./repository");
 const api = createFinanceApi({ current: null });
 expect(await api.recovery()).toEqual({ deliveries: [], uploads: [], deliveryNextCursor: null, uploadNextCursor: null, invoiceTransfers: [], invoiceNextCursor: null });
 const result = await api.mutate({ action: "setBankSnapshot", requestId: "test", expectedRevision: 0, amountNok: "100", asOfDate: "2026-10-29" });
 expect(result.viewVersion).toBe(1);
 const views = await Promise.all([api.capabilities(), api.version(), api.overview(), api.budgets(), api.purchases(), api.financing()]);
 expect(views.map(view => view.viewVersion)).toEqual([1, 1, 1, 1, 1, 1]);
});

it("warns before adding, receiving or restoring local funding that resembles a registered payment", async () => {
 localStorage.clear();
 const { createFinanceApi } = await import("./repository");
 const api = createFinanceApi({ current: null });
 const match = { status: 409, errors: [expect.objectContaining({ field: "acceptSimilarIncome" })] };
 const receivedOn = "2026-11-20";
 const source = "Local member";
 await api.mutate({ action: "registerIncome", requestId: crypto.randomUUID(), seasonCode: "S27", category: "membership_dues",
   source, amountNok: "25.50", receivedOn, method: "bank_transfer" });
 const funding = { sourceName: source.toUpperCase(), ownerName: "Finance", fundingType: "membership", amountNok: "25.50",
   receivedDate: receivedOn };
 await expect(api.mutate({ action: "addFunding", requestId: crypto.randomUUID(), funding: { ...funding, status: "received" } })).rejects.toMatchObject(match);
 const secured = await api.mutate({ action: "addFunding", requestId: crypto.randomUUID(), funding: { ...funding, status: "secured" } });
 const edit = { action: "editFunding", requestId: crypto.randomUUID(), fundingId: secured.id, expectedRevision: secured.revision,
   patch: { status: "received" } };
 await expect(api.mutate(edit)).rejects.toMatchObject(match);
 const received = await api.mutate({ ...edit, acceptSimilarIncome: true });
 expect(await api.mutate(edit)).toEqual(received);
 const deleted = await api.mutate({ action: "deleteFunding", requestId: crypto.randomUUID(), fundingId: secured.id, expectedRevision: received.revision });
 const restore = { action: "restoreFunding", requestId: crypto.randomUUID(), fundingId: secured.id, expectedRevision: deleted.revision };
 await expect(api.mutate(restore)).rejects.toMatchObject(match);
 await api.mutate({ ...restore, acceptSimilarIncome: true });
 expect((await api.financing()).funding).toEqual([expect.objectContaining({ id: secured.id, status: "received", amountNok: "25.50" })]);
});
