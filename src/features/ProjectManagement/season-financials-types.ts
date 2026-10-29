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

export type SeasonFinancialSummary = {
  seasonCode: string | null;
  budgetStatus: "absent" | "draft-hidden" | "draft" | "approved";
  plannedNok: string | null;
  actualNok: string | null;
  departments: SeasonFinancialDepartment[];
  canOpenFinancials: boolean;
  viewVersion: number;
};
