import { describe, expect, it } from "vitest";
import { withTierDeliverables } from "./sponsor-tier-terms";
import { tierDeliverables } from "./tier-deliverables";
import type { DealInput, PipelineData } from "./types";
const data:PipelineData={canManage:true,deals:[],organizations:[],seasons:[{id:"s27",code:"S27",name:"2027",startDate:"2026-08-01",endDate:"2027-07-31",status:"active"}]};
const input:DealInput={title:"Support",organizationId:"partner",stage:"lead",sponsorLevel:"silver",seasonId:"s27",ownerMemberId:null,contactName:"",contactEmail:"",startsOn:null,endsOn:null,agreementLink:"",negotiationNotes:"",contributions:[],deliverables:[{id:"custom",title:"Factory tour",description:"Arrange a tour",dueDate:"2027-03-01",ownerMemberId:"member"}]};
describe("tier deliverable defaults",()=>{
 it("adds the complete tier package and preserves custom details without duplicates",()=>{
  const first=withTierDeliverables(input,data);
  expect(first.deliverables.map(item=>item.title)).toEqual(["Factory tour",...tierDeliverables("silver",["S27"]).map(item=>item.title)]);
  expect(first.deliverables[0]).toEqual(input.deliverables[0]);
  expect(withTierDeliverables(first,data).deliverables).toEqual(first.deliverables);
  const upgraded=withTierDeliverables({...first,sponsorLevel:"gold"},data);
  expect(upgraded.deliverables).toHaveLength(1+tierDeliverables("gold",["S27"]).length);
 });
 it("does not invent a tier package for grants or a season with no published preset",()=>{
  expect(withTierDeliverables({...input,opportunityKind:"grant"},data).deliverables).toEqual(input.deliverables);
  expect(withTierDeliverables({...input,seasonId:"future"},data).deliverables).toEqual(input.deliverables);
 });
});
