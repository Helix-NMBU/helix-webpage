// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgreementChanges } from "./AgreementChanges";
const notify=vi.fn();
vi.mock("../MemberPlatform/MemberNotifications",()=>({useNotify:()=>notify}));
vi.mock("../MemberCV/session",()=>({memberSessionToken:async()=>"test"}));
const deal={id:"deal",revision:2,title:"Original",contactName:"",contactEmail:"",startsOn:null,endsOn:null,agreementLink:"",cancelledAt:null,changes:[],contributions:[],deliverables:[]};
const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.textContent===label)!;
afterEach(()=>{vi.unstubAllGlobals();notify.mockReset();});
it("records a proposed metadata amendment but does not apply it without review",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"change"})});vi.stubGlobal("fetch",request);
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<AgreementChanges deal={deal} canManage onReload={()=>{}}/>));
 await act(async()=>button("Propose amendment").click());
 const title=[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Deal name"))!.querySelector("input")!;
 const reason=[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Reason"))!.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(title,"Proposed");title.dispatchEvent(new Event("input",{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(reason,"Agreement updated");reason.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>button("Save proposed amendment").click());
 expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({action:"recordAgreementChange",kind:"amendment",terms:{title:"Proposed"},confirmed:true});
 expect(deal.title).toBe("Original");await act(async()=>root.unmount());el.remove();
});
it("requires explicit acknowledgement and a note to reconcile",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"change"})});vi.stubGlobal("fetch",request);
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 const pending={...deal,changes:[{id:"change",kind:"cancellation" as const,reason:"Ended",beforeTerms:{...deal,cashChanges:[],inKindChanges:[],deliverableChanges:[]},proposedTerms:{},status:"pending" as const,createdAt:"now",resolvedAt:null,resolutionNote:null}]};
 await act(async()=>root.render(<AgreementChanges deal={pending} canManage onReload={()=>{}}/>));
 await act(async()=>button("Review and reconcile").click());
 expect(button("Confirm reconciliation").disabled).toBe(true);
 const textarea=document.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"Reviewed with Finance");textarea.dispatchEvent(new Event("input",{bubbles:true}));document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();});
 await act(async()=>button("Confirm reconciliation").click());
 expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({action:"resolveAgreementChange",changeId:"change",note:"Reviewed with Finance",confirmed:true,manualConfirmed:true});
 await act(async()=>root.unmount());el.remove();
});
it("does not expose change actions to shared viewers",async()=>{
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<AgreementChanges deal={deal} canManage={false} onReload={()=>{}}/>));
 expect(button("Propose amendment")).toBeUndefined();expect(button("Cancel agreement")).toBeUndefined();
 await act(async()=>root.unmount());el.remove();
});
it("records proposed cash and deliverable terms with the existing item identities",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"change"})});vi.stubGlobal("fetch",request);
 const detailed={...deal,contributions:[{id:"cash",kind:"cash",description:"Cash",amountOre:"10000",invoiceDate:"2027-02-01",seasonCode:"S27"}],deliverables:[{id:"delivery",title:"Old logo",description:"Side",dueDate:null}]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<AgreementChanges deal={detailed} canManage onReload={()=>{}}/>));await act(async()=>button("Propose amendment").click());
 const amount=[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Amount (NOK)"))!.querySelector("input")!;
 const deliverable=[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Deliverable"))!.querySelector("input")!;
 const reason=[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Reason"))!.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(amount,"200.00");amount.dispatchEvent(new Event("input",{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(deliverable,"New logo");deliverable.dispatchEvent(new Event("input",{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(reason,"New terms");reason.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>{[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Remove this contribution after review"))!.querySelector("input")!.click();[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Remove this deliverable after review"))!.querySelector("input")!.click();});
 await act(async()=>button("Save proposed amendment").click());
 expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({terms:{cashChanges:[{id:"cash",amountOre:"20000",retire:true}],deliverableChanges:[{id:"delivery",title:"New logo",retire:true}]}});
 await act(async()=>root.unmount());el.remove();
});
