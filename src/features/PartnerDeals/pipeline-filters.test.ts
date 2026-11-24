import { expect, it } from "vitest";
import { activePipelineFilterCount, defaultPipelineFilters, matchesPipelineFilters } from "./pipeline-filters";
import type { Deal } from "./types";
const deal = {opportunityKind:"deal",probability:100,sponsorLevel:"silver",ownerMemberId:"me"} as Deal;
it("combines confidence, sponsor level and the actual workspace member assignment",()=>{
  const filter={confidence:"high" as const,sponsorLevel:"silver",assignment:"mine" as const};
  expect(matchesPipelineFilters(deal,"deal",filter,"me")).toBe(true);
  expect(matchesPipelineFilters({...deal,ownerMemberId:"other"},"deal",filter,"me")).toBe(false);
  expect(matchesPipelineFilters(deal,"deal",filter,undefined)).toBe(false);
  expect(matchesPipelineFilters({...deal,probability:75},"deal",filter,"me")).toBe(false);
  expect(matchesPipelineFilters({...deal,sponsorLevel:"gold"},"deal",filter,"me")).toBe(false);
  expect(activePipelineFilterCount(filter,"deal")).toBe(3);
});
it("supports unassigned and unset values without hiding grants because of a deal's tier filter",()=>{
  expect(matchesPipelineFilters({...deal,ownerMemberId:null},"deal",{...defaultPipelineFilters,assignment:"unassigned"},"me")).toBe(true);
  expect(matchesPipelineFilters(deal,"deal",{...defaultPipelineFilters,assignment:"unassigned"},"me")).toBe(false);
  expect(matchesPipelineFilters({...deal,probability:null,sponsorLevel:null},"deal",{...defaultPipelineFilters,confidence:"unset",sponsorLevel:"unset"},"me")).toBe(true);
  expect(matchesPipelineFilters({...deal,opportunityKind:"grant",sponsorLevel:null},"grant",{...defaultPipelineFilters,sponsorLevel:"silver"},"me")).toBe(true);
  expect(activePipelineFilterCount({...defaultPipelineFilters,sponsorLevel:"silver"},"grant")).toBe(0);
});
