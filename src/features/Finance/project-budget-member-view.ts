import type { ProjectBudgetCapabilities, ProjectBudgetDetail, ProjectBudgetSummary } from "./project-budget-types";

export const APPROVED_MEMBER_BUDGET_CAPABILITIES: ProjectBudgetCapabilities = Object.freeze({
  approvedOnly: true, canRead: true, canDraft: false, canReviewDepartment: false,
  canApproveFinance: false, canRequestChanges: false, canRegisterPurchase: false,
  canReadFinance: false, canRecordAward: false, canReleaseObligation: false,
});

/** A public allocation projection, never a substitute for current membership checks. */
export function memberApprovedBudgetSummary(source: ProjectBudgetSummary): ProjectBudgetSummary {
  return {
    id: source.id, projectId: source.projectId, projectName: source.projectName,
    seasonId: source.seasonId, seasonCode: source.seasonCode,
    responsibleDepartmentId: source.responsibleDepartmentId,
    responsibleDepartmentName: source.responsibleDepartmentName,
    revision: source.revision, approvedVersionId: source.approvedVersionId,
    approvedTotalNok: source.approvedTotalNok,
    actualNok: source.actualNok, unbudgetedNok: source.unbudgetedNok,
    pendingVersionId: null, pendingStage: null, pendingTotalNok: null,
    capabilities: APPROVED_MEMBER_BUDGET_CAPABILITIES,
  };
}

/** Keep drafts, reviewer history, private evidence and funding/owner details off the member wire. */
export function memberApprovedBudgetDetail(source: ProjectBudgetDetail): ProjectBudgetDetail {
  const approved = source.approvedVersion;
  return {
    ...memberApprovedBudgetSummary({ ...source, revision: approved?.revision ?? 0 }),
    approvedVersion: approved ? {
      id: approved.id, versionNumber: approved.versionNumber, revision: approved.revision,
      status: "approved", submittedAt: null, departmentApprovedBy: null,
      departmentApprovedAt: null, approvedBy: null, approvedAt: approved.approvedAt,
      totalNok: approved.totalNok,
      entries: approved.entries.filter(entry => !entry.removed && entry.status !== "cancelled").map(entry => ({
        entryId: entry.entryId, budgetItemId: entry.budgetItemId, publicRef: entry.publicRef,
        systemId: entry.systemId, description: entry.description, category: entry.category,
        plannedNok: entry.plannedNok, ordinaryPriority: entry.ordinaryPriority,
        priority: entry.priority, reuseStatus: entry.reuseStatus, status: entry.status,
        actualNok: entry.actualNok, completion: entry.completion, removed: false,
        expectedPurchaseDate: null, ownerMemberId: null, ownerEmail: null,
        note: null, earmarkId: null, invoices: [],
      })),
    } : null,
    pendingVersion: null, historyVersions: [], decisions: [],
  };
}
