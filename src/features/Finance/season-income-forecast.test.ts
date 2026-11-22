import { expect, it } from "vitest";
import { seasonIncomeForecast } from "./season-income-forecast";
import { funding } from "./budget-dashboard.test-support";
import type { FinancingView, PipelineIncomeRecord } from "./types";
const record = (id: string, confidence: PipelineIncomeRecord["confidence"], amountNok: string, invoiceDate: string | null): PipelineIncomeRecord => ({ contributionId: id, fundingId: null, confidence, amountNok, invoiceDate });
const view = (pipelineForecast: PipelineIncomeRecord[]): FinancingView => ({ viewVersion: 1, seasonCode: "S27", funding: [funding("received", "100.01", "2026-10-01")], parts: [], scenarios: [], pipelineForecast });
it("connects actual receipts directly to cumulative 30-day totals using the invoice window", () => {
 const input = view([record("low", "low", "40.45", "2026-12-20"), record("high", "high", "20.25", "2026-12-01"), record("medium", "medium", "30.10", "2026-12-10")]);
 const result = seasonIncomeForecast(input, "S27", "2026-11-22");
 expect(result.points.find(point=>point.date==="2026-11-22")).toEqual({date:"2026-11-22",received:10001n,high:10001n,medium:10001n,low:10001n});
 expect(result.points.filter(point=>point.high!==null)).toHaveLength(2);
 expect(result.points.find(point=>point.date==="2026-12-10")).toBeUndefined();
 expect(result.points[result.points.length - 1]).toEqual({date:"2026-12-22",received:null,high:12026n,medium:15036n,low:19081n});
 expect(result.income.plottedOre).toBe(10001n);
});
it("deduplicates contributions and removes already received or deleted linked funding", () => {
 const input = view([record("same", "high", "10.00", "2026-12-01"), record("same", "high", "10.00", "2026-12-01"), {...record("linked", "low", "100.01", "2026-12-10"),fundingId:"received"}, {...record("deleted", "medium", "90.00", "2026-12-10"),fundingId:"deleted"}]);
 input.funding.push(funding("deleted", "90.00", null, "deleted"));
 const result=seasonIncomeForecast(input,"S27","2026-11-22");
 expect(result.high).toBe(11001n); expect(result.low).toBe(11001n);
});
it("reports undated, overdue and unclassified income without inventing dates or counting other seasons", () => {
 const result=seasonIncomeForecast(view([record("undated","high","1.00",null),record("overdue","high","1.00","2026-11-01"),record("today","medium","1.00","2026-11-22"),record("unset",null,"1.00","2026-12-01"),record("next","low","500.00","2027-08-01"),record("past","low","500.00","2026-07-31")]),"S27","2026-11-22");
 expect(result).toMatchObject({undatedCount:1,overdueCount:2,unclassifiedCount:1,high:10001n,medium:10001n,low:10001n});
 expect(result.points.map(point=>point.date)).toEqual(["2026-08-01","2026-10-01","2026-11-22","2026-12-22"]);
});
it("limits projections to the next 30 days and caps them at the season boundary", () => {
 const input=view([record("inside","high","10.00","2026-12-22"),record("outside","high","90.00","2026-12-23")]);
 const result=seasonIncomeForecast(input,"S27","2026-11-22");
 expect(result.horizonDate).toBe("2026-12-22"); expect(result.high).toBe(11001n);
 expect(result.points[result.points.length-1].date).toBe("2026-12-22");
 expect(seasonIncomeForecast(view([]),"S27","2027-07-20").horizonDate).toBe("2027-08-01");
 expect(seasonIncomeForecast(view([]),"S26","2026-11-22").hasForecast).toBe(false);
 expect(seasonIncomeForecast(view([]),"S28","2026-11-22").hasForecast).toBe(false);
});
