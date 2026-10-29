// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FundingRecovery, type FundingRecoveryApi } from "./FundingRecovery";
const notify = vi.fn();
const accountState = vi.hoisted(() => ({ email: "first@example.test" as string | null }));
vi.mock("../MemberPlatform/MemberAccountContext", () => ({ useMemberAccount: () => accountState.email ? { email: accountState.email } : null }));
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

function deferred() {
 let resolve!: () => void;
 const promise = new Promise<void>(r => { resolve = r; });
 return { promise, resolve };
}
const candidate = (name:string) => ({ id:`fund-${name}`,revision:1,reference:`REF-${name}`,status:"secured",amountOre:"10000",expectedDate:null });
function result(name:string) { return { contributionId:name,amountOre:"10000",linkedFundingId:null,candidates:[candidate(name)] }; }
it("does not reload or notify for contribution A after switching to B while linking",async()=>{
 notify.mockClear(); accountState.email="first@example.test";
 const pending=deferred(); const resolved=vi.fn();
 const api:FundingRecoveryApi={candidates:vi.fn(async id=>result(id)),link:vi.fn(()=>pending.promise),unlink:vi.fn(),approveSeparate:vi.fn()};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FundingRecovery contributionId="A" api={api} onResolved={resolved}/>));
 expect(el.textContent).toContain("REF-A");
 await act(async()=>{[...el.querySelectorAll("button")].find(b=>b.textContent==="Link this record")!.click();});
 expect(api.link).toHaveBeenCalledWith("A","fund-A");
 await act(async()=>root.render(<FundingRecovery contributionId="B" api={api} onResolved={resolved}/>));
 expect(el.textContent).toContain("REF-B");
 await act(async()=>pending.resolve());
 expect(el.textContent).toContain("REF-B"); expect(el.textContent).not.toContain("REF-A");
 expect(api.candidates).toHaveBeenCalledTimes(2); expect(resolved).not.toHaveBeenCalled();
 expect(notify).not.toHaveBeenCalledWith("Funding linked", "", expect.anything());
 await act(async()=>root.unmount());el.remove();
});
it("discards an old action when the account changes and access is revoked",async()=>{
 notify.mockClear(); accountState.email="first@example.test";
 const pending=deferred(); const resolved=vi.fn();
 const api:FundingRecoveryApi={candidates:vi.fn(async id=>{if(!accountState.email)throw new Error("Access denied");return result(id);}),link:vi.fn(()=>pending.promise),unlink:vi.fn(),approveSeparate:vi.fn()};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FundingRecovery contributionId="A" api={api} onResolved={resolved}/>));
 await act(async()=>{[...el.querySelectorAll("button")].find(b=>b.textContent==="Link this record")!.click();});
 accountState.email=null;
 await act(async()=>root.render(<FundingRecovery contributionId="A" api={api} onResolved={resolved}/>));
 expect(el.textContent).not.toContain("REF-A");
 await act(async()=>pending.resolve());
 expect(el.textContent).not.toContain("REF-A"); expect(api.candidates).toHaveBeenCalledTimes(2); expect(resolved).not.toHaveBeenCalled();
 expect(notify).not.toHaveBeenCalledWith("Funding linked", "", expect.anything());
 await act(async()=>root.unmount());el.remove();
});
