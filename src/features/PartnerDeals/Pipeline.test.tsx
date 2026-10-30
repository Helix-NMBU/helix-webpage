// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { SponsorPipeline } from "./Pipeline";
import { PipelineError, createPipelineRepository } from "./repository";
import type { Deal, PipelineData } from "./types";
const deal:Deal={id:"one",organizationId:"org",organizationName:"Partner",title:"Engine deal",stage:"lead",ownerMemberId:null,contactName:"Contact",contactEmail:"",startsOn:null,endsOn:null,agreementLink:"",negotiationNotes:"Private",revision:3,contributions:[{id:"contribution-1",seasonId:"s27",kind:"cash",description:"",amountOre:"120000",invoiceDate:"2026-11-01"}],deliverables:[{id:"deliverable-1",title:"Logo",description:"Logo on the car",dueDate:"2027-02-03",ownerMemberId:"m1"}]};
const data:PipelineData={canManage:true,canReviewFunding:true,deals:[deal],organizations:[{id:"org",name:"Partner",revision:0}],seasons:[{id:"s27",code:"S27",name:"2027",startDate:"2026-08-01",endDate:"2027-07-31",status:"active"}]};
vi.mock("../Workspace/WorkspaceContext",()=>({useWorkspace:()=>({data:{members:[{id:"m1",name:"Morgan"}]}})}));
vi.mock("./FundingRecovery",()=>({FundingRecovery:({contributionId}:{contributionId:string})=><div>Recovery for {contributionId}</div>}));
function Probe(){const context=useMemberNotifications();return <output>{context?.items.map(i=><span key={i.id}>{i.title} {i.description} {i.action && <button onClick={i.action.onClick}>{i.action.label}</button>}</span>)}</output>;}
describe("Pipeline",()=>{
 let root:Root,container:HTMLDivElement;
 const load=vi.fn(),save=vi.fn(),createOrganization=vi.fn(),renameOrganization=vi.fn(),requestFinanceReview=vi.fn(),confirmWon=vi.fn();
 beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.append(container);root=createRoot(container);load.mockReset().mockResolvedValue(structuredClone(data));save.mockReset().mockResolvedValue(undefined);requestFinanceReview.mockReset().mockResolvedValue(undefined);confirmWon.mockReset().mockResolvedValue(undefined);});
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
 async function render(){const router=createMemoryRouter([{path:"/sponsor-pipeline",element:<MemberThemeProvider><MemberNotificationsProvider><SponsorPipeline repository={{load,save,createOrganization,renameOrganization,requestFinanceReview,confirmWon}}/><Probe/></MemberNotificationsProvider></MemberThemeProvider>}],{initialEntries:["/sponsor-pipeline"]});await act(async()=>root.render(<RouterProvider router={router}/>));}
 async function select(stage:string){const element=container.querySelector<HTMLButtonElement>('[aria-label="Stage for Engine deal"]')!;await act(async()=>element.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));const label=stage==="won"?"Won":"Lost";const option=[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent===label)!;await act(async()=>option.click());}
 const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.textContent===name)!;
 it("shows the requested deal card details and totals across seasons",async()=>{
  load.mockResolvedValueOnce({...data,deals:[{...deal,ownerMemberId:"m1",sponsorLevel:"silver",contributions:[...deal.contributions,{seasonId:"s28",kind:"product",description:"Components",amountOre:"50000",invoiceDate:null},{seasonId:"s28",kind:"service",description:"Support",amountOre:null,invoiceDate:null}]}],seasons:[...data.seasons,{id:"s28",code:"S28",name:"2028",startDate:"2027-08-01",endDate:"2028-07-31",status:"planning"}]});
  await render();const text=container.querySelector('[aria-label="Lead"]')!.textContent!;
  for(const value of ["Company","Partner","Assignee","Morgan","Deal value","In-kind value","Silver","S27, S28","unvalued items","Values total across seasons"]) expect(text).toContain(value);
 });
 it("shows and edits a deal season without inventing a contribution",async()=>{
  load.mockResolvedValueOnce({...data,deals:[{...deal,seasonId:"s27",contributions:[]}],seasons:[...data.seasons,{id:"s28",code:"S28",name:"2028",startDate:"2027-08-01",endDate:"2028-07-31",status:"planning"}]});
  await render();
  expect(container.querySelector('[aria-label="Edit Season for Engine deal"]')?.textContent).toContain("S27");
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Edit Season for Engine deal"]')!.click());
  await act(async()=>button("S28").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({seasonId:"s28",contributions:[]}));
 });
 it("edits a card field inline and saves the revised deal",async()=>{
  await render();
  const edit=container.querySelector<HTMLButtonElement>('[aria-label="Edit Sponsor level for Engine deal"]')!;
  await act(async()=>edit.click());
  const selector=document.querySelector<HTMLButtonElement>('[aria-label="Sponsor level"]')!;
  await act(async()=>selector.dispatchEvent(new KeyboardEvent("keydown",{key:" ",bubbles:true})));
  const silver=[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item=>item.textContent==="Silver")!;
  await act(async()=>silver.click());
  const saveButton=[...document.querySelectorAll<HTMLButtonElement>("button")].find(item=>item.textContent==="Save")!;
  await act(async()=>saveButton.click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",expectedRevision:3,sponsorLevel:"silver"}));
 });
 it("saves a probability choice without changing the deal stage",async()=>{
  await render();
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Edit Probability for Engine deal"]')!.click());
  await act(async()=>button("Over 50%").click());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({probability:75,stage:"lead",contributions:expect.arrayContaining([expect.objectContaining({id:"contribution-1",invoiceDate:"2026-11-01"})])}));
  expect(confirmWon).not.toHaveBeenCalled();
 });
 it("moves a dragged card to a different column",async()=>{
  await render();
  const card=container.querySelector<HTMLElement>('[draggable="true"]')!;
  const target=container.querySelector<HTMLElement>('[aria-label="Contacted"]')!;
  const transfer={effectAllowed:"",dropEffect:"",setData:vi.fn()};
  const drag=async(element:HTMLElement,type:string)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,"dataTransfer",{value:transfer});await act(async()=>element.dispatchEvent(event));};
  await drag(card,"dragstart");await drag(target,"dragover");await drag(target,"drop");
  expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",stage:"contacted"}));
 });
 it("asks for confirmation when a card is dragged to Won",async()=>{
  await render();
  const card=container.querySelector<HTMLElement>('[draggable="true"]')!;
  const target=container.querySelector<HTMLElement>('[aria-label="Won"]')!;
  const transfer={effectAllowed:"",dropEffect:"",setData:vi.fn()};
  for(const [element,type] of [[card,"dragstart"],[target,"dragover"],[target,"drop"]] as const){const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,"dataTransfer",{value:transfer});await act(async()=>element.dispatchEvent(event));}
  expect(document.body.textContent).toContain("Confirm deal as won");expect(confirmWon).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
 });
 it("shows six stages and moves a deal without generating a won transition",async()=>{await render();for(const name of ["Lead","Contacted","In discussion","Proposal sent","Won","Lost"])expect(container.querySelector(`[aria-label="${name}"]`)).not.toBeNull();await select("lost");expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",expectedRevision:3,stage:"lost"}));expect(save.mock.calls[0][0].contributions[0].id).toBe("contribution-1");expect(save.mock.calls[0][0].deliverables[0].id).toBe("deliverable-1");expect(confirmWon).not.toHaveBeenCalled();});
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
  await render();await act(async()=>button("Engine deal").click());
  const title=document.querySelector<HTMLInputElement>('input[required][maxlength="200"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(title,"My unsaved deal");title.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>button("Save deal").click());
  expect(document.body.textContent).toContain("Your edits are kept");
  load.mockResolvedValueOnce({...structuredClone(data),deals:[{...structuredClone(deal),revision:4,title:"Latest from colleague"}]});
  await act(async()=>button("Review latest").click());
  expect(document.body.textContent).toContain("Latest from colleague");
  expect(document.body.textContent).toContain("My unsaved deal");
  await act(async()=>button("Continue with my edits").click());
  expect(title.value).toBe("My unsaved deal");
  await act(async()=>button("Save deal").click());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({expectedRevision:4,title:"My unsaved deal"}));
 });
 it("hides private deal data after access is denied",async()=>{load.mockRejectedValueOnce(new PipelineError("Access denied",403));await render();expect(container.textContent).not.toContain("Engine deal");expect(container.textContent).toContain("Could not load pipeline");});
 it("preserves the duplicate funding response code",async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({error:"Review funding",code:"funding_possible_duplicate"})});
  const repo=createPipelineRepository(async()=>"token",fetcher);
  await expect(repo.confirmWon("deal-id",8)).rejects.toMatchObject({status:409,code:"funding_possible_duplicate"});
 });
 it("sends only the explicit confirmation operation to the server",async()=>{const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});const repo=createPipelineRepository(async()=>"token",fetcher);await repo.confirmWon("deal-id",8);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({action:"confirmWon",dealId:"deal-id",expectedRevision:8,confirmed:true});});
});
