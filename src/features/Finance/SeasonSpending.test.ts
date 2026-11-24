import { expect, it } from "vitest";
import { seasonSpendingTotals } from "./SeasonSpending";
import type { FinancePurchaseSummary } from "./types";
it("counts paid and outstanding recorded cost once and excludes voided purchases", () => {
  const rows = [{ status:"registered",totalNok:"100.25",unpaid:false },{status:"registered",totalNok:"250.50",unpaid:true,invoice:{paid:true},reimbursement:{paid:false}},{status:"voided",totalNok:"99999.00",unpaid:false}] as FinancePurchaseSummary[];
  expect(seasonSpendingTotals(rows)).toEqual({unpaidInvoicesNok:"0.00",unpaidNok:"250.50",paidNok:"100.25",totalNok:"350.75"});
  expect(seasonSpendingTotals([])).toEqual({unpaidInvoicesNok:"0.00",unpaidNok:"0.00",paidNok:"0.00",totalNok:"0.00"});
});

it("separately totals unpaid invoice purchases without including reimbursements, paid invoices or voided records", () => {
  const rows = [
    {status:"registered",paymentMethod:"invoice",totalNok:"450.25",unpaid:true,invoice:{paid:false}},
    {status:"registered",paymentMethod:"invoice",totalNok:"100.00",unpaid:false,invoice:{paid:true}},
    {status:"registered",paymentMethod:"outlay",totalNok:"50.50",unpaid:true,invoice:{paid:false},reimbursement:{paid:false}},
    {status:"voided",paymentMethod:"invoice",totalNok:"9999.00",unpaid:true,invoice:{paid:false}},
  ] as FinancePurchaseSummary[];
  expect(seasonSpendingTotals(rows)).toEqual({paidNok:"100.00",unpaidNok:"500.75",unpaidInvoicesNok:"450.25",totalNok:"600.75"});
});
