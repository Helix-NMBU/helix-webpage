import type {
  ProjectBudgetStage,
  ProjectBudgetSummary,
} from "./project-budget-types";
export type ProjectBudgetStageFilter = "all" | "submitted" | ProjectBudgetStage;
export interface ProjectBudgetViewFilters {
  projectId: string;
  departmentId: string;
  stage: ProjectBudgetStageFilter;
}
/** An approved header remains approved while a separate candidate moves through review. */
export function matchesProjectBudget(
  budget: ProjectBudgetSummary,
  filters: ProjectBudgetViewFilters,
): boolean {
  if (filters.projectId !== "all" && budget.projectId !== filters.projectId)
    return false;
  if (
    filters.departmentId !== "all" &&
    budget.responsibleDepartmentId !== filters.departmentId
  )
    return false;
  if (filters.stage === "all") return true;
  if (filters.stage === "approved") return budget.approvedVersionId !== null;
  if (filters.stage === "submitted")
    return (
      budget.pendingStage === "department_pending" ||
      budget.pendingStage === "finance_pending"
    );
  return budget.pendingStage === filters.stage;
}
export function projectBudgetFilterChoices(
  budgets: readonly ProjectBudgetSummary[],
) {
  const projects = new Map<string, string>(),
    departments = new Map<string, string>();
  for (const budget of budgets) {
    projects.set(budget.projectId, budget.projectName);
    departments.set(
      budget.responsibleDepartmentId,
      budget.responsibleDepartmentName,
    );
  }
  const choices = (values: Map<string, string>) =>
    [...values]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return { projects: choices(projects), departments: choices(departments) };
}
