import type { ProjectBudgetEntry, ProjectBudgetVersion } from "./project-budget-types.js";
export type DepartmentBudgetReadiness = "no_budget" | "unallocated" | "other_department" | "draft" | "department_pending" | "finance_pending" | "approved";
export const DEPARTMENT_BUDGET_READINESS_LABELS: Record<DepartmentBudgetReadiness,string> = {
  no_budget:"No budget",unallocated:"Budget department not selected",other_department:"Owned by another department",draft:"Draft",
  department_pending:"Ready for department submission",finance_pending:"Sent to approval (Finance)",approved:"Approved",
};
/** Immutable plan only. Actuals, completion and invoice references are read separately. */
export type DepartmentBudgetPlanEntry = Omit<ProjectBudgetEntry,"actualNok"|"completion"|"invoices"> & {systemName?:string;systemCode?:string};
export type DepartmentBudgetPlanVersion = Omit<ProjectBudgetVersion,"entries"> & { entries:DepartmentBudgetPlanEntry[] };
export interface DepartmentBudgetProject {
  projectId:string; projectName:string; projectLeadIds:string[];
  projectBudgetId:string|null; responsibleDepartmentId:string|null; responsibleDepartmentName:string|null;
  readiness:DepartmentBudgetReadiness; included:boolean;
  approvedVersion:DepartmentBudgetPlanVersion|null; proposedVersion:DepartmentBudgetPlanVersion|null;
  approvedTotalNok:string; proposedTotalNok:string; deltaNok:string;
}
export interface DepartmentBudgetLegacyEntry { entryId:string; publicRef:string; description:string; systemId:string; systemName:string; plannedNok:string; proposedNok:string; replacementProjectId:string|null }
export interface DepartmentBudgetSnapshot {
  departmentId:string; departmentName:string; departmentKey:string; seasonId:string; seasonCode:string;
  projects:DepartmentBudgetProject[]; legacyEntries:DepartmentBudgetLegacyEntry[];
  approvedTotalNok:string; proposedTotalNok:string; deltaNok:string; legacyTotalNok:string; proposedLegacyTotalNok:string;
}
export interface DepartmentBudgetCapabilities { canSubmit:boolean; canApproveFinance:boolean; canReturn:boolean; canWithdraw:boolean }
export interface DepartmentBudgetPreview extends DepartmentBudgetSnapshot {
  viewVersion:number; previewToken:string; activePackageId:string|null; capabilities:DepartmentBudgetCapabilities;
}
export type DepartmentBudgetPackageStatus = "finance_pending"|"approved"|"returned"|"withdrawn";
export interface DepartmentBudgetPackage {
  id:string; revision:number; status:DepartmentBudgetPackageStatus;
  submittedBy:string; submittedAt:string; decidedBy:string|null; decidedAt:string|null; reason:string|null;
  snapshot:DepartmentBudgetSnapshot;
}
export interface DepartmentBudgetPackageDecision { id:string; action:string; actorMemberId:string; createdAt:string; reason:string|null }
export interface DepartmentBudgetPackageDetail extends DepartmentBudgetPackage {
  viewVersion:number; capabilities:DepartmentBudgetCapabilities; decisions:DepartmentBudgetPackageDecision[];
  /** Live authorized evidence, keyed by stable entryId; never part of plan pins. */
  evidence:ProjectBudgetEntry[];
}
export interface DepartmentBudgetPackageQueue {
  viewVersion:number; packages:DepartmentBudgetPackage[];
  departments:{id:string;name:string;seasonId:string;seasonCode:string;canSubmit:boolean}[];
}
/** Ordinary current department members receive only this approved aggregate. */
export interface DepartmentHomeBudget {
  viewVersion:number; seasonId:string|null; seasonCode:string; departmentId:string; departmentName:string;
  approvedTotalNok:string; legacyTotalNok:string;
  projects:{projectId:string;projectName:string;approvedTotalNok:string}[];
}
export type DepartmentBudgetPackageMutation =
  | {action:"sendDepartmentBudgetPackage";requestId:string;departmentId:string;previewToken:string}
  | {action:"approveDepartmentBudgetPackage";requestId:string;packageId:string;expectedRevision:number}
  | {action:"returnDepartmentBudgetPackage"|"withdrawDepartmentBudgetPackage";requestId:string;packageId:string;expectedRevision:number;reason:string};
export const DEPARTMENT_BUDGET_READ_ACTIONS = ["departmentBudgetPreview","departmentBudgetPackages","departmentBudgetPackage","departmentHomeBudget"] as const;
export const DEPARTMENT_BUDGET_MUTATION_ACTIONS = ["sendDepartmentBudgetPackage","approveDepartmentBudgetPackage","returnDepartmentBudgetPackage","withdrawDepartmentBudgetPackage"] as const;
