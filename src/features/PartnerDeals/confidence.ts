export const dealConfidences = ["low", "medium", "high"] as const;
export type DealConfidence = typeof dealConfidences[number];
export const confidenceLabels: Record<DealConfidence, string> = { low: "Low", medium: "Medium", high: "High" };
// Keep existing persisted choices compatible: Under 50%, Over 50%, Closed.
// These values are category storage codes, not weights in the income forecast.
export const confidenceValues: Record<DealConfidence, number> = { low: 25, medium: 75, high: 100 };
export function dealConfidence(value: number | null | undefined): DealConfidence | null {
  if (value == null) return null;
  return value >= 100 ? "high" : value >= 50 ? "medium" : "low";
}
