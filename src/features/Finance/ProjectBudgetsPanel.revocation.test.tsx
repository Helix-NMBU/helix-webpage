import { approveLocalDepartmentCandidates } from "./department-budget.test-support";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectBudgetsPanel } from "./ProjectBudgetsPanel";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
vi.mock("../MemberPlatform/local-mode", () => ({ isLocalMemberMode: () => true, localMemberSignedIn: () => true }));
vi.mock("./ProjectBudgetPurchases", () => ({ ProjectBudgetPurchases: ({ budget, onAccessLost }: { budget?: unknown; onAccessLost?: () => void }) =>
  <button onClick={onAccessLost}>Revoke {budget ? "header" : "unbudgeted"} purchase access</button> }));
let root: Root, container: HTMLDivElement;
const role = (value: string) => window.history.replaceState({}, "", `/?budgetRole=${value}`);
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); localStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it.each(["header", "unbudgeted"])("clears enclosing private budget data after %s purchase authority is lost", async kind => {
  role("project_lead");
  const repository = createLocalProjectBudgetRepository();
  let result = await repository.mutate({ action: "createProjectBudget", requestId: crypto.randomUUID(), projectId: "00000000-0000-4000-8000-000000000100", responsibleDepartmentId: "00000000-0000-4000-8000-000000000300" });
  const system = (await repository.load()).systems!.find(item => item.departmentName === "Mechanical & Production")!;
  result = await repository.mutate({ action: "saveProjectBudgetEntry", requestId: crypto.randomUUID(), projectBudgetId: result.id, expectedRevision: result.revision,
    entry: { systemId: system.id, description: "Private material description", category: "material", plannedNok: "20", ordinaryPriority: "P2", reuseStatus: "new", status: "planned" } });
  await repository.mutate({action:"submitProjectBudget",projectBudgetId:result.id,expectedRevision:result.revision,requestId:crypto.randomUUID()});await approveLocalDepartmentCandidates("00000000-0000-4000-8000-000000000300");
  role("finance");
  await act(async () => root.render(<ProjectBudgetsPanel repository={repository} />));
  expect(container.textContent).toContain("Private material description");
  const denied = [...container.querySelectorAll("button")].find(button => button.textContent === `Revoke ${kind} purchase access`);
  expect(denied).toBeTruthy();
  await act(async () => denied!.click());
  expect(container.textContent).toContain("Budget access required");
  expect(container.textContent).not.toContain("Private material description");
  expect(container.textContent).not.toContain("Chassis & assembly");
  const refresh = [...container.querySelectorAll("button")].find(button => button.textContent === "Refresh budgets");
  expect(document.activeElement).toBe(refresh);
});
