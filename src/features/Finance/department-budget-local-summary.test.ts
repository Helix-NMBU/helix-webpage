// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { loadLocalDepartmentHomeBudget } from "./department-budget-local";
import { fundingFixture } from "./funding-application.test-support";
const gates = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
  localMemberAccount: { email: "alex@example.invalid" },
}));
const departmentId = "00000000-0000-4000-8000-000000000300";
beforeEach(() => {
  localStorage.clear();
  gates.local = true;
  gates.signedIn = true;
  window.history.replaceState({}, "", "/?budgetRole=project_lead");
});
it("returns only approved owner allocation and project subtotals to ordinary department members", async () => {
  const { budget } = await fundingFixture();
  window.history.replaceState({}, "", "/?budgetRole=project_lead");
  const state = JSON.parse(
    localStorage.getItem("helix-project-budgets-local-v1")!,
  );
  state.budgets[0].pendingVersion = {
    ...state.budgets[0].approvedVersion,
    id: "draft",
    status: "draft",
    totalNok: "99999.00",
    entries: [
      {
        ...state.budgets[0].approvedVersion.entries[0],
        description: "Private unsubmitted proposal",
        invoices: [{ documentId: "private-document" }],
      },
    ],
  };
  localStorage.setItem("helix-project-budgets-local-v1", JSON.stringify(state));
  const result = loadLocalDepartmentHomeBudget(departmentId);
  expect(result).toMatchObject({
    departmentId,
    approvedTotalNok: "1000.00",
    legacyTotalNok: "0.00",
    projects: [
      {
        projectId: budget.projectId,
        projectName: budget.projectName,
        approvedTotalNok: "1000.00",
      },
    ],
  });
  for (const secret of [
    "Private",
    "99999",
    "documentId",
    "invoices",
    "entries",
    "pipeline",
    "conditions",
    "approvedVersion",
  ])
    expect(JSON.stringify(result)).not.toContain(secret);
});
it("requires current department membership and both dedicated local gates, including after earlier successful reads", () => {
  expect(loadLocalDepartmentHomeBudget(departmentId).approvedTotalNok).toBe(
    "0.00",
  );
  expect(() =>
    loadLocalDepartmentHomeBudget("00000000-0000-4000-8000-000000000301"),
  ).toThrow("Department membership");
  gates.signedIn = false;
  expect(() => loadLocalDepartmentHomeBudget(departmentId)).toThrow("Sign in");
  gates.signedIn = true;
  gates.local = false;
  expect(() => loadLocalDepartmentHomeBudget(departmentId)).toThrow("Sign in");
});
