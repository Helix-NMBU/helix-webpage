import type { ProjectBudgetCapabilities } from "./project-budget-types.js";
/** Draft contents belong to current authors and the responsible department reviewers. */
export function canReadProjectBudgetDraft(capabilities: Pick<ProjectBudgetCapabilities, "canDraft" | "canReviewDepartment">): boolean {
  return capabilities.canDraft || capabilities.canReviewDepartment;
}
