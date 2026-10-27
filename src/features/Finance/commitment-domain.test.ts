import { describe, expect, it } from "vitest";
import { lineRemainingOre, requestRemainingOre, scenarioNeedOre } from "./commitment-domain.js";

describe("commitment-domain", () => {
  it("derives line and request remaining amounts", () => {
    expect(lineRemainingOre(1_000_000n, 400_000n)).toBe(600_000n);
    expect(lineRemainingOre(1_000_000n, 1_100_000n)).toBe(0n);
    expect(requestRemainingOre(1_000_000n, 400_000n, 0n, "approved")).toBe(600_000n);
    expect(requestRemainingOre(1_000_000n, 400_000n, 200_000n, "approved")).toBe(400_000n);
    expect(requestRemainingOre(1_000_000n, 400_000n, 0n, "closed")).toBe(0n);
  });

  it("combines actual with the larger of commitment and eligible plan for scenarios", () => {
    expect(scenarioNeedOre(4_000_000n, 6_000_000n, 8_000_000n)).toBe(12_000_000n);
    expect(scenarioNeedOre(4_000_000n, 6_000_000n, 5_000_000n)).toBe(10_000_000n);
  });
});
