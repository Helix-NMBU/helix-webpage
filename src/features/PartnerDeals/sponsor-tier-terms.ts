import { tierDeliverables, tierDeliverableDrafts } from "./tier-deliverables";
import type { DealInput, PipelineData } from "./types";

// Apply defaults only when the user chooses a tier, never when rendering a deal.
// This lets members remove individual presets without them reappearing on refresh.
export function withTierDeliverables(
  input: DealInput,
  data: PipelineData,
): DealInput {
  const ids = [
    input.seasonId,
    ...input.contributions.map((item) => item.seasonId),
  ].filter(Boolean);
  const codes = ids.length
    ? ids.map(
        (id) => data.seasons.find((season) => season.id === id)?.code ?? "",
      )
    : [data.seasons.find((season) => season.status === "active")?.code ?? ""];
  const presets = tierDeliverables(
    input.opportunityKind === "grant" ? null : input.sponsorLevel,
    codes,
  );
  return {
    ...input,
    deliverables: [
      ...input.deliverables,
      ...tierDeliverableDrafts(presets, input.deliverables),
    ],
  };
}
