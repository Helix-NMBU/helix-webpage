import type { FundingRecord, PublicBudgetItem, PublicBudgets } from "./types";
export const item = (priority: PublicBudgetItem["priority"], amount: string, approved = true): PublicBudgetItem => ({
  id: `entry-${priority}`, publicRef: priority, systemId: "system", systemCode: "SYS", description: priority,
  category: "material", plannedNok: amount, effectivePlanNok: amount, actualNok: "0.00", differenceNok: amount,
  priority, approved, status: "planned", reuseStatus: "new", expectedPurchaseDate: null, revision: 1,
  earmarked: false, earmarkPurpose: null, earmarkAmountNok: null,
});
export const dashboardBudgetFixture = (items = [item("P0", "100.00"), item("P1", "200.25"), item("P2", "300.00"), item("P3", "400.00"), item("P4", "500.50")]): PublicBudgets => ({
  viewVersion: 1, seasonCode: "S27", budgetStatus: "draft", approvedOn: null, revision: 1, choices: { items: [], systems: [] },
  departments: [{ departmentKey: "mechanical", name: "Mechanical & Production", plannedNok: "1500.75", actualNok: "80.00", differenceNok: "1420.75", unbudgetedNok: "0.00", systems: [{ id: "system", code: "SYS", name: "Frame", active: true, plannedNok: "1500.75", actualNok: "80.00", differenceNok: "1420.75", unbudgetedNok: "0.00", unbudgetedItemId: null, unbudgetedPublicRef: null, items }] }],
});
export const funding = (id: string, amount: string, date: string | null, status: FundingRecord["status"] = "received"): FundingRecord => ({ id, publicRef: id, sourceName: id, ownerName: "Finance", fundingType: "grant", amountNok: amount, status, confidence: null, expectedDate: null, receivedDate: date, ownerEmail: null, reportingRequired: false, agreementLink: null, note: null, revision: 1, earmarkedNok: "0.00", unrestrictedNok: amount, linkedItemCount: 0 });

