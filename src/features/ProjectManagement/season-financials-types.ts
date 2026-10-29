export type SeasonFinancialSystem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  plannedNok: string;
  actualNok: string;
  unbudgetedNok: string;
};

export type SeasonFinancialDepartment = {
  departmentKey: string;
  name: string;
  plannedNok: string;
  actualNok: string;
  unbudgetedNok: string;
  systems: SeasonFinancialSystem[];
};

export type SeasonBankSnapshot = { amountNok: string; asOfDate: string; updatedAt: string };

export type SeasonBankView =
  | { status: "available"; snapshot: SeasonBankSnapshot | null }
  | { status: "unavailable" };

export type SeasonMoneyFlow =
  | { status: "available"; moneyInNok: string; moneyOutNok: string }
  | { status: "no-season" | "unavailable" };

export type SeasonFinancialSummary = {
  moneyFlow: SeasonMoneyFlow;
  bank: SeasonBankView;
  seasonCode: string | null;
  budgetStatus: "absent" | "draft-hidden" | "draft" | "approved";
  plannedNok: string | null;
  actualNok: string | null;
  departments: SeasonFinancialDepartment[];
  canOpenFinancials: boolean;
  viewVersion: number;
};
