import { describe, expect, it } from "vitest";
import { approvedAllocation, coverageLevels, seasonIncome } from "./budget-dashboard-model";
import { item, funding, dashboardBudgetFixture } from "./budget-dashboard.test-support";

describe("approved budget coverage", () => {
  it("adds exact priority bands cumulatively even when the legacy season header is Draft", () => {
    expect(coverageLevels(dashboardBudgetFixture()).map(level => level.amountOre)).toEqual([30025n, 60025n, 100025n, 150075n]);
  });
  it("excludes candidates and cancelled plan, retains purchased approved entries, and treats legacy EM as Baseline", () => {
    const budgets = dashboardBudgetFixture([item("EM", "50.25"), item("P1", "9999.00", false), { ...item("P2", "700.00"), effectivePlanNok: "0.00", status: "cancelled", actualNok: "900.00" }, { ...item("P3", "250.00"), status: "done", actualNok: "500.00" }]);
    expect(coverageLevels(budgets).map(level => level.amountOre)).toEqual([5025n, 5025n, 30025n, 30025n]);
    expect(approvedAllocation(budgets.departments[0], budgets.budgetStatus)).toBe(30025n);
  });
  it("updates targets after an approved priority change and handles absent budgets", () => {
    expect(coverageLevels(dashboardBudgetFixture([item("P2", "100.01")])).map(level => level.amountOre)).toEqual([0n, 10001n, 10001n, 10001n]);
    expect(coverageLevels(dashboardBudgetFixture([item("P1", "100.01")])).map(level => level.amountOre)).toEqual([10001n, 10001n, 10001n, 10001n]);
    expect(coverageLevels(null).map(level => level.amountOre)).toEqual([0n, 0n, 0n, 0n]);
  });
});
describe("season received-income timeline", () => {
  it("uses receipt dates, groups same-day income, sorts it and stops at today", () => {
    const income = seasonIncome([funding("b", "200.25", "2026-10-15"), funding("a", "100.00", "2026-08-01"), funding("c", "0.75", "2026-10-15"), funding("secured", "9000.00", "2026-09-01", "secured"), funding("deleted", "9000.00", "2026-09-01", "deleted")], "S27", "2026-11-22");
    expect(income.startDate).toBe("2026-08-01"); expect(income.endDate).toBe("2027-08-01");
    expect(income.points).toEqual([{ date: "2026-08-01", amountOre: 0n }, { date: "2026-08-01", amountOre: 10000n }, { date: "2026-10-15", amountOre: 30100n }, { date: "2026-11-22", amountOre: 30100n }]);
    expect(income.totalOre).toBe(30100n); expect(income.unplacedCount).toBe(0);
  });
  it("reports undated, future and out-of-season received money without inventing chart dates", () => {
    const income = seasonIncome([funding("undated", "100.00", null), funding("prior", "200.00", "2026-07-31"), funding("future", "300.00", "2026-12-01"), funding("next", "400.00", "2027-08-01")], "S27", "2026-11-22");
    expect(income.plottedOre).toBe(0n); expect(income.totalOre).toBe(100000n); expect(income.unplacedOre).toBe(100000n); expect(income.unplacedCount).toBe(4);
    expect(income.points).toEqual([{ date: "2026-08-01", amountOre: 0n }, { date: "2026-11-22", amountOre: 0n }]);
  });
  it("uses a full closed season and does not project an upcoming season", () => {
    expect(seasonIncome([], "S26", "2026-11-22").throughDate).toBe("2026-08-01");
    expect(seasonIncome([], "S28", "2026-11-22").points).toEqual([{ date: "2027-08-01", amountOre: 0n }]);
  });
});
