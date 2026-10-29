// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FundingRecovery, type FundingRecoveryApi } from "./FundingRecovery";
const notify = vi.fn();
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
it("requires an explicit acknowledgement before approving a separate record", async () => {
 const candidates = [{ id: "fund-1", revision: 1, reference: "F-S27-001", status: "secured", amountOre: "10000", expectedDate: null }];
 const api: FundingRecoveryApi = { candidates: vi.fn().mockResolvedValue({ contributionId: "cash", amountOre: "10000", linkedFundingId: null, candidates }), link: vi.fn(), unlink: vi.fn(), approveSeparate: vi.fn() };
 const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
 await act(async () => { root.render(<FundingRecovery contributionId="cash" api={api} />); });
 expect(el.textContent).toContain("F-S27-001");
 const approve = [...el.querySelectorAll("button")].find(x => x.textContent === "Approve separate funding")!;
 expect(approve.disabled).toBe(true);
 await act(async () => { el.querySelector("input")!.click(); });
 expect(approve.disabled).toBe(false);
 await act(async () => { approve.click(); });
 expect(api.approveSeparate).toHaveBeenCalledWith("cash", candidates);
 await act(async () => root.unmount()); el.remove();
});
it("does not show finance data when the candidate request is denied", async () => {
 const api: FundingRecoveryApi = { candidates: vi.fn().mockRejectedValue(new Error("Access denied")), link: vi.fn(), unlink: vi.fn(), approveSeparate: vi.fn() };
 const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
 await act(async () => { root.render(<FundingRecovery contributionId="cash" api={api} />); });
 expect(el.textContent).not.toContain("F-S27");
 expect(notify).toHaveBeenCalledWith("Could not load funding", "Access denied", expect.objectContaining({variant:"error"}));
 await act(async () => root.unmount()); el.remove();
});
