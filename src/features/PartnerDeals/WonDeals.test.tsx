// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { WonDeals, type WonDeal } from "./WonDeals";
const notify = vi.fn();
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
