/** Project budget contracts. Authoritative money is integer ore in SQL and decimal NOK on the wire. */
export const PROJECT_BUDGET_STAGES = ["draft", "department_pending", "finance_pending", "approved"] as const;
export type ProjectBudgetStage = typeof PROJECT_BUDGET_STAGES[number];
export const PROJECT_BUDGET_STAGE_LABELS: Record<ProjectBudgetStage, string> = {
  draft: "Draft",
  department_pending: "Sent to approval (Department lead)",
  finance_pending: "Sent to approval (Finance)",
  approved: "Approved",
};
export type OrdinaryBudgetPriority = "P1" | "P2" | "P3" | "P4";
export type EffectiveBudgetPriority = OrdinaryBudgetPriority | "P0" | "EM";
export type ProjectBudgetEntryStatus = "planned" | "active" | "done" | "cancelled";
export type ProjectBudgetCompletion = "not_purchased" | "partial" | "complete";
export type InvoiceTransferStatus = "pending" | "transferring" | "stored" | "needs_attention";
export type InvoiceStorageBackend = "private_storage" | "google_drive";

export interface ProjectBudgetCapabilities {
  canRead: boolean;
  canDraft: boolean;
  canReviewDepartment: boolean;
  canApproveFinance: boolean;
  canRequestChanges: boolean;
  canRegisterPurchase: boolean;
  canReadFinance: boolean;
  canRecordAward: boolean;
  canReleaseObligation: boolean;
}
export interface ProjectBudgetScope {
  memberId: string;
  projectId: string;
  seasonId: string;
  seasonCode: string;
  projectName: string;
  projectLeadIds: string[];
  departments: { id: string; name: string; leadIds: string[] }[];
  responsibleDepartmentId: string | null;
  capabilities: ProjectBudgetCapabilities;
}
export interface ProjectBudgetEntryInput {
  entryId?: string;
  systemId: string;
  description: string;
  category: string;
  plannedNok: string;
  ordinaryPriority: OrdinaryBudgetPriority;
  reuseStatus: "new" | "reuse" | "inspect" | "consumable";
  expectedPurchaseDate?: string | null;
  ownerMemberId?: string | null;
  ownerEmail?: string | null;
  status: ProjectBudgetEntryStatus;
  note?: string | null;
  earmarkId?: string | null;
  removed?: boolean;
}
export interface ProjectBudgetEntry extends Omit<ProjectBudgetEntryInput, "entryId"> {
  entryId: string;
  budgetItemId: string | null;
  publicRef: string | null;
  priority: EffectiveBudgetPriority;
  actualNok: string;
  completion: ProjectBudgetCompletion;
  invoices?: ProjectBudgetInvoiceReference[];
}
export interface ProjectBudgetInvoiceReference {
  documentId: string;
  purchaseId: string;
  purchaseRef: string;
  originalName: string;
  backend: InvoiceStorageBackend;
  transferStatus: InvoiceTransferStatus;
  viewerUrl: string | null;
}
export interface ProjectBudgetVersion {
  id: string;
  versionNumber: number;
  revision: number;
  status: ProjectBudgetStage;
  submittedAt: string | null;
  departmentApprovedBy: string | null;
  departmentApprovedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  entries: ProjectBudgetEntry[];
  totalNok: string;
}
export interface ProjectBudgetSummary {
  id: string;
  projectId: string;
  projectName: string;
  seasonId: string;
  seasonCode: string;
  responsibleDepartmentId: string;
  responsibleDepartmentName: string;
  revision: number;
  approvedVersionId: string | null;
  pendingVersionId: string | null;
  pendingStage: ProjectBudgetStage | null;
  approvedTotalNok: string;
  pendingTotalNok: string | null;
  capabilities: ProjectBudgetCapabilities;
}
export interface ProjectBudgetDetail extends ProjectBudgetSummary {
  approvedVersion: ProjectBudgetVersion | null;
  pendingVersion: ProjectBudgetVersion | null;
  decisions: ProjectBudgetDecision[];
}
export interface ProjectBudgetDecision {
  id: string;
  versionId: string;
  action: string;
  actorMemberId: string;
  reason: string | null;
  createdAt: string;
  /** Immutable contents at the time of this decision. */
  snapshot: unknown;
}
export interface ProjectBudgetSystemChoice { id: string; code: string; name: string; departmentName: string }
export interface ProjectBudgetWorkspace {
  viewVersion: number;
  scopes: ProjectBudgetScope[];
  budgets: ProjectBudgetSummary[];
  systems?: ProjectBudgetSystemChoice[];
}

interface ProjectBudgetWrite {
  requestId: string;
  projectBudgetId: string;
  /** Header revision, not the global freshness version. */
  expectedRevision: number;
}
export type ProjectBudgetMutation =
  | { action: "createProjectBudget"; requestId: string; projectId: string; responsibleDepartmentId: string }
  | (ProjectBudgetWrite & { action: "saveProjectBudgetEntry"; entry: ProjectBudgetEntryInput })
  | (ProjectBudgetWrite & { action: "removeProjectBudgetEntry"; entryId: string })
  | (ProjectBudgetWrite & { action: "submitProjectBudget" | "approveDepartmentBudget" | "approveProjectBudget" })
  | (ProjectBudgetWrite & { action: "returnProjectBudget" | "withdrawProjectBudget" | "requestProjectBudgetChanges"; reason: string })
  | (ProjectBudgetWrite & { action: "setProjectBudgetCompletion"; entryId: string; complete: boolean; reason?: string });
export interface ProjectBudgetMutationResult {
  ok: true;
  id: string;
  revision: number;
  viewVersion: number;
  replayed?: boolean;
  warnings: { message: string }[];
  errors: { field: string; message: string }[];
}
export interface ProjectBudgetMappingRow {
  budgetItemId: string;
  projectId: string;
  responsibleDepartmentId: string;
  /** Required when adopting a legacy EM entry; never infer a P0 obligation. */
  ordinaryPriority?: OrdinaryBudgetPriority;
}
export interface ProjectBudgetMappingReport {
  valid: boolean;
  seasonCode: string;
  rows: (ProjectBudgetMappingRow & { plannedNok: string; actualNok: string; publicRef: string })[];
  conflicts: { row: number; code: string; message: string }[];
  unmapped: { budgetItemId: string; publicRef: string; plannedNok: string; actualNok: string }[];
  sourceTotalNok: string;
  mappedTotalNok: string;
  unmappedTotalNok: string;
}
