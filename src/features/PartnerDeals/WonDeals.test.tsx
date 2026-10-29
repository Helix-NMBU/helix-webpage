// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { WonDeals, type WonDeal } from "./WonDeals";
const notify = vi.fn();
vi.mock("../MemberCV/session",()=>({memberSessionToken:async()=>"test-token"}));
vi.mock("../MemberPlatform/MemberNotifications",()=>({ useNotify: () => notify }));
it("shows agreed contributions and work, but only links authorized tasks",async()=>{
 const item:WonDeal={ id:'1',title:'Partnership',organizationName:'Acme',startsOn:'2026-08-01',endsOn:'2027-07-31',contactName:'Pat',contactEmail:'pat@example.test',agreementLink:'https://example.test/agreement',contributions:[{id:'c',seasonId:'s',seasonCode:'S27',seasonName:'Season 27',kind:'cash',description:'Cash contribution',amountOre:'125000',invoiceDate:'2026-11-01'},{id:'p',seasonId:'s',seasonCode:'S27',seasonName:'Season 27',kind:'product',description:'Parts',amountOre:'2000',invoiceDate:null}],deliverables:[{id:'d',title:'Logo on car',description:'Side panel',dueDate:'2026-12-01'}],tasks:[{id:'visible',title:'Logo task',status:'todo',kind:'marketing',deliverableId:'d',seasonId:null,contributionId:null,canOpen:true},{id:'private',title:'Invoice task',status:'in_progress',kind:'invoice',deliverableId:null,seasonId:'s',contributionId:'c',canOpen:false}]};
 const el=document.createElement('div'); document.body.append(el); const root=createRoot(el);
 const loadShared=vi.fn().mockResolvedValue({deals:[item]});
 await act(async()=>{root.render(<MemoryRouter><WonDeals loadShared={loadShared}/></MemoryRouter>)});
 expect(el.textContent).toContain('Acme');
 const button=[...el.querySelectorAll('button')].find(x=>x.textContent==='View agreement')!;
 await act(async()=>button.click());
 expect(el.textContent).toContain('1 250,00 NOK');
 expect(el.textContent).toContain('Estimated value: 20,00 NOK');
 expect(el.textContent).toContain('Logo on car');
 expect(el.querySelector('a[href="/tasks/visible"]')).not.toBeNull();
 expect(el.querySelector('a[href="/tasks/private"]')).toBeNull();
 expect(el.textContent).toContain('Invoice task');
 await act(async()=>root.unmount()); el.remove();
});

it("opens an authorized agreement from a task backlink query",async()=>{
 const item:WonDeal={id:"deal-1",title:"Chosen deal",organizationName:"Partner",startsOn:null,endsOn:null,contactName:"",contactEmail:"",agreementLink:"",contributions:[],deliverables:[],tasks:[]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>{root.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal-1"]}><WonDeals loadShared={async()=>({deals:[item]})}/></MemoryRouter>);});
 expect(el.textContent).toContain("Partner · Chosen deal");
 expect(el.textContent).toContain("Back to agreements");
 await act(async()=>root.unmount());el.remove();
});


it("shows a planned invoice for a later season only when no task exists",async()=>{
 const item:WonDeal={id:"deal",title:"Agreement",organizationName:"Partner",startsOn:null,endsOn:null,contactName:"",contactEmail:"",agreementLink:"",contributions:[{id:"s27",seasonId:"a",seasonCode:"S27",seasonName:"S27",kind:"cash",description:"",amountOre:"10000",invoiceDate:"2026-11-01"},{id:"s28",seasonId:"b",seasonCode:"S28",seasonName:"S28",kind:"cash",description:"",amountOre:"20000",invoiceDate:"2027-11-01"}],deliverables:[],tasks:[{id:"t",title:"Invoice Partner",status:"todo",kind:"invoice",deliverableId:null,seasonId:"a",contributionId:"s27",canOpen:true}]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>{root.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal"]}><WonDeals loadShared={async()=>({deals:[item]})}/></MemoryRouter>)});
 expect(el.textContent).toContain("Invoice Partner · S28");
 expect(el.textContent).toContain("Planned · 200,00 NOK · Invoice date: 2027-11-01");
 expect(el.textContent).not.toContain("Invoice Partner · S27");
 await act(async()=>root.unmount());el.remove();
});

it("lets Business request a limited Finance review for a mismatched won deal",async()=>{
 const item:WonDeal={id:"deal-review",revision:3,title:"Agreement",organizationName:"Partner",startsOn:null,endsOn:null,contactName:"",contactEmail:"",agreementLink:"",contributions:[{id:"cash",seasonId:"a",seasonCode:"S27",seasonName:"S27",kind:"cash",description:"",amountOre:"10000",invoiceDate:"2026-11-01",fundingNeedsReview:true}],deliverables:[],tasks:[]};
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({count:1})});vi.stubGlobal("fetch",request);
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal-review"]}><WonDeals loadShared={async()=>({deals:[item],canManage:true})}/></MemoryRouter>));
 const btn=[...el.querySelectorAll("button")].find(b=>b.textContent==="Request Finance review")!;expect(btn).toBeDefined();
 await act(async()=>btn.click());
 expect(request).toHaveBeenCalledWith("/api/partner-deals",expect.objectContaining({method:"POST",body:JSON.stringify({action:"requestFinanceReview",dealId:"deal-review",expectedRevision:3})}));
 await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();
});

it("labels pending reopening accurately and does not claim an expired agreement is active",async()=>{
 const base:WonDeal={id:"deal",title:"Agreement",organizationName:"Partner",startsOn:"2020-01-01",endsOn:"2021-01-01",contactName:"",contactEmail:"",agreementLink:"",contributions:[],deliverables:[],tasks:[]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal"]}><WonDeals loadShared={async()=>({deals:[base]})}/></MemoryRouter>));
 expect(el.textContent).not.toContain("Active");await act(async()=>root.unmount());el.remove();
 const pending:WonDeal={...base,changes:[{id:"change",kind:"reopening",reason:"Renewed",beforeTerms:{title:"Agreement",contactName:"",contactEmail:"",startsOn:base.startsOn,endsOn:base.endsOn,agreementLink:"",cashChanges:[],inKindChanges:[],deliverableChanges:[]},proposedTerms:{},status:"pending",createdAt:"now",resolvedAt:null,resolutionNote:null}]};
 const second=document.createElement("div");document.body.append(second);const secondRoot=createRoot(second);
 await act(async()=>secondRoot.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal"]}><WonDeals loadShared={async()=>({deals:[pending]})}/></MemoryRouter>));
 expect(second.textContent).toContain("Reopening · Review required");expect(second.textContent).not.toContain("Active");
 await act(async()=>secondRoot.unmount());second.remove();
});

it("offers Finance review during cancellation only for a stale manual item",async()=>{
 const base:WonDeal={id:"deal",revision:4,title:"Agreement",organizationName:"Partner",startsOn:null,endsOn:null,contactName:"",contactEmail:"",agreementLink:"",cancelledAt:"now",contributions:[{id:"cash",seasonId:"s",seasonCode:"S27",seasonName:"S27",kind:"cash",description:"",amountOre:"10000",invoiceDate:"2027-01-01",fundingNeedsReview:true}],deliverables:[],tasks:[],changes:[{id:"change",kind:"cancellation",reason:"Ended",beforeTerms:{title:"Agreement",contactName:"",contactEmail:"",startsOn:null,endsOn:null,agreementLink:"",cashChanges:[],inKindChanges:[],deliverableChanges:[]},proposedTerms:{},status:"pending",createdAt:"now",resolvedAt:null,resolutionNote:null}]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal"]}><WonDeals loadShared={async()=>({deals:[base],canManage:true})}/></MemoryRouter>));
 expect(el.textContent).not.toContain("Request Finance review");await act(async()=>root.unmount());el.remove();
 const second=document.createElement("div");document.body.append(second);const secondRoot=createRoot(second);const manual={...base,contributions:[{...base.contributions[0],manualHandling:true,manualFinanceReviewed:false}]};
 await act(async()=>secondRoot.render(<MemoryRouter initialEntries={["/partner-deals?deal=deal"]}><WonDeals loadShared={async()=>({deals:[manual],canManage:true})}/></MemoryRouter>));
 expect(second.textContent).toContain("Request Finance review");expect(second.textContent).not.toContain("Record manual funding review");await act(async()=>secondRoot.unmount());second.remove();
});

it("summarizes current contributions across seasons and preserves unvalued items",async()=>{
 const item:WonDeal={id:"one",title:"Parts deal",organizationName:"Partner",sponsorLevel:"silver",startsOn:null,endsOn:null,contactName:"",contactEmail:"",agreementLink:"",contributions:[
  {id:"a",seasonCode:"S27",seasonName:"S27",kind:"cash",description:"",amountOre:"10000",invoiceDate:null},
  {id:"b",seasonCode:"S28",seasonName:"S28",kind:"cash",description:"",amountOre:"20000",invoiceDate:null},
  {id:"c",seasonCode:"S28",seasonName:"S28",kind:"product",description:"",amountOre:"5000",invoiceDate:null},
  {id:"d",seasonCode:"S28",seasonName:"S28",kind:"service",description:"",amountOre:null,invoiceDate:null},
  {id:"e",seasonCode:"S26",seasonName:"S26",kind:"cash",description:"",amountOre:"90000",invoiceDate:null,retiredAt:"2026-01-01"}],deliverables:[],tasks:[]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<MemoryRouter><WonDeals loadShared={async()=>({deals:[item]})}/></MemoryRouter>));
 const table=el.querySelector('table[aria-label="Partner agreements"]')!;
 expect(table.textContent).toContain("S27, S28");expect(table.textContent).toContain("Silver");expect(table.textContent).toContain("300,00 NOK");expect(table.textContent).toContain("50,00 NOK + unvalued");expect(table.textContent).not.toContain("S26");
 await act(async()=>root.unmount());el.remove();
});

it("derives deliverable progress from linked marketing tasks, excluding retired work and invoices",async()=>{
 const item:WonDeal={id:"progress",title:"Partnership",organizationName:"Partner",startsOn:null,endsOn:null,contactName:"",contactEmail:"",agreementLink:"",contributions:[],deliverables:[{id:"a",title:"First",description:"",dueDate:null},{id:"b",title:"Second",description:"",dueDate:null},{id:"old",title:"Retired",description:"",dueDate:null,retiredAt:"now"}],tasks:[{id:"t1",title:"First task",status:"done",kind:"marketing",deliverableId:"a",seasonId:null,contributionId:null,canOpen:true},{id:"t2",title:"Second task",status:"blocked",kind:"marketing",deliverableId:"b",seasonId:null,contributionId:null,canOpen:false},{id:"invoice",title:"Invoice",status:"done",kind:"invoice",deliverableId:null,seasonId:null,contributionId:null,canOpen:true}]};
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);
 await act(async()=>root.render(<MemoryRouter><WonDeals loadShared={async()=>({deals:[item]})}/></MemoryRouter>));
 const row=el.querySelector("tbody tr")!;expect(row.textContent).toContain("1 / 2");expect(row.textContent).toContain("Blocked");expect(row.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("50");
 await act(async()=>[...el.querySelectorAll("button")].find(b=>b.textContent==="View agreement")!.click());
 expect(el.textContent).toContain("1 of 2 complete");expect(el.textContent).toContain("Second task · Blocked");expect(el.querySelector('a[href="/tasks/t2"]')).toBeNull();
 await act(async()=>root.unmount());el.remove();
});
