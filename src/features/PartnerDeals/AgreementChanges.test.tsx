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
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"Reviewed with Finance");textarea.dispatchEvent(new Event("input",{bubbles:true}));document.querySelectorAll<HTMLInputElement>('[role="checkbox"]')[0].click();document.querySelectorAll<HTMLInputElement>('[role="checkbox"]')[1].click();});
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
 await act(async()=>{[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Remove this contribution after review"))!.querySelector<HTMLElement>('[role="checkbox"]')!.click();[...document.querySelectorAll("label")].find(x=>x.textContent?.includes("Remove this deliverable after review"))!.querySelector<HTMLElement>('[role="checkbox"]')!.click();});
 await act(async()=>button("Save proposed amendment").click());
 expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({terms:{cashChanges:[{id:"cash",amountOre:"20000",retire:true}],deliverableChanges:[{id:"delivery",title:"New logo",retire:true}]}});
 await act(async()=>root.unmount());el.remove();
});

it("proposes added cash and deliverables with a season",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"change"})});vi.stubGlobal("fetch",request);
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<AgreementChanges deal={deal} canManage seasons={[{id:"season",code:"S28",status:"planning"}]} onReload={()=>{}}/>));
 await act(async()=>button("Propose amendment").click());await act(async()=>button("Add cash").click());await act(async()=>button("Add deliverable").click());
 const labels=[...document.querySelectorAll("label")];const set=(label:string,val:string)=>{const input=labels.find(x=>x.textContent?.startsWith(label))!.querySelector("input,textarea,select")!;const proto=input instanceof HTMLSelectElement?HTMLSelectElement.prototype:input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(input,val);input.dispatchEvent(new Event(input instanceof HTMLSelectElement?"change":"input",{bubbles:true}));};
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Season"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(x=>x.textContent==="S28")!.click());
 await act(async()=>{set("Amount (NOK)","250.00");set("Invoice date","2027-11-01");set("Deliverable","Attend event");set("Reason","Add commitments");});
 await act(async()=>button("Save proposed amendment").click());
 expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({terms:{newCash:[{seasonId:"season",amountOre:"25000",invoiceDate:"2027-11-01"}],newDeliverables:[{title:"Attend event"}]}});
 await act(async()=>root.unmount());el.remove();
});

it("offers a Finance review action when added funding has a possible duplicate",async()=>{
 const request=vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({code:"funding_possible_duplicate",error:"Matching funding"})}).mockResolvedValueOnce({ok:true,json:async()=>({count:1})});vi.stubGlobal("fetch",request);
 const pending={...deal,changes:[{id:"change",kind:"amendment" as const,reason:"Added cash",beforeTerms:{...deal,cashChanges:[],inKindChanges:[],deliverableChanges:[]},proposedTerms:{newCash:[{id:"new",seasonId:"s",amountOre:"25000",invoiceDate:"2027-11-01"}]},status:"pending" as const,createdAt:"now",resolvedAt:null,resolutionNote:null}]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);await act(async()=>root.render(<AgreementChanges deal={pending} canManage onReload={()=>{}}/>));
 await act(async()=>button("Review and reconcile").click());const textarea=document.querySelector("textarea")!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"Reviewed");textarea.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector<HTMLInputElement>('[role="checkbox"]')!.click();});
 await act(async()=>button("Confirm reconciliation").click());
 const recovery=notify.mock.calls.find(c=>c[0]==="Review existing funding")?.[2]?.action;expect(recovery?.label).toBe("Request Finance review");
 await act(async()=>recovery.onClick());expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({action:"requestFinanceReview",dealId:"deal",expectedRevision:2});
 await act(async()=>root.unmount());el.remove();
});
it("withdraws an incorrect pending proposal only after explicit confirmation",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"change"})});vi.stubGlobal("fetch",request);
 const pending={...deal,changes:[{id:"change",kind:"amendment" as const,reason:"Wrong amount",beforeTerms:{...deal,cashChanges:[],inKindChanges:[],deliverableChanges:[]},proposedTerms:{},status:"pending" as const,createdAt:"now",resolvedAt:null,resolutionNote:null}]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);await act(async()=>root.render(<AgreementChanges deal={pending} canManage onReload={()=>{}}/>));
 await act(async()=>button("Withdraw proposal").click());expect(button("Confirm withdrawal").disabled).toBe(true);
 const textarea=document.querySelector("textarea")!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(textarea,"Entered incorrectly");textarea.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector<HTMLInputElement>('[role="checkbox"]')!.click();});
 await act(async()=>button("Confirm withdrawal").click());expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({action:"withdrawAgreementChange",changeId:"change",note:"Entered incorrectly",confirmed:true});
 await act(async()=>root.unmount());el.remove();
});

it("keeps a draft and requires review of the latest revision before retry",async()=>{
 const latest={...deal,title:"Updated by colleague",revision:3};
 const request=vi.fn().mockResolvedValueOnce({ok:false,status:409,json:async()=>({error:"This agreement changed. Reload it before continuing."})}).mockResolvedValueOnce({ok:true,json:async()=>({deals:[latest]})}).mockResolvedValueOnce({ok:true,json:async()=>({})});vi.stubGlobal("fetch",request);
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);await act(async()=>root.render(<AgreementChanges deal={deal} canManage onReload={()=>{}}/>));
 await act(async()=>button("Propose amendment").click());
 const reason=[...document.querySelectorAll("label")].find(x=>x.textContent?.startsWith("Reason"))!.querySelector("textarea")!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(reason,"Keep my draft");reason.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>button("Save proposed amendment").click());expect(button("Save proposed amendment").disabled).toBe(true);expect(reason.value).toBe("Keep my draft");
 const recovery=notify.mock.calls.find(c=>c[0]==="Agreement changed")?.[2]?.action;expect(recovery?.label).toBe("Review latest");await act(async()=>recovery.onClick());
 expect(document.body.textContent).toContain("Updated by colleague");expect(button("Save proposed amendment").disabled).toBe(true);await act(async()=>button("I reviewed the latest agreement").click());await act(async()=>button("Save proposed amendment").click());
 expect(JSON.parse(request.mock.calls[2][1].body)).toMatchObject({expectedRevision:3,reason:"Keep my draft"});await act(async()=>root.unmount());el.remove();
});
