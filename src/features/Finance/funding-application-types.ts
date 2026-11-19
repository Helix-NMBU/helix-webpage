import type { ProjectBudgetEntryInput, ProjectBudgetSystemChoice, OrdinaryBudgetPriority } from "./project-budget-types.js";

export interface FundingApplicationCard {
  id: string;
  dealId: string;
  title: string;
  seasonId: string;
  seasonCode: string;
  purchaseConditions: string;
  fundingId: string | null;
  revision: number;
  award: { actorMemberId: string; recordedAt: string; date: string; reference: string } | null;
}
export interface FundingApplicationLink {
  id: string;
  entryId: string;
  projectBudgetId: string;
  projectName: string;
  description: string;
  approvedNok: string;
  ordinaryPriority: OrdinaryBudgetPriority | null;
  /** Obligation state, independent of whether the proposed money has budget approval. */
  mandatory: boolean;
  createdByMemberId: string;
  createdAt: string;
  release: { actorMemberId: string; recordedAt: string; reason: string } | null;
}
export interface FundingBudgetProposal {
  id: string;
  applicationId: string;
  applicationTitle: string;
  applicationRevision: number;
  projectBudgetId: string;
  entryId: string;
  desiredEntry: ProjectBudgetEntryInput;
  note: string;
  approvalStatus: "needs_project_lead" | "awaiting_budget_approval" | "approved";
  adoptedVersionId: string | null;
  mandatory: boolean;
  createdByMemberId: string;
  createdAt: string;
}
export interface FundingApplicationDetail extends FundingApplicationCard {
  links: FundingApplicationLink[];
  proposals: FundingBudgetProposal[];
}
export interface FundingApplicationQueue { viewVersion: number; applications: FundingApplicationCard[] }
export interface FundingApplicationBudgetContext {
  viewVersion: number;
  applicationId: string;
  budgets: { id: string; projectId: string; projectName: string; responsibleDepartmentName: string; revision: number; approvedVersionId: string | null }[];
  entries: { entryId: string; projectBudgetId: string; projectName: string; description: string; plannedNok: string; ordinaryPriority: OrdinaryBudgetPriority; effectivePriority: string; approved: boolean }[];
  systems: ProjectBudgetSystemChoice[];
}
interface ApplicationWrite { requestId: string; applicationId: string; expectedRevision: number }
export type FundingApplicationMutation =
  | { action: "saveFundingApplication"; requestId: string; dealId: string; dealExpectedRevision: number; expectedRevision: number; seasonId: string; purchaseConditions: string; fundingId?: string | null }
  | (ApplicationWrite & { action: "linkFundingApplicationEntry"; entryId: string; expectedBudgetRevision: number })
  | (ApplicationWrite & { action: "proposeFundingBudgetEntry"; projectBudgetId: string; expectedBudgetRevision: number; entry: ProjectBudgetEntryInput; note?: string })
  | (ApplicationWrite & { action: "recordFundingAward"; awardDate: string; awardReference: string })
  | (ApplicationWrite & { action: "releaseFundingObligation"; obligationId: string; reason: string })
  | (ApplicationWrite & { action: "adoptFundingProposal"; proposalId: string; projectBudgetId: string; expectedBudgetRevision: number });
export interface FundingApplicationMutationResult { ok: true; id: string; revision: number; viewVersion: number; replayed?: boolean; projectBudgetId?: string; budgetRevision?: number }
export interface ProjectFundingProposals { viewVersion: number; projectBudgetId: string; budgetRevision: number; proposals: FundingBudgetProposal[] }
