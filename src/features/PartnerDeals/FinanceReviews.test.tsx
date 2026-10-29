// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FinanceReviews } from "./FinanceReviews";
import type { FinanceReviewRepository } from "./repository";
const notify=vi.fn();
vi.mock("../MemberPlatform/MemberNotifications",()=>({useNotify:()=>notify}));
const candidate={id:"fund",revision:4,reference:"F-S27-100",status:"secured",amountOre:"10000",expectedDate:null};
it("lets Finance link only an eligible selected candidate",async()=>{
 const repo:FinanceReviewRepository={load:vi.fn().mockResolvedValue([{id:"review",partner:"Acme",season:"S27",amountOre:"10000",candidates:[candidate]}]),resolve:vi.fn().mockResolvedValue(undefined)};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FinanceReviews repository={repo}/>));
 expect(el.textContent).toContain("Acme · S27");
 await act(async()=>[...el.querySelectorAll("button")].find(b=>b.textContent==="Link this record")!.click());
 expect(repo.resolve).toHaveBeenCalledWith("review","link","fund",4,undefined);
 await act(async()=>root.unmount());el.remove();
});
it("requires explicit confirmation for separate funding",async()=>{
 const repo:FinanceReviewRepository={load:vi.fn().mockResolvedValue([{id:"review",partner:"Acme",season:"S27",amountOre:"10000",candidates:[candidate]}]),resolve:vi.fn().mockResolvedValue(undefined)};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FinanceReviews repository={repo}/>));
 const approve=[...el.querySelectorAll("button")].find(b=>b.textContent==="Approve separate funding")!;
 expect(approve.disabled).toBe(true);await act(async()=>el.querySelector("input")!.click());expect(approve.disabled).toBe(false);
 await act(async()=>approve.click());expect(repo.resolve).toHaveBeenCalledWith("review","separate",undefined,undefined,[candidate]);
 await act(async()=>root.unmount());el.remove();
});
it("does not render review data when access is denied",async()=>{
 const repo:FinanceReviewRepository={load:vi.fn().mockRejectedValue(new Error("Access denied")),resolve:vi.fn()};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FinanceReviews repository={repo}/>));
 expect(el.textContent).not.toContain("Acme");expect(notify).toHaveBeenCalledWith("Could not load Finance reviews","Access denied",expect.objectContaining({variant:"error"}));
 await act(async()=>root.unmount());el.remove();
});

it("lets Finance remove a mismatched linked draft record with its revision",async()=>{
 const linked={id:"old-fund",revision:9,reference:"F-S27-200",status:"secured",amountOre:"25000"};
 const repo:FinanceReviewRepository={load:vi.fn().mockResolvedValue([{id:"review",partner:"Acme",season:"S27",amountOre:"10000",candidates:[],linkedFunding:linked}]),resolve:vi.fn().mockResolvedValue(undefined)};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<FinanceReviews repository={repo}/>));
 expect(el.textContent).toContain("F-S27-200");
 await act(async()=>[...el.querySelectorAll("button")].find(b=>b.textContent==="Remove mismatched link")!.click());
 expect(repo.resolve).toHaveBeenCalledWith("review","unlink","old-fund",9,undefined);
 await act(async()=>root.unmount());el.remove();
});
