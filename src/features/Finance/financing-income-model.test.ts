import { expect, it } from "vitest";
import { financingIncomeRows, seasonIncomeTotals } from "./financing-income-model";
import { funding } from "./budget-dashboard.test-support";
import type { FinancingView, WonIncomeRecord } from "./types";

const won = (id: string, invoiceSent = false, fundingId: string | null = null): WonIncomeRecord => ({
  contributionId: id, dealId: `deal-${id}`, sourceName: id, title: `${id} partnership`, amountNok: "1200.50", fundingId,
  plannedInvoiceDate: "2026-11-25", invoiceSent, invoiceSentOn: invoiceSent ? "2026-11-21" : null,
});
const view = (overrides: Partial<FinancingView> = {}): FinancingView => ({ viewVersion: 1, seasonCode: "S27", funding: [], parts: [], scenarios: [], ...overrides });

it("uses task completion for outstanding payments and actual receipt facts for received money without duplication", () => {
  const rows = financingIncomeRows(view({
    funding: [funding("paid", "1199.75", "2026-11-22"), funding("grant", "3000.00", "2026-11-20"), funding("applied", "5000.00", null, "applied")],
    wonIncome: [won("invoiced", true), won("not-invoiced"), won("paid-contribution", false, "paid")],
  }));
  expect(rows.map(row => row.status)).toEqual(["invoice_not_sent", "waiting_on_payment", "received", "received"]);
  expect(rows.find(row => row.funding?.id === "paid")).toMatchObject({ amountNok: "1199.75", receivedDate: "2026-11-22", status: "received" });
  expect(rows.filter(row => row.funding?.id === "paid")).toHaveLength(1);
  expect(rows.some(row => row.funding?.id === "applied")).toBe(false);
});

it("does not infer sent invoices from a date, supports older completed tasks and skips deleted funding", () => {
  const rows = financingIncomeRows(view({
    funding: [funding("deleted", "10.00", null, "deleted")],
    wonIncome: [{ ...won("stale-date"), invoiceSentOn: "2026-11-20" }, { ...won("legacy", true), invoiceSentOn: null }, won("removed", true, "deleted")],
  }));
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.sourceName === "stale-date")?.status).toBe("invoice_not_sent");
  expect(rows.find(row => row.sourceName === "legacy")?.status).toBe("waiting_on_payment");
  expect(financingIncomeRows(view())).toEqual([]);
});

it("approved grants await payment without using invoice tasks", () => {
  const rows = financingIncomeRows(view({ wonIncome: [{ ...won("grant"), opportunityKind: "grant" } ] }));
  expect(rows[0].status).toBe("awaiting_payment");
  const paid = financingIncomeRows(view({ funding: [funding("receipt", "1200.50", "2026-11-22")], wonIncome: [{ ...won("grant", false, "receipt"), opportunityKind: "grant" }] }));
  expect(paid).toHaveLength(1); expect(paid[0].status).toBe("received");
});

it("totals received and confirmed outstanding income without counting linked receipts twice or including applications", () => {
  const input=view({funding:[funding("receipt","1199.75","2026-11-22"),funding("grant","3000.00","2026-11-20"),funding("applied","9000.00",null,"applied"),funding("deleted","9999.00",null,"deleted")],wonIncome:[won("paid",true,"receipt"),won("invoice",true),{...won("approved-grant"),opportunityKind:"grant"},won("removed",true,"deleted")]});
  expect(seasonIncomeTotals(input)).toEqual({receivedNok:"4199.75",outstandingNok:"2401.00",totalNok:"6600.75"});
  expect(seasonIncomeTotals(view())).toEqual({receivedNok:"0.00",outstandingNok:"0.00",totalNok:"0.00"});
});
