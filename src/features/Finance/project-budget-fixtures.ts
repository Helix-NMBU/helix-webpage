import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";
import type { ProjectBudgetScope, ProjectBudgetWorkspace } from "./project-budget-types";

export type ProjectBudgetDevelopmentRole = "project_lead" | "department_lead" | "finance" | "head_of_finance";

/** Explicit dedicated development-mode gate, never an alternative production authorization path. */
export function projectBudgetDevelopmentFixture(role: ProjectBudgetDevelopmentRole): ProjectBudgetWorkspace | null {
  if (!isLocalMemberMode() || !localMemberSignedIn()) return null;
  const lead = "11111111-1111-4111-8111-111111111111";
  const departmentLead = "22222222-2222-4222-8222-222222222222";
  const memberId = role === "project_lead" ? lead : role === "department_lead" ? departmentLead
    : role === "finance" ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444";
  const finance = role === "finance" || role === "head_of_finance";
  const head = role === "head_of_finance";
  const scope: ProjectBudgetScope = {
    memberId,
    projectId: "b1111111-1111-4111-8111-111111111111",
    seasonId: "a1111111-1111-4111-8111-111111111111",
    seasonCode: "S27",
    projectName: "Frame",
    projectLeadIds: [lead],
    responsibleDepartmentId: "c1111111-1111-4111-8111-111111111111",
    departments: [{ id: "c1111111-1111-4111-8111-111111111111", name: "Mechanical & Production", leadIds: [departmentLead] }],
    capabilities: {
      canRead: true, canDraft: role === "project_lead", canReviewDepartment: role === "department_lead",
      canApproveFinance: head, canRequestChanges: true, canRegisterPurchase: role === "department_lead" || finance,
      canReadFinance: finance, canRecordAward: head, canReleaseObligation: head,
    },
  };
  return { viewVersion: 0, scopes: [scope], budgets: [] };
}
