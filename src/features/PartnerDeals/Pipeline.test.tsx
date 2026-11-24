// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { dragBoardCard } from "@libs/components/ui/board-transfer.test-support";
import { createAgent } from "@ui-sdk/react/agent";
import { SponsorPipeline } from "./Pipeline";
import { PipelineError, createPipelineRepository } from "./repository";
import type { Deal, PipelineData } from "./types";
const deal:Deal={id:"one",organizationId:"org",organizationName:"Partner",title:"Engine deal",stage:"lead",ownerMemberId:null,contactName:"Contact",contactEmail:"",startsOn:null,endsOn:null,agreementLink:"",negotiationNotes:"Private",revision:3,contributions:[{id:"contribution-1",seasonId:"s27",kind:"cash",description:"",amountOre:"120000",invoiceDate:"2026-11-01"}],deliverables:[{id:"deliverable-1",title:"Logo",description:"Logo on the car",dueDate:"2027-02-03",ownerMemberId:"m1"}]};
const data:PipelineData={canManage:true,canReviewFunding:true,deals:[deal],organizations:[{id:"org",name:"Partner",revision:0}],seasons:[{id:"s27",code:"S27",name:"2027",startDate:"2026-08-01",endDate:"2027-07-31",status:"active"}]};
vi.mock("../Workspace/WorkspaceContext",()=>({useWorkspace:()=>({data:{viewerId:"m1",members:[{id:"m1",name:"Morgan"}]}})}));
vi.mock("./LinkedPurchases",()=>({LinkedPurchases:()=> <button type="button">Linked budget entries</button>}));
vi.mock("./FundingRecovery",()=>({FundingRecovery:({contributionId}:{contributionId:string})=><div>Recovery for {contributionId}</div>}));
const budgetLoad = vi.hoisted(() => vi.fn());
vi.mock("./deal-budget-links-repository", () => ({dealBudgetLinksRepository: () => ({load: budgetLoad})}));
const reviewApi={list:async()=>[],markRead:async()=>undefined};
function Probe(){const context=useMemberNotifications();return <output>{context?.items.map(i=><span key={i.id}>{i.title} {i.description} {i.action && <button onClick={i.action.onClick}>{i.action.label}</button>}</span>)}</output>;}
describe("Pipeline",()=>{
 let root:Root,container:HTMLDivElement;
 const load=vi.fn(),save=vi.fn(),createOrganization=vi.fn(),renameOrganization=vi.fn(),requestFinanceReview=vi.fn(),confirmWon=vi.fn();
 beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.append(container);root=createRoot(container);budgetLoad.mockReset().mockImplementation(async (id:string) => ({dealId:id,dealRevision:id==="one"?3:0,applicationRevision:0,seasonCode:"S27",locked:false,entries:[]}));load.mockReset().mockResolvedValue(structuredClone(data));save.mockReset().mockResolvedValue(undefined);requestFinanceReview.mockReset().mockResolvedValue(undefined);confirmWon.mockReset().mockResolvedValue(undefined);});
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
 async function render(){const router=createMemoryRouter([{path:"/sponsor-pipeline",element:<MemberThemeProvider><MemberNotificationsProvider reviewApi={reviewApi}><SponsorPipeline repository={{load,save,createOrganization,renameOrganization,requestFinanceReview,confirmWon}}/><Probe/></MemberNotificationsProvider></MemberThemeProvider>}],{initialEntries:["/sponsor-pipeline"]});await act(async()=>root.render(<RouterProvider router={router}/>));}
 async function openDetail(){await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Open deal Engine deal"]')!.click());}
 async function select(stage:string){if(!document.querySelector('[data-slot="sheet-content"]'))await openDetail();const element=document.querySelector<HTMLButtonElement>('[aria-label="Stage for Engine deal"]')!;await act(async()=>element.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));const label=stage==="won"?"Won":"Lost";const option=[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent===label)!;await act(async()=>option.click());}
 const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.textContent===name||el.getAttribute("aria-label")===name)!;
 it("shows only the scrolling column's scrollbar and hides it after idle even while hovered",async()=>{
  vi.useFakeTimers();
  try {
   await render();
   const viewport=container.querySelector<HTMLElement>('[data-pipeline-cards]')!;
   const area=viewport.parentElement!;
   const scrollbar=area.querySelector<HTMLElement>('[data-slot="scroll-area-scrollbar"]')!;
   const otherScrollbar=container.querySelectorAll<HTMLElement>('[data-slot="scroll-area-scrollbar"]')[1];
   Object.defineProperties(viewport,{clientHeight:{value:300},scrollHeight:{value:1200}});
   await act(async()=>{area.dispatchEvent(new PointerEvent("pointerenter",{pointerType:"mouse"}));await vi.advanceTimersByTimeAsync(50);});
   expect(scrollbar.hasAttribute("data-visible")).toBe(false);
   await act(async()=>{viewport.scrollTop=100;viewport.dispatchEvent(new Event("scroll"));await vi.advanceTimersByTimeAsync(50);});
   expect(scrollbar.hasAttribute("data-visible")).toBe(true);
   expect(otherScrollbar.hasAttribute("data-visible")).toBe(false);
   await act(async()=>vi.advanceTimersByTimeAsync(600));
   expect(scrollbar.hasAttribute("data-visible")).toBe(true);
   await act(async()=>{viewport.scrollTop=200;viewport.dispatchEvent(new Event("scroll"));await vi.advanceTimersByTimeAsync(600);});
   expect(scrollbar.hasAttribute("data-visible")).toBe(true);
   await act(async()=>vi.advanceTimersByTimeAsync(700));
   expect(scrollbar.hasAttribute("data-visible")).toBe(false);
  } finally {vi.useRealTimers();}
 });
 it("shows the horizontal scrollbar only for board scrolling and fades it after idle",async()=>{
  vi.useFakeTimers();
  try {
   await render();
   const board=container.querySelector<HTMLElement>('[aria-label="Pipeline board"]')!;
   const area=board.parentElement!;
   const scrollbar=area.querySelector<HTMLElement>('[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]')!;
   const column=board.querySelector<HTMLElement>('[data-pipeline-cards]')!;
   Object.defineProperties(board,{clientWidth:{value:700},scrollWidth:{value:2000}});
   Object.defineProperties(column,{clientHeight:{value:300},scrollHeight:{value:1200}});
   await act(async()=>{area.dispatchEvent(new PointerEvent("pointerenter",{pointerType:"mouse"}));await vi.advanceTimersByTimeAsync(50);});
   expect(scrollbar.hasAttribute("data-visible")).toBe(false);
   await act(async()=>{column.scrollTop=100;column.dispatchEvent(new Event("scroll"));await vi.advanceTimersByTimeAsync(50);});
   expect(scrollbar.hasAttribute("data-visible")).toBe(false);
   await act(async()=>{board.dispatchEvent(new WheelEvent("wheel",{deltaX:120,bubbles:true,cancelable:true}));board.dispatchEvent(new Event("scroll"));await vi.advanceTimersByTimeAsync(50);});
   expect(board.scrollLeft).toBe(120);
   expect(scrollbar.hasAttribute("data-visible")).toBe(true);
   await act(async()=>vi.advanceTimersByTimeAsync(600));
   expect(scrollbar.hasAttribute("data-visible")).toBe(true);
   await act(async()=>{board.scrollLeft=200;board.dispatchEvent(new Event("scroll"));await vi.advanceTimersByTimeAsync(600);});
   expect(scrollbar.hasAttribute("data-visible")).toBe(true);
   await act(async()=>vi.advanceTimersByTimeAsync(700));
   expect(scrollbar.hasAttribute("data-visible")).toBe(false);
  } finally {vi.useRealTimers();}
 });
 it("shows the requested deal card details and totals across seasons",async()=>{
  load.mockResolvedValueOnce({...data,deals:[{...deal,ownerMemberId:"m1",sponsorLevel:"silver",probability:75,followUpOn:"2026-11-30",contributions:[...deal.contributions,{seasonId:"s28",kind:"product",description:"Components",amountOre:"50000",invoiceDate:null},{seasonId:"s28",kind:"service",description:"Support",amountOre:null,invoiceDate:null}]}],seasons:[...data.seasons,{id:"s28",code:"S28",name:"2028",startDate:"2027-08-01",endDate:"2028-07-31",status:"planning"}]});
  await render();const text=container.querySelector('[aria-label="Lead"]')!.textContent!;
  for(const value of ["Partner", "Silver", "S27, S28", "NOK 1\u00a0200,00"]) expect(text).toContain(value);
  expect(container.querySelector('[aria-label="Edit Sponsor level for Engine deal"]')).toBeNull();
  const badges = [...container.querySelectorAll('[data-slot="badge"]')];
  expect(badges.find(badge=>badge.textContent === "Medium")?.className).toContain("amber");
  expect(badges.find(badge=>badge.textContent === "Silver")?.className).toContain("slate");
  expect(container.textContent).not.toContain("Medium confidence");
  expect(text).not.toContain("Follow up");
  expect(text).not.toContain("2026-11-30");
  const card=container.querySelector('[role="article"][aria-label="Engine deal"]')!;
  expect(card.textContent).not.toContain("Morgan");
  expect(card.querySelector('[data-assignee-names]')).toBeNull();
  expect(card.querySelector('[role="img"][aria-label="Morgan"]')?.getAttribute("title")).toBe("Morgan");
  expect(container.textContent).not.toContain("Linked budget entries");
  await openDetail();
  const panel = document.querySelector('[data-slot="sheet-content"]')!;
  expect(panel.querySelector('[role="img"][aria-label="Morgan"]')).not.toBeNull();
  for(const value of ["Company","Assignee","Deal value","In-kind value","unvalued items","Values total across seasons","Private","Logo"]) expect(panel.textContent).toContain(value);
 });
 it("totals cash by stage and pipeline view, excluding in-kind, retired and unset values", async () => {
  load.mockResolvedValueOnce({...data,deals:[
   {...deal,contributions:[...deal.contributions,{seasonId:"s28",kind:"cash",description:"Next season",amountOre:"23001",invoiceDate:null},{seasonId:"s27",kind:"product",description:"Parts",amountOre:"9000000",invoiceDate:null},{seasonId:"s27",kind:"service",description:"Support",amountOre:"1000000",invoiceDate:null},{...deal.contributions[0],amountOre:null},{...deal.contributions[0],amountOre:"900000",retiredAt:"2026-11-01"}]},
   {...deal,id:"two",contributions:[{...deal.contributions[0],amountOre:"4034"}]},
   {...deal,id:"three",stage:"contacted",contributions:[{...deal.contributions[0],amountOre:"5026"}]},
   {...deal,id:"grant",opportunityKind:"grant",contributions:[{...deal.contributions[0],amountOre:"700044"}]},
  ]});
  await render();
  expect(container.querySelector('[aria-label="Lead cash total"]')?.textContent).toBe("Value: NOK 1\u00a0470,35");
  expect(container.querySelector('[aria-label="Contacted cash total"]')?.textContent).toBe("Value: NOK 50,26");
  for (const label of ["In discussion","Proposal sent","Won","Lost"]) expect(container.querySelector(`[aria-label="${label} cash total"]`)?.textContent).toBe("Value: NOK 0,00");
  await act(async()=>container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  expect(container.querySelector('[aria-label="Lead cash total"]')?.textContent).toBe("Value: NOK 7\u00a0000,44");
  expect(container.querySelector('[aria-label="Approved cash total"]')?.textContent).toBe("Value: NOK 0,00");
 });
 async function filterBy(label:string, choice:string) {
  const trigger=document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  await act(async()=>trigger.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true})));
  await act(async()=>[...document.querySelectorAll<HTMLElement>('[data-slot="select-content"] [role="option"]')].find(option=>option.textContent===choice)!.click());
  await vi.waitFor(()=>expect(document.activeElement).toBe(trigger));
 }
 it("combines filters, switches to unassigned cards, updates totals, and clears the selection",async()=>{
  load.mockResolvedValueOnce({...data,deals:[
   {...deal,title:"Mine silver",ownerMemberId:"m1",sponsorLevel:"silver",probability:100},
   {...deal,id:"other",title:"Other silver",ownerMemberId:"m2",sponsorLevel:"silver",probability:100},
   {...deal,id:"unassigned",title:"Unassigned silver",stage:"proposal",ownerMemberId:null,sponsorLevel:"silver",probability:100},
   {...deal,id:"medium",title:"Mine gold",ownerMemberId:"m1",sponsorLevel:"gold",probability:75},
  ]});
  await render();expect(button("Pipeline filters").textContent).toBe("");await act(async()=>button("Pipeline filters").click());
  await filterBy("Filter by confidence","High");await filterBy("Filter by sponsor level","Silver");await filterBy("Filter by assignment","Assigned to me");
  expect([...container.querySelectorAll('[role="article"]')].map(card=>card.getAttribute("aria-label"))).toEqual(["Mine silver"]);
  expect(container.querySelector('[aria-label="Lead cash total"]')?.textContent).toBe("Value: NOK 1\u00a0200,00");
  expect(document.querySelector('[aria-label="3 active filters"]')).not.toBeNull();
  await filterBy("Filter by assignment","Unassigned");
  expect([...container.querySelectorAll('[role="article"]')].map(card=>card.getAttribute("aria-label"))).toEqual(["Unassigned silver"]);
  expect(container.querySelector('[aria-label="Lead cash total"]')?.textContent).toBe("Value: NOK 0,00");
  await act(async()=>button("Clear filters").click());expect(container.querySelectorAll('[role="article"]')).toHaveLength(4);
  const popup=document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
  await act(async()=>popup.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
  await vi.waitFor(()=>expect(document.activeElement).toBe(button("Pipeline filters")));
 });
 it("ignores a deal sponsor filter in Grants and exposes independently focusable column lists",async()=>{
  load.mockResolvedValueOnce({...data,deals:[{...deal,sponsorLevel:"silver"},{...deal,id:"grant",title:"Grant",opportunityKind:"grant",sponsorLevel:null}]});
  await render();await act(async()=>button("Pipeline filters").click());await filterBy("Filter by sponsor level","Gold");
  await act(async()=>button("Pipeline filters").click());
  await act(async()=>container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  expect(container.querySelector('[role="article"][aria-label="Grant"]')).not.toBeNull();
  await act(async()=>button("Pipeline filters").click());expect(document.querySelector('[aria-label="Filter by sponsor level"]')).toBeNull();
  for(const stage of ["Lead","Contacted","In discussion","Proposal sent","Approved","Lost"]) expect(container.querySelector(`[role="region"][aria-label="${stage} cards"]`)?.getAttribute("tabindex")).toBe("0");
 });
 it("shows and edits a deal season without inventing a contribution",async()=>{
  load.mockResolvedValueOnce({...data,deals:[{...deal,seasonId:"s27",contributions:[]}],seasons:[...data.seasons,{id:"s28",code:"S28",name:"2028",startDate:"2027-08-01",endDate:"2028-07-31",status:"planning"}]});
  await render(); await openDetail();
  expect(document.querySelector('[aria-label="Edit Season for Engine deal"]')?.textContent).toContain("S27");
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Edit Season for Engine deal"]')!.click());
  await act(async()=>button("S28").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({seasonId:"s28",contributions:[]}));
 });
 it("edits a card field inline and saves the revised deal",async()=>{
  await render(); await openDetail();
  const edit=document.querySelector<HTMLButtonElement>('[aria-label="Edit Sponsor level for Engine deal"]')!;
  await act(async()=>edit.click());
  const selector=document.querySelector<HTMLButtonElement>('[aria-label="Sponsor level"]')!;
  await act(async()=>selector.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));
  const silver=[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent==="Silver")!;
  await act(async()=>silver.click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",expectedRevision:3,sponsorLevel:"silver",deliverables:expect.arrayContaining([expect.objectContaining({title:"Logo on car and website"}),expect.objectContaining({title:"CV bank access"}),expect.objectContaining({id:"deliverable-1",title:"Logo"})])}));
 });
 it("saves a confidence choice without changing the deal stage",async()=>{
  await render(); await openDetail();
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Edit Confidence for Engine deal"]')!.click());
  const confidence = document.querySelector<HTMLButtonElement>('[aria-label="Confidence"]')!;
  await act(async()=>confidence.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));
  const medium = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent === "Medium")!;
  await act(async()=>medium.click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({probability:75,stage:"lead",contributions:expect.arrayContaining([expect.objectContaining({id:"contribution-1",invoiceDate:"2026-11-01"})])}));
  expect(confirmWon).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain("Deal saved");
  expect(document.body.textContent).not.toContain("The pipeline has been updated");
 });
 async function input(selector:string,value:string) {
  const element=document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(prototype,"value")!.set!.call(element,value);element.dispatchEvent(new Event("input",{bubbles:true}));});
 }
 function persistSaves() {
  const current=structuredClone(data);
  load.mockImplementation(async()=>structuredClone(current));
  save.mockImplementation(async(input)=>{const prior=current.deals.find(item=>item.id===input.id)!;current.deals=[{...prior,...input,revision:prior.revision+1,deliverables:input.deliverables.map((item:Deal["deliverables"][number],index:number)=>({...item,id:item.id ?? `new-${index}`}))}];return {id:input.id};});
 }
 it("saves contact name and email independently on blur and Enter with only inputs",async()=>{
  persistSaves();await render();await openDetail();
  expect(button("Edit deal")).toBeUndefined();
  expect(button("Save Contact name")).toBeUndefined();expect(button("Cancel Contact name")).toBeUndefined();
  const name=document.querySelector<HTMLInputElement>('[aria-label="Contact name"]')!;
  await act(async()=>name.focus());
  await input('[aria-label="Contact name"]',"Alex Partner");
  await act(async()=>name.blur());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({contactName:"Alex Partner",contactEmail:"",contributions:deal.contributions,deliverables:deal.deliverables}));
  const email=document.querySelector<HTMLInputElement>('[aria-label="Contact email"]')!;
  await act(async()=>email.focus());await input('[aria-label="Contact email"]',"alex@example.com");
  await act(async()=>email.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({expectedRevision:4,contactName:"Alex Partner",contactEmail:"alex@example.com"}));
  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
 });
 it("keeps invalid contact input available to correct after blur",async()=>{
  await render();await openDetail();const email=document.querySelector<HTMLInputElement>('[aria-label="Contact email"]')!;
  await act(async()=>email.focus());await input('[aria-label="Contact email"]',"not-an-email");await act(async()=>email.blur());
  expect(save).not.toHaveBeenCalled();await act(async()=>email.focus());expect(email.value).toBe("not-an-email");
  await input('[aria-label="Contact email"]',"alex@example.com");await act(async()=>email.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({contactEmail:"alex@example.com"}));
 });
 it("keeps note edits open after a failed save and supports retry",async()=>{
  save.mockRejectedValueOnce(new PipelineError("Try again",503));
  await render();await openDetail();
  await act(async()=>button("Edit Negotiation notes for Engine deal").click());
  await input('textarea',"Updated negotiation notes");
  await act(async()=>button("Save Negotiation notes").click());
  expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe("Updated negotiation notes");
  await act(async()=>button("Save Negotiation notes").click());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({negotiationNotes:"Updated negotiation notes"}));
 });
 it("records partner contributions as notes without changing cash or in-kind values",async()=>{
  await render();await openDetail();
  await act(async()=>button("Edit Partner contributions for Engine deal").click());
  await input('[aria-label="Partner contributions"]',"- Workshop access\n- Components for the car");
  await act(async()=>button("Save Partner contributions").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({partnerNotes:"- Workshop access\n- Components for the car",contributions:deal.contributions}));
 });
 it("groups tier benefits as a simple package and treats manual entries as add-ons",async()=>{
  persistSaves();await render();await openDetail();
  await act(async()=>button("Edit Title for deliverable 1 for Engine deal").click());await input('[aria-label="Title for deliverable 1"]',"Logo placement");await act(async()=>button("Save Title for deliverable 1").click());
  await act(async()=>button("Add deliverable").click());await input('[aria-label="New deliverable"]',"Factory visit");await act(async()=>button("Save New deliverable").click());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({deliverables:[expect.objectContaining({id:"deliverable-1",title:"Logo placement",description:"Logo on the car",ownerMemberId:"m1"}),expect.objectContaining({title:"Factory visit"})]}));
  await act(async()=>button("Remove deliverable 2").click());expect(save).toHaveBeenLastCalledWith(expect.objectContaining({deliverables:[expect.objectContaining({id:"deliverable-1"})]}));
 });
 it("shows the selected package list and supports collapsing it",async()=>{
  load.mockResolvedValueOnce({...structuredClone(data),deals:[{...structuredClone(deal),seasonId:"s27",sponsorLevel:"silver",deliverables:[{title:"Logo on car and website",description:"Display logo",dueDate:null,ownerMemberId:null},{title:"Factory visit",description:"Custom visit",dueDate:null,ownerMemberId:null}]}]});await render();await openDetail();
  expect(document.body.textContent).toContain("Silver package");expect(document.body.textContent).toContain("Add-ons");expect(document.querySelector('[aria-label="Owner for deliverable 1"]')).toBeNull();
  const trigger=[...document.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.includes("Silver package"))!;await act(async()=>trigger.click());expect(document.querySelector('[aria-label="Edit Title for deliverable 1 for Engine deal"]')).toBeNull();expect(document.querySelector('[aria-label="Edit Title for deliverable 2 for Engine deal"]')).not.toBeNull();
 });
 it("cancels an inline edit with Escape while keeping the drawer open and returning focus",async()=>{
  await render();await openDetail();await act(async()=>button("Add deliverable").click());
  const field=document.querySelector<HTMLInputElement>('[aria-label="New deliverable"]')!;
  await act(async()=>field.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
  expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="New deliverable"]')).toBeNull();
  expect(document.activeElement).toBe(button("Add deliverable"));
  expect(save).not.toHaveBeenCalled();
 });
 it("uses a calendar for dates and saves only the chosen field",async()=>{
  await render();await openDetail();await act(async()=>button("Start date").click());
  const calendar=document.querySelector('[data-slot="calendar"]')!;
  expect(calendar).not.toBeNull();
  const day=calendar.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!;
  const expected=day.getAttribute("data-value");
  await act(async()=>day.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true})));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({startsOn:expected,endsOn:null,contactName:"Contact"}));
 });
 it("moves a dragged card to a different column",async()=>{
  await render();
  const card=container.querySelector('[role="article"][aria-label="Engine deal"]')!;
  await dragBoardCard(card.querySelector("button")!,container.querySelector('[aria-label="Contacted"]')!);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",stage:"contacted"}));
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
 });
 it("asks for confirmation when a card is dragged to Won",async()=>{
  await render();
  const card=container.querySelector('[role="article"][aria-label="Engine deal"]')!;
  await dragBoardCard(card,container.querySelector('[aria-label="Won"]')!);
  expect(document.body.textContent).toContain("Confirm deal as won");expect(confirmWon).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
 });
 it("moves a focused card with the keyboard and keeps it in place until drop", async () => {
  await render();
  const card = container.querySelector<HTMLElement>('[role="article"][aria-label="Engine deal"]')!;
  const press = async (key: string) => act(async () => card.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
  await act(async () => card.focus());
  await press(" ");
  await press("ArrowRight");
  expect(container.querySelector('[aria-label="Contacted"]')?.hasAttribute("data-over")).toBe(true);
  expect(save).not.toHaveBeenCalled();
  await press("Escape");
  expect(container.querySelector('[aria-label="Contacted"]')?.hasAttribute("data-over")).toBe(false);
  await press(" ");
  await press("ArrowRight");
  await press(" ");
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "one", stage: "contacted" }));
 });
 it("shows six stages and moves a deal without generating a won transition",async()=>{await render();for(const name of ["Lead","Contacted","In discussion","Proposal sent","Won","Lost"])expect(container.querySelector(`[aria-label="${name}"]`)).not.toBeNull();await select("lost");expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",expectedRevision:3,stage:"lost"}));expect(save.mock.calls[0][0].contributions[0].id).toBe("contribution-1");expect(save.mock.calls[0][0].deliverables[0].id).toBe("deliverable-1");expect(confirmWon).not.toHaveBeenCalled();});
 it("omits partner-specific fields on grants while keeping budget links and contact fields", async () => {
  load.mockResolvedValueOnce({...data,deals:[{...deal,opportunityKind:"grant",sponsorLevel:"silver",partnerNotes:"Old partner notes"}]});
  await render();
  await act(async()=>container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Open grant Engine deal"]')!.click());
  const panel=document.querySelector('[data-slot="sheet-content"]')!;
  for(const text of ["Negotiation notes","Partner contributions","Sponsor level","In-kind value","Deal value","Old partner notes","Private"]) expect(panel.textContent).not.toContain(text);
  expect(panel.querySelector('[aria-label="Edit Sponsor level for Engine deal"]')).toBeNull();
  expect(panel.textContent).toContain("Linked budget entries");
  expect(panel.querySelector('[aria-label="Edit Grant value for Engine deal"]')).not.toBeNull();
  expect(panel.querySelector('[aria-label="Contact name"]')).not.toBeNull();
 });
 it.each(["deal","grant"] as const)("requires acknowledgment of linked entries before confirming a %s",async(kind)=>{
  const entry={entryId:"frame",description:"Frame tubes",projectName:"Frame",departmentName:"Mechanical & Production",priority:"P2",selected:true};
  budgetLoad.mockResolvedValue({dealId:"one",dealRevision:3,locked:kind==="grant",entries:[entry]});
  load.mockResolvedValue({...data,deals:[{...deal,opportunityKind:kind}]});
  await render();
  if(kind==="grant") {
   await act(async()=>container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
   await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Open grant Engine deal"]')!.click());
   await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Stage for Engine deal"]')!.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));
   await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent==="Approved")!.click());
  } else await select("won");
  const confirmButton=button(kind==="grant"?"Confirm approved":"Confirm won");
  expect(confirmButton.disabled).toBe(true);
  const review=document.querySelector('[aria-label="Budget priority lock"]')!;
  expect(review.textContent).toContain("Frame tubes");expect(review.textContent).toContain("P2 → P0");
  expect(review.textContent).toContain("Their links cannot be removed afterward");
  const checkbox=review.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
  await act(async()=>checkbox.click());
  expect(confirmButton.disabled).toBe(false);
  await act(async()=>checkbox.click()); expect(confirmButton.disabled).toBe(true);
  await act(async()=>checkbox.click()); await act(async()=>confirmButton.click());
  expect(confirmWon).toHaveBeenCalledWith("one",3);
 });
 it("blocks Won until budget links load and allows retry after a load failure",async()=>{
  budgetLoad.mockRejectedValueOnce(new Error("Unavailable"));
  await render();await select("won");
  expect(button("Confirm won").disabled).toBe(true);
  expect(confirmWon).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("Could not review budget links");
  await act(async()=>button("Retry").click());
  expect(button("Confirm won").disabled).toBe(false);
 });
 it("blocks a stale budget-link review until the latest card is reviewed",async()=>{
  budgetLoad.mockResolvedValueOnce({dealId:"one",dealRevision:4,locked:false,entries:[]});
  await render();await select("won");expect(button("Confirm won").disabled).toBe(true);
  load.mockResolvedValue({...data,deals:[{...deal,revision:4}]});
  budgetLoad.mockResolvedValue({dealId:"one",dealRevision:4,locked:false,entries:[]});
  await act(async()=>button("Review latest").click());
  expect(button("Confirm won").disabled).toBe(false);
  await act(async()=>button("Confirm won").click());expect(confirmWon).toHaveBeenCalledWith("one",4);
 });
 it("reviews and explicitly confirms Won, preserving the card when the handoff fails",async()=>{confirmWon.mockRejectedValueOnce(new PipelineError("Try again",503));await render();await select("won");expect(save).not.toHaveBeenCalled();expect(document.body.textContent).toContain("Confirm deal as won");expect(document.body.textContent).toContain("Logo on the car");expect(document.body.textContent).toContain("Owner: Morgan");expect(document.body.textContent).toContain("Due: 2027-02-03");expect(document.body.textContent).toContain("Invoice date: 2026-11-01");expect(confirmWon).not.toHaveBeenCalled();await act(async()=>button("Confirm won").click());expect(confirmWon).toHaveBeenCalledWith("one",3);expect(document.body.textContent).toContain("Could not confirm deal");expect(document.body.textContent).toContain("Engine deal");expect(document.querySelector('[role="dialog"]')).not.toBeNull();});
 it("offers authorized recovery when duplicate funding blocks confirmation",async()=>{
  confirmWon.mockRejectedValueOnce(new PipelineError("Existing funding",409,"funding_possible_duplicate"));
  await render();await select("won");await act(async()=>button("Confirm won").click());
  expect(document.body.textContent).toContain("Funding needs review");
  await act(async()=>button("Review funding").click());
  expect(document.body.textContent).toContain("Recovery for contribution-1");
 });
 it("directs users without finance permission to ask Finance",async()=>{
  load.mockResolvedValueOnce({...structuredClone(data),canReviewFunding:false});
  confirmWon.mockRejectedValueOnce(new PipelineError("Existing funding",409,"funding_possible_duplicate"));
  await render();await select("won");await act(async()=>button("Confirm won").click());
  expect(document.body.textContent).toContain("Request a limited review from Finance");
  await act(async()=>button("Request review").click());
  expect(requestFinanceReview).toHaveBeenCalledWith("one",3);
  expect(button("Review funding")).toBeUndefined();
 });
 it("does not restore a stale pipeline response after access is revoked",async()=>{
  let resolve!: (value:PipelineData)=>void;
  load.mockReset().mockReturnValueOnce(new Promise<PipelineData>(r=>{resolve=r;})).mockRejectedValueOnce(new PipelineError("Access denied",403));
  await render();await act(async()=>window.dispatchEvent(new Event("focus")));
  await act(async()=>resolve(structuredClone(data)));
  expect(container.textContent).not.toContain("Engine deal");
 });
 it("offers a Finance request when linked funding no longer matches",async()=>{
  load.mockResolvedValueOnce({...structuredClone(data),canReviewFunding:false});
  confirmWon.mockRejectedValueOnce(new PipelineError("Funding changed",409,"funding_mismatch"));
  await render();await select("won");await act(async()=>button("Confirm won").click());
  await act(async()=>button("Request review").click());
  expect(requestFinanceReview).toHaveBeenCalledWith("one",3);
 });
 it("retains unsaved edits and requires review before retrying a stale revision",async()=>{
  save.mockRejectedValueOnce(new PipelineError("This deal changed. Reload it before saving.",409));
  await render();await openDetail();await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Edit Deal name for Engine deal"]')!.click());
  const title=document.querySelector<HTMLInputElement>('input[required][maxlength="200"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(title,"My unsaved deal");title.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>button("Save Deal name").click());
  expect(document.body.textContent).toContain("Your edits are kept");
  load.mockResolvedValueOnce({...structuredClone(data),deals:[{...structuredClone(deal),revision:4,title:"Latest from colleague"}]});
  await act(async()=>button("Review latest").click());
  expect(document.body.textContent).toContain("Latest from colleague");
  expect(document.body.textContent).toContain("My unsaved deal");
  await act(async()=>button("Save my edits").click());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({expectedRevision:4,title:"My unsaved deal"}));
 });
 it("hides private deal data after access is denied",async()=>{load.mockRejectedValueOnce(new PipelineError("Access denied",403));await render();expect(container.textContent).not.toContain("Engine deal");expect(container.textContent).toContain("Could not load pipeline");});
 it("preserves the duplicate funding response code",async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({error:"Review funding",code:"funding_possible_duplicate"})});
  const repo=createPipelineRepository(async()=>"token",fetcher);
  await expect(repo.confirmWon("deal-id",8)).rejects.toMatchObject({status:409,code:"funding_possible_duplicate"});
 });
 it("returns the saved identifier from the API for a subsequent explicit Won confirmation", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "created-deal" }) });
  const repo = createPipelineRepository(async () => "token", fetcher);
  const input = { organizationId: "org", title: "New opportunity", stage: "proposal" as const, ownerMemberId: null, contactName: "", contactEmail: "", startsOn: null, endsOn: null, agreementLink: "", negotiationNotes: "", contributions: [], deliverables: [] };
  expect(await repo.save(input)).toEqual({ id: "created-deal" });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ action: "saveDeal", deal: input });
 });
 it("sends only the explicit confirmation operation to the server",async()=>{const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});const repo=createPipelineRepository(async()=>"token",fetcher);await repo.confirmWon("deal-id",8);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({action:"confirmWon",dealId:"deal-id",expectedRevision:8,confirmed:true});});
 async function fillNew(title = "New opportunity") {
  const input = document.querySelector<HTMLTextAreaElement>('#new-opportunity-title')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, title); input.dispatchEvent(new Event("input", { bubbles: true })); });
  const partner = document.querySelector<HTMLButtonElement>('[aria-label="Company"]')!;
  await act(async () => partner.click());
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === "Partner")!.click());
 }
 it.each([["Lead", "lead"], ["Contacted", "contacted"], ["In discussion", "discussion"], ["Proposal sent", "proposal"], ["Lost", "lost"]])("adds directly to %s from its column control", async (label, stage) => {
  await render();
  const column = container.querySelector(`[aria-label="${label}"]`)!;
  expect(column.querySelector('[aria-label="1 deals"], [aria-label="0 deals"]')).not.toBeNull();
  expect(column.querySelector("h2")?.parentElement?.lastElementChild?.getAttribute("aria-label")).toBe(`Add deal to ${label}`);
  await act(async () => column.querySelector<HTMLButtonElement>(`[aria-label="Add deal to ${label}"]`)!.click());
  await fillNew();
  await act(async () => button("Create deal").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: "New opportunity", organizationId: "org", stage }));
  expect(confirmWon).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(document.activeElement).toBe(column.querySelector(`[aria-label="Add deal to ${label}"]`)));
 });
 it("requires confirmation before creating a card in Won and retries a failed handoff without creating twice", async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add deal to Won"]')!.click());
  await fillNew();
  await act(async () => button("Review as won").click());
  expect(save).not.toHaveBeenCalled(); expect(confirmWon).not.toHaveBeenCalled();
  save.mockResolvedValue({ id: "created" });
  load.mockResolvedValue({ ...data, deals: [...data.deals, { ...deal, id: "created", title: "New opportunity", stage: "proposal", revision: 0 }] });
  confirmWon.mockRejectedValueOnce(new PipelineError("Retry handoff", 503));
  await act(async () => button("Confirm won").click());
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ stage: "proposal" }));
  expect(confirmWon).toHaveBeenCalledWith("created", 0);
  expect(document.body.textContent).toContain("Retry handoff");
  await act(async () => button("Confirm won").click());
  expect(save).toHaveBeenCalledOnce(); expect(confirmWon).toHaveBeenCalledTimes(2);
 });
 it("names a newly created company in the Won review before writing the card", async () => {
  createOrganization.mockResolvedValueOnce("new-company");
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add deal to Won"]')!.click());
  const title = document.querySelector<HTMLTextAreaElement>("#new-opportunity-title")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(title, "Signed partnership"); title.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Company"]')!.click());
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search or add a company"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "New Workshop"); search.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === 'Create company "New Workshop"')!.click());
  await act(async () => button("Review as won").click());
  expect(createOrganization).toHaveBeenCalledWith("New Workshop");
  const dialogs = document.querySelectorAll('[role="dialog"]');
  expect(dialogs[dialogs.length - 1].textContent).toContain("Confirm that New Workshop has agreed to this deal.");
  expect(save).not.toHaveBeenCalled();
 });
 it("cancels a new Won confirmation without writing and keeps the entered form", async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add deal to Won"]')!.click());
  await fillNew("Keep my draft"); await act(async () => button("Review as won").click());
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const confirmation = dialogs[dialogs.length - 1]!;
  await act(async () => [...confirmation.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Cancel")!.click());
  expect(save).not.toHaveBeenCalled(); expect(confirmWon).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLTextAreaElement>('#new-opportunity-title')?.value).toBe("Keep my draft");
 });
 it("adds a grant to its chosen column and confirms creation in Approved separately", async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add grant to Contacted"]')!.click());
  await fillNew("Contacted grant"); await act(async () => button("Create grant").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ opportunityKind: "grant", stage: "contacted" }));
  save.mockClear();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Add grant to Approved"]')!.click());
  await fillNew("Approved grant"); await act(async () => button("Review as approved").click());
  expect(save).not.toHaveBeenCalled(); expect(confirmWon).not.toHaveBeenCalled();
  save.mockResolvedValue({ id: "grant-created" });
  load.mockResolvedValue({ ...data, deals: [...data.deals, { ...deal, id: "grant-created", opportunityKind: "grant", title: "Approved grant", stage: "proposal", revision: 0 }] });
  await act(async () => button("Confirm approved").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ opportunityKind: "grant", stage: "proposal" }));
  expect(confirmWon).toHaveBeenCalledWith("grant-created", 0);
 });
 it("uses the purchase drawer pattern and restores keyboard focus to the card", async () => {
  await render();
  const opener = container.querySelector<HTMLButtonElement>('[aria-label="Open deal Engine deal"]')!;
  opener.focus(); await openDetail();
  const panel = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
  expect(panel.getAttribute("data-side")).toBe("right"); expect(panel.textContent).toContain("Private");
  expect(panel.contains(document.activeElement)).toBe(true);
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await vi.waitFor(() => expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  expect(save).not.toHaveBeenCalled();
 });
 it("opens won cards in the drawer with their agreement link", async () => {
  load.mockResolvedValue({ ...data, deals: [{ ...deal, stage: "won" }] });
  await render(); await openDetail();
  expect(document.querySelector('[data-slot="sheet-content"] a[href="/partner-deals?deal=one"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Stage for Engine deal"]')).toBeNull();
  expect(button("Edit deal")).toBeUndefined();
 });
 it("clears an open drawer when access is revoked", async () => {
  await render(); await openDetail();
  load.mockRejectedValueOnce(new PipelineError("Access denied", 403));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(document.body.textContent).not.toContain("Private");
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
 });
 it("exposes the board and column actions by their accessible names", async () => {
  const agent = createAgent();
  await render();
  const entries = agent.snapshot().filter(entry => !entry.offPage && entry.component !== "more");
  for (const entry of entries) expect(entry.label).toBeTruthy();
  expect(entries.map(entry => entry.label)).toContain("Pipeline board");
  for (const label of ["Lead", "Contacted", "In discussion", "Proposal sent", "Won", "Lost"]) expect(container.querySelector(`[aria-label="Add deal to ${label}"]`)).not.toBeNull();
 });
 it("separates Deals and Grants and opens a grant draft without an invoice date field",async()=>{
  load.mockResolvedValueOnce({...data,deals:[deal,{...deal,id:"grant",opportunityKind:"grant",title:"NU funding application",deliverables:[]}]});
  await render();
  expect(container.querySelector('[role="article"][aria-label="Engine deal"]')).not.toBeNull();
  expect(container.querySelector('[role="article"][aria-label="NU funding application"]')).toBeNull();
  const grants=container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')!;
  await act(async()=>grants.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
  expect(grants.getAttribute("aria-selected")).toBe("true");
  expect(container.querySelector('[role="article"][aria-label="Engine deal"]')).toBeNull();
  expect(container.querySelector('[role="article"][aria-label="NU funding application"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Approved"]')).not.toBeNull();
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Add grant to Lead"]')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("New grant");
  expect(document.querySelector('[aria-label="Opportunity type"]')).toBeNull();
  expect(button("Add contribution")).toBeUndefined();
  expect(document.querySelector('#new-opportunity-title')?.getAttribute("placeholder")).toBe("Grant name");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Invoice date");
 });

});
