import { formatOreNb } from "../Finance/money";
import { confidenceLabels, dealConfidence } from "./confidence";
import type { Deal, PipelineData } from "./types";

export function dealCashOre(deal: Deal): bigint {
  return deal.contributions.reduce((total, item) =>
    item.kind === "cash" && !(item as { retiredAt?: string | null }).retiredAt
      ? total + BigInt(item.amountOre ?? "0")
      : total, 0n);
}

export function dealPresentation(deal: Deal, data: PipelineData, members: { id: string; name: string }[]) {
  const contributions = deal.contributions.filter(item => !(item as { retiredAt?: string | null }).retiredAt);
  const cash = contributions.filter(item => item.kind === "cash" && item.amountOre !== null);
  const inKind = deal.opportunityKind === "grant" ? [] : contributions.filter(item => item.kind !== "cash");
  const valued = inKind.filter(item => item.amountOre !== null);
  const money = (items: typeof contributions) => `NOK ${formatOreNb(items.reduce((sum, item) => sum + BigInt(item.amountOre ?? "0"), 0n))}`;
  const seasons = [...new Set([deal.seasonId, ...contributions.map(item => item.seasonId)].filter(Boolean).map(id => data.seasons.find(season => season.id === id)?.code).filter(Boolean))];
  const confidence = dealConfidence(deal.probability);
  return {
    cash: cash.length ? `NOK ${formatOreNb(dealCashOre(deal))}` : null,
    inKind: valued.length ? money(valued) : null,
    unvalued: inKind.length - valued.length,
    owner: deal.ownerMemberId ? members.find(member => member.id === deal.ownerMemberId)?.name ?? "Member unavailable" : "Unassigned",
    seasons: seasons.join(", "),
    confidence: confidence ? confidenceLabels[confidence] : null,
  };
}
