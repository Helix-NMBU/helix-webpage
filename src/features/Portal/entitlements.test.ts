import { describe, expect, it } from "vitest";
import { entitlementsForTier, remainingThesisLabel } from "./entitlements";

describe("sponsor tier entitlements", () => {
  it("allows portal and unlimited thesis proposals for Main", () => {
    expect(entitlementsForTier("Main")).toEqual({ portal: true, talentDirectory: true, includedThesisProposals: null });
    expect(remainingThesisLabel("Main", null)).toBe("Unlimited");
  });

  it("includes one proposal for Gold", () => {
    expect(entitlementsForTier("Gold")).toEqual({ portal: true, talentDirectory: true, includedThesisProposals: 1 });
  });

  it("allows Silver into the Talent Directory without a proposal allowance", () => {
    expect(entitlementsForTier("Silver")).toEqual({ portal: true, talentDirectory: true, includedThesisProposals: 0 });
  });

  it("allows Bronze into the portal without the Talent Directory", () => {
    expect(entitlementsForTier("Bronze")).toEqual({ portal: true, talentDirectory: false, includedThesisProposals: 0 });
  });

  it("denies Service and unknown tiers portal access", () => {
    expect(entitlementsForTier("Service").portal).toBe(false);
    expect(entitlementsForTier(null).portal).toBe(false);
  });

  it("never displays a negative credit balance", () => {
    expect(remainingThesisLabel("Gold", -2)).toBe("0");
  });
});

