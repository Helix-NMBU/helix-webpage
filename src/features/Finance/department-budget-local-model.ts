import { stableJson } from "./funding";
import type {
  DepartmentBudgetPackage,
  DepartmentBudgetPackageDecision,
  DepartmentBudgetPlanVersion,
  DepartmentBudgetPreview,
} from "./department-budget-types";
import type {
  ProjectBudgetDetail,
  ProjectBudgetVersion,
} from "./project-budget-types";
import type { FinanceMutationResult } from "./types";
export interface LocalDepartmentPackage extends DepartmentBudgetPackage {
  decisions: DepartmentBudgetPackageDecision[];
}
export interface LocalDepartmentBudgetState {
  version: number;
  budgets: ProjectBudgetDetail[];
  packages?: LocalDepartmentPackage[];
  packagePreviews?: Record<
    string,
    { fingerprint: string; preview: DepartmentBudgetPreview }
  >;
  packageRequests?: Record<
    string,
    { fingerprint: string; result: FinanceMutationResult }
  >;
}
/** Strip all live facts before persisting a department plan. */
export function departmentPlanVersion(
  version: ProjectBudgetVersion | null,
): DepartmentBudgetPlanVersion | null {
  if (!version) return null;
  return {
    ...version,
    entries: version.entries.map((entry) => {
      const {
        actualNok: _actual,
        completion: _completion,
        invoices: _invoices,
        ...plan
      } = entry;
      return plan;
    }),
  };
}
/** Header/candidate counters and derived P0 are not the submitted plan identity. */
export function localDepartmentPlanPin(
  version: DepartmentBudgetPlanVersion | null,
): string {
  return stableJson(
    version
      ? {
          id: version.id,
          entries: version.entries
            .map((entry) => {
              const {
                priority: _priority,
                systemName: _name,
                systemCode: _code,
                ...plan
              } = entry;
              return plan;
            })
            .sort((a, b) => a.entryId.localeCompare(b.entryId)),
          totalNok: version.totalNok,
        }
      : null,
  );
}
export function resetLocalCandidate(budget: ProjectBudgetDetail) {
  const candidate = budget.pendingVersion;
  if (!candidate) return;
  candidate.status = "draft";
  candidate.submittedAt = null;
  candidate.departmentApprovedBy = null;
  candidate.departmentApprovedAt = null;
  candidate.approvedBy = null;
  candidate.approvedAt = null;
  candidate.revision++;
  budget.pendingStage = "draft";
  budget.revision++;
}
/** Caller has authorized the initiating project action; all package members reset in the same state write. */
export function invalidateLocalDepartmentPackage(
  state: LocalDepartmentBudgetState,
  budgetId: string,
  actor: string,
  reason: string,
  withdrawn = false,
) {
  const packet = state.packages?.find(
    (packet) =>
      packet.status === "finance_pending" &&
      packet.snapshot.projects.some(
        (project) => project.included && project.projectBudgetId === budgetId,
      ),
  );
  if (!packet) return;
  const now = new Date().toISOString();
  packet.status = withdrawn ? "withdrawn" : "returned";
  packet.revision++;
  packet.decidedBy = actor;
  packet.decidedAt = now;
  packet.reason = reason;
  packet.decisions.push({
    id: crypto.randomUUID(),
    action: withdrawn
      ? "withdrawDepartmentBudgetPackage"
      : "returnDepartmentBudgetPackage",
    actorMemberId: actor,
    createdAt: now,
    reason,
  });
  for (const project of packet.snapshot.projects.filter(
    (project) => project.included,
  )) {
    const budget = state.budgets.find(
      (budget) => budget.id === project.projectBudgetId,
    );
    if (!budget) continue;
    resetLocalCandidate(budget);
    budget.decisions.push({
      id: crypto.randomUUID(),
      versionId: budget.pendingVersion!.id,
      action: withdrawn
        ? "withdrawDepartmentBudgetPackage"
        : "returnDepartmentBudgetPackage",
      actorMemberId: actor,
      createdAt: now,
      reason,
      snapshot: structuredClone(budget.pendingVersion!.entries),
    });
  }
}
