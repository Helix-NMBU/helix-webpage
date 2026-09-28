import type { SponsorTier } from "./types";

export type TierEntitlements = {
  portal: boolean;
  talentDirectory: boolean;
  includedThesisProposals: number | null;
};

export const TIER_ENTITLEMENTS: Record<SponsorTier, TierEntitlements> = {
  Main: { portal: true, talentDirectory: true, includedThesisProposals: null },
  Gold: { portal: true, talentDirectory: true, includedThesisProposals: 1 },
  Silver: { portal: true, talentDirectory: true, includedThesisProposals: 0 },
  Bronze: { portal: true, talentDirectory: false, includedThesisProposals: 0 },
  Service: { portal: false, talentDirectory: false, includedThesisProposals: 0 },
};

export function entitlementsForTier(tier: SponsorTier | null): TierEntitlements {
  return tier ? TIER_ENTITLEMENTS[tier] : TIER_ENTITLEMENTS.Service;
}

export function remainingThesisLabel(tier: SponsorTier | null, credits: number | null) {
  if (tier === "Main") return "Unlimited";
  return String(Math.max(0, credits ?? 0));
}

