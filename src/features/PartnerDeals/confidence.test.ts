import { expect, it } from "vitest";
import { confidenceValues, dealConfidence } from "./confidence";
it("preserves the three existing confidence category codes without changing deal stages", () => {
 expect([25,75,100].map(dealConfidence)).toEqual(["low","medium","high"]);
 expect(dealConfidence(null)).toBeNull(); expect(dealConfidence(65)).toBe("medium");
 expect(Object.values(confidenceValues).map(dealConfidence)).toEqual(["low","medium","high"]);
});
