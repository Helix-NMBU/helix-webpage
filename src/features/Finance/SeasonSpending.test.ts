import { expect, it } from "vitest";
import { seasonSpendingTotals } from "./SeasonSpending";
import type { FinancePurchaseSummary } from "./types";
it("counts paid and outstanding recorded cost once and excludes voided purchases", () => {
  const rows = [{ status:"registered",totalNok:"100.25",unpaid:false },{status:"registered",totalNok:"250.50",unpaid:true,invoice:{paid:true},reimbursement:{paid:false}},{status:"voided",totalNok:"99999.00",unpaid:false}] as FinancePurchaseSummary[];
  expect(seasonSpendingTotals(rows)).toEqual({paidNok:"100.25",totalNok:"350.75"});
  expect(seasonSpendingTotals([])).toEqual({paidNok:"0.00",totalNok:"0.00"});
});
