// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ManualFundingReview } from "./ManualFundingReview";
const notify=vi.fn();
vi.mock("../MemberPlatform/MemberNotifications",()=>({useNotify:()=>notify}));
vi.mock("../MemberCV/session",()=>({memberSessionToken:async()=>"session"}));
const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(x=>x.textContent===name)!;
afterEach(()=>{vi.unstubAllGlobals();notify.mockReset();});
it("requires a review note and explicit acknowledgement, then sends the snapshot token",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"review"})});vi.stubGlobal("fetch",request);const reload=vi.fn();
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<ManualFundingReview dealId="deal" revision={4} contributionId="cash" reviewToken="snapshot" onReload={reload}/>));
 await act(async()=>button("Record manual funding review").click());expect(button("Confirm review").disabled).toBe(true);
 const note=document.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(note,"Reviewed with Finance");note.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click();});
 await act(async()=>button("Confirm review").click());expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({action:"acknowledgeManualFunding",dealId:"deal",expectedRevision:4,contributionId:"cash",reviewToken:"snapshot",note:"Reviewed with Finance",confirmed:true});expect(reload).toHaveBeenCalledOnce();
 await act(async()=>root.unmount());el.remove();
});
it("keeps the review available and offers reload when the funding changed",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({error:"The record changed."})}));const reload=vi.fn();const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<ManualFundingReview dealId="deal" revision={4} contributionId="cash" reviewToken="snapshot" onReload={reload}/>));await act(async()=>button("Record manual funding review").click());const note=document.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(note,"Reviewed");note.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click();});await act(async()=>button("Confirm review").click());
 expect(notify).toHaveBeenCalledWith("Could not record funding review","The record changed.",expect.objectContaining({variant:"error",action:expect.objectContaining({label:"Reload agreement"})}));
 await act(async()=>root.unmount());el.remove();
});
