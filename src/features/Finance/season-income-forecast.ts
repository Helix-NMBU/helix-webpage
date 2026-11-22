import { seasonIncome } from "./budget-dashboard-model";
import { canonicalNokOre } from "./project-budget-diff";
import type { FinancingView } from "./types";

export type IncomeSeries = "received" | "high" | "medium" | "low";
export type IncomePoint = { date: string } & Record<IncomeSeries, bigint | null>;

/** Scenario totals use full cash values, not invented probability weights. */
export function seasonIncomeForecast(financing: FinancingView, season: string, today: string) {
  const income = seasonIncome(financing.funding, season, today);
  const nextMonth = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const horizonDate = nextMonth < income.endDate ? nextMonth : income.endDate;
  const points = new Map<string, IncomePoint>();
  for (const point of income.points) points.set(point.date, { date: point.date, received: point.amountOre, high: null, medium: null, low: null });
  const receivedIds = new Set(financing.funding.filter(record => record.status === "received" || record.status === "deleted").map(record => record.id));
  const byDate = new Map<string, { high: bigint; medium: bigint; low: bigint }>();
  const seen = new Set<string>();
  let undatedCount = 0, overdueCount = 0, unclassifiedCount = 0;
  for (const record of financing.pipelineForecast ?? []) {
    if (seen.has(record.contributionId) || record.fundingId && receivedIds.has(record.fundingId)) continue;
    seen.add(record.contributionId);
    const amount = canonicalNokOre(record.amountNok);
    if (amount <= 0n) continue;
    if (record.invoiceDate && record.invoiceDate > horizonDate) continue;
    if (!record.confidence) { unclassifiedCount++; continue; }
    if (!record.invoiceDate) { undatedCount++; continue; }
    if (record.invoiceDate < income.startDate || record.invoiceDate >= income.endDate) continue;
    if (record.invoiceDate <= today) { overdueCount++; continue; }
    const totals = byDate.get(record.invoiceDate) ?? { high: 0n, medium: 0n, low: 0n };
    totals[record.confidence] += amount;
    byDate.set(record.invoiceDate, totals);
  }
  let high = income.plottedOre, medium = income.plottedOre, low = income.plottedOre;
  const hasForecast = financing.pipelineForecast !== undefined && horizonDate > income.throughDate;
  if (hasForecast) {
    const start = points.get(income.throughDate)!;
    Object.assign(start, { high, medium, low });
    for (const totals of byDate.values()) {
      high += totals.high;
      medium += totals.high + totals.medium;
      low += totals.high + totals.medium + totals.low;
    }
    points.set(horizonDate, { date: horizonDate, received: null, high, medium, low });
  }
  return { income, horizonDate, hasForecast, points: [...points.values()].sort((a, b) => a.date.localeCompare(b.date)), high, medium, low, undatedCount, overdueCount, unclassifiedCount };
}
