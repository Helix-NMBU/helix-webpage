import { createLocalProjectBudgetRepository } from "./project-budget-local";
import {
  createLocalFundingApplicationRepository,
  ensureLocalFundingFixtures,
} from "./funding-application-local";
import {
  readLocalPartnerState,
  writeLocalPartnerState,
} from "../PartnerDeals/local-fixture";
export const fundingRole = (role: string) =>
  window.history.replaceState(
    {},
    "",
    role === "marketing" ? "/?fundingRole=marketing" : `/?budgetRole=${role}`,
  );
export async function fundingFixture() {
  fundingRole("project_lead");
  const budgets = createLocalProjectBudgetRepository(),
    created = await budgets.mutate({
      action: "createProjectBudget",
      projectId: "00000000-0000-4000-8000-000000000100",
      responsibleDepartmentId: "00000000-0000-4000-8000-000000000300",
      requestId: crypto.randomUUID(),
    });
  const systems = (await budgets.load()).systems!,
    system = systems.find(
      (item) => item.departmentName === "Mechanical & Production",
    )!;
  let result = await budgets.mutate({
    action: "saveProjectBudgetEntry",
    projectBudgetId: created.id,
    expectedRevision: created.revision,
    requestId: crypto.randomUUID(),
    entry: {
      systemId: system.id,
      description: "Frame tubes",
      plannedNok: "1000.00",
      category: "material",
      ordinaryPriority: "P2",
      reuseStatus: "reuse",
      status: "planned",
      note: "Keep supplier reference",
    },
  });
  result = await budgets.mutate({
    action: "submitProjectBudget",
    projectBudgetId: created.id,
    expectedRevision: result.revision,
    requestId: crypto.randomUUID(),
  });
  fundingRole("department_lead");
  result = await budgets.mutate({
    action: "approveDepartmentBudget",
    projectBudgetId: created.id,
    expectedRevision: result.revision,
    requestId: crypto.randomUUID(),
  });
  fundingRole("head_of_finance");
  await budgets.mutate({
    action: "approveProjectBudget",
    projectBudgetId: created.id,
    expectedRevision: result.revision,
    requestId: crypto.randomUUID(),
  });
  fundingRole("marketing");
  ensureLocalFundingFixtures();
  const state = readLocalPartnerState();
  const deal = state.deals[0];
  state.deals.push({
    ...deal,
    id: crypto.randomUUID(),
    title: "Unrelated negotiation",
  });
  writeLocalPartnerState(state);
  const repository = createLocalFundingApplicationRepository();
  const saved = await repository.mutate({
    action: "saveFundingApplication",
    requestId: crypto.randomUUID(),
    dealId: deal.id,
    dealExpectedRevision: deal.revision,
    expectedRevision: 0,
    seasonId: "s27",
    purchaseConditions: "Purchase the awarded workshop equipment.",
  });
  fundingRole("head_of_finance");
  const app = await repository.detail(saved.id),
    budget = await budgets.detail(created.id);
  return { repository, budgets, app, budget, deal, system };
}
