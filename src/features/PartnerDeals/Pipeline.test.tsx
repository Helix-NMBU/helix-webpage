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
const deal:Deal={id:"one",organizationId:"org",organizationName:"Partner",title:"Engine deal",stage:"lead",ownerMemberId:null,contactName:"Contact",contactEmail:"",startsOn:null,endsOn:null,agreementLink:"",negotiationNotes:"Private",revision:3,contributions:[{id:"contribution-1",seasonId:"s27",kind:"cash",description:"",amountOre:"120000",invoiceDate:"2026-11-01"}],deliverables:[{id:"deliverable-1",title:"Logo",description:"",dueDate:null,ownerMemberId:null}]};
const data:PipelineData={canManage:true,canReviewFunding:true,deals:[deal],organizations:[{id:"org",name:"Partner",revision:0}],seasons:[{id:"s27",code:"S27",name:"2027",startDate:"2026-08-01",endDate:"2027-07-31",status:"active"}]};
vi.mock("./FundingRecovery",()=>({FundingRecovery:({contributionId}:{contributionId:string})=><div>Recovery for {contributionId}</div>}));
function Probe(){const context=useMemberNotifications();return <output>{context?.items.map(i=><span key={i.id}>{i.title} {i.description} {i.action && <button onClick={i.action.onClick}>{i.action.label}</button>}</span>)}</output>;}
describe("Sponsor pipeline",()=>{
 let root:Root,container:HTMLDivElement;
 const load=vi.fn(),save=vi.fn(),createOrganization=vi.fn(),renameOrganization=vi.fn(),confirmWon=vi.fn();
 beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");document.body.append(container);root=createRoot(container);load.mockReset().mockResolvedValue(structuredClone(data));save.mockReset().mockResolvedValue(undefined);confirmWon.mockReset().mockResolvedValue(undefined);});
 afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
 async function render(){const router=createMemoryRouter([{path:"/sponsor-pipeline",element:<MemberThemeProvider><MemberNotificationsProvider><SponsorPipeline repository={{load,save,createOrganization,renameOrganization,confirmWon}}/><Probe/></MemberNotificationsProvider></MemberThemeProvider>}],{initialEntries:["/sponsor-pipeline"]});await act(async()=>root.render(<RouterProvider router={router}/>));}
 async function select(stage:string){const element=container.querySelector<HTMLSelectElement>('[aria-label="Stage for Engine deal"]')!;await act(async()=>{element.value=stage;element.dispatchEvent(new Event("change",{bubbles:true}));});}
 const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.textContent===name)!;
 it("shows six stages and moves a deal without generating a won transition",async()=>{await render();for(const name of ["Lead","Contacted","In discussion","Proposal sent","Won","Lost"])expect(container.querySelector(`[aria-label="${name}"]`)).not.toBeNull();await select("lost");expect(save).toHaveBeenCalledWith(expect.objectContaining({id:"one",expectedRevision:3,stage:"lost"}));expect(save.mock.calls[0][0].contributions[0].id).toBe("contribution-1");expect(save.mock.calls[0][0].deliverables[0].id).toBe("deliverable-1");expect(confirmWon).not.toHaveBeenCalled();});
 it("reviews and explicitly confirms Won, preserving the card when the handoff fails",async()=>{confirmWon.mockRejectedValueOnce(new PipelineError("Try again",503));await render();await select("won");expect(save).not.toHaveBeenCalled();expect(document.body.textContent).toContain("Confirm deal as won");expect(document.body.textContent).toContain("Logo");expect(confirmWon).not.toHaveBeenCalled();await act(async()=>button("Confirm won").click());expect(confirmWon).toHaveBeenCalledWith("one",3);expect(document.body.textContent).toContain("Could not confirm deal");expect(document.body.textContent).toContain("Engine deal");expect(document.querySelector('[role="dialog"]')).not.toBeNull();});
 it("offers authorized recovery when duplicate funding blocks confirmation",async()=>{
  confirmWon.mockRejectedValueOnce(new PipelineError("Existing funding",409,"funding_possible_duplicate"));
  await render();await select("won");await act(async()=>button("Confirm won").click());
  expect(document.body.textContent).toContain("Matching funding exists");
  await act(async()=>button("Review funding").click());
  expect(document.body.textContent).toContain("Recovery for contribution-1");
 });
 it("directs users without finance permission to ask Finance",async()=>{
  load.mockResolvedValueOnce({...structuredClone(data),canReviewFunding:false});
  confirmWon.mockRejectedValueOnce(new PipelineError("Existing funding",409,"funding_possible_duplicate"));
  await render();await select("won");await act(async()=>button("Confirm won").click());
  expect(document.body.textContent).toContain("Ask a member with Finance access");
  expect(button("Review funding")).toBeUndefined();
 });
 it("hides private deal data after access is denied",async()=>{load.mockRejectedValueOnce(new PipelineError("Access denied",403));await render();expect(container.textContent).not.toContain("Engine deal");expect(container.textContent).toContain("Could not load sponsor pipeline");});
 it("preserves the duplicate funding response code",async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({error:"Review funding",code:"funding_possible_duplicate"})});
  const repo=createPipelineRepository(async()=>"token",fetcher);
  await expect(repo.confirmWon("deal-id",8)).rejects.toMatchObject({status:409,code:"funding_possible_duplicate"});
 });
 it("sends only the explicit confirmation operation to the server",async()=>{const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({})});const repo=createPipelineRepository(async()=>"token",fetcher);await repo.confirmWon("deal-id",8);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({action:"confirmWon",dealId:"deal-id",expectedRevision:8,confirmed:true});});
});
