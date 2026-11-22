import { randomUUID } from "node:crypto";
import type { FinanceServices } from "../../../api/_lib/finance-service.js";
import type { ProjectBudgetDetail } from "../../../src/features/Finance/project-budget-types.js";

/** Capture the immutable package revision before starting an independently gated race. */
export async function departmentPackageDecisionBody(services: FinanceServices, budget: ProjectBudgetDetail) {
  const queue = await services.departmentBudgetPackages("head", budget.responsibleDepartmentId);
  const packet = queue.packages.find(packet => packet.status === "finance_pending"
    && packet.snapshot.projects.some(project => project.projectBudgetId === budget.id && project.included));
  if (!packet) throw new Error("Submit the project's department package before preparing its decision.");
  return { action: "approveDepartmentBudgetPackage", requestId: randomUUID(), packageId: packet.id, expectedRevision: packet.revision };
}
