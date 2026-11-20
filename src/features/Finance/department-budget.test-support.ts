import { createLocalDepartmentBudgetRepository } from "./department-budget-local";
export const selectLocalBudgetRole = (role: string) =>
  window.history.replaceState({}, "", `/?budgetRole=${role}`);
export async function sendLocalDepartmentCandidates(departmentId: string) {
  selectLocalBudgetRole("department_lead");
  const repository = createLocalDepartmentBudgetRepository(),
    preview = await repository.preview(departmentId);
  return repository.mutate({
    action: "sendDepartmentBudgetPackage",
    requestId: crypto.randomUUID(),
    departmentId,
    previewToken: preview.previewToken,
  });
}
/** Fixtures use the same real package lifecycle exposed by the local interface. */
export async function approveLocalDepartmentCandidates(departmentId: string) {
  const sent = await sendLocalDepartmentCandidates(departmentId);
  selectLocalBudgetRole("head_of_finance");
  return createLocalDepartmentBudgetRepository().mutate({
    action: "approveDepartmentBudgetPackage",
    packageId: sent.id!,
    expectedRevision: sent.revision!,
    requestId: crypto.randomUUID(),
  });
}
export async function approvePendingLocalDepartmentPackage(
  departmentId: string,
) {
  selectLocalBudgetRole("head_of_finance");
  const repository = createLocalDepartmentBudgetRepository(),
    packet = (await repository.queue(departmentId)).packages.find(
      (packet) => packet.status === "finance_pending",
    );
  if (!packet) throw new Error("No department package is awaiting approval.");
  return repository.mutate({
    action: "approveDepartmentBudgetPackage",
    packageId: packet.id,
    expectedRevision: packet.revision,
    requestId: crypto.randomUUID(),
  });
}
