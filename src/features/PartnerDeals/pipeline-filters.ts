import { dealConfidence, type DealConfidence } from "./confidence";
import type { Deal, OpportunityKind } from "./types";

export type PipelineFilterState = {
  confidence: "all" | "unset" | DealConfidence;
  sponsorLevel: string;
  assignment: "all" | "mine" | "unassigned";
};
export const defaultPipelineFilters: PipelineFilterState = {confidence:"all",sponsorLevel:"all",assignment:"all"};
export function activePipelineFilterCount(filters: PipelineFilterState, kind: OpportunityKind) {
  return Number(filters.confidence !== "all") + Number(filters.assignment !== "all") + Number(kind === "deal" && filters.sponsorLevel !== "all");
}
export function matchesPipelineFilters(deal: Deal, kind: OpportunityKind, filters: PipelineFilterState, viewerId?: string) {
  if ((deal.opportunityKind ?? "deal") !== kind) return false;
  if (filters.confidence !== "all" && (dealConfidence(deal.probability) ?? "unset") !== filters.confidence) return false;
  if (kind === "deal" && filters.sponsorLevel !== "all" && (deal.sponsorLevel || "unset") !== filters.sponsorLevel) return false;
  if (filters.assignment === "mine" && (!viewerId || deal.ownerMemberId !== viewerId)) return false;
  if (filters.assignment === "unassigned" && deal.ownerMemberId) return false;
  return true;
}
