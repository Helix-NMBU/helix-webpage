// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
vi.mock("../MemberPlatform/local-mode", () => ({ isLocalMemberMode: () => true, localMemberSignedIn: () => true }));
vi.mock("../MemberPlatform/member-access-api", () => ({ localMemberHasFinancials: () => true }));
vi.mock("../PartnerDeals/local-fixture", () => ({ localSponsorFunding: () => [] }));
it("loads local recovery and keeps all finance views at the same revision after a balance update", async () => {
 const { createFinanceApi } = await import("./repository");
 const api = createFinanceApi({ current: null });
 expect(await api.recovery()).toEqual({ deliveries: [], uploads: [], deliveryNextCursor: null, uploadNextCursor: null });
 const result = await api.mutate({ action: "setBankSnapshot", requestId: "test", expectedRevision: 0, amountNok: "100", asOfDate: "2026-10-29" });
 expect(result.viewVersion).toBe(1);
 const views = await Promise.all([api.capabilities(), api.version(), api.overview(), api.budgets(), api.purchases(), api.financing()]);
 expect(views.map(view => view.viewVersion)).toEqual([1, 1, 1, 1, 1, 1]);
});
