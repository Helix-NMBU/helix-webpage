export type DealBudgetEntry = {
  entryId: string;
  projectBudgetId: string;
  budgetRevision: number;
  projectName: string;
  departmentName: string;
  description: string;
  plannedNok: string;
  ordinaryPriority: string;
  priority: string;
  approved: boolean;
  selected: boolean;
  unavailable?: boolean;
};
export type DealBudgetLinks = {
  dealId: string;
  dealRevision: number;
  applicationRevision: number;
  seasonCode: string | null;
  locked: boolean;
  entries: DealBudgetEntry[];
};
export type SaveDealBudgetLinks = {
  action: "saveDealBudgetLinks";
  requestId: string;
  dealId: string;
  dealExpectedRevision: number;
  applicationExpectedRevision: number;
  entries: { entryId: string; budgetRevision: number }[];
};
export interface DealBudgetLinksRepository {
  load(dealId: string): Promise<DealBudgetLinks>;
  save(input: SaveDealBudgetLinks): Promise<void>;
  watchSession?(onEnd: () => void): () => void;
}
