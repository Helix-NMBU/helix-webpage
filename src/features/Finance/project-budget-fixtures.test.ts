import { beforeEach, describe, expect, it, vi } from "vitest";
const gate = vi.hoisted(() => ({ development: false, signedIn: false }));
vi.mock("../MemberPlatform/local-mode", () => ({ isLocalMemberMode: () => gate.development, localMemberSignedIn: () => gate.signedIn }));
import { projectBudgetDevelopmentFixture } from "./project-budget-fixtures";

beforeEach(() => { gate.development = false; gate.signedIn = false; });
describe("project budget fixtures", () => {
  it("returns no test account or budget data outside signed-in dedicated local mode", () => {
    expect(projectBudgetDevelopmentFixture("head_of_finance")).toBeNull();
    gate.signedIn = true;
    expect(projectBudgetDevelopmentFixture("head_of_finance")).toBeNull();
    gate.development = true; gate.signedIn = false;
    expect(projectBudgetDevelopmentFixture("head_of_finance")).toBeNull();
  });
  it("keeps project author, department reviewer and Finance decision profiles distinct", () => {
    gate.development = true; gate.signedIn = true;
    expect(projectBudgetDevelopmentFixture("project_lead")?.scopes[0].capabilities).toMatchObject({ canDraft: true, canReviewDepartment: false, canReadFinance: false });
    expect(projectBudgetDevelopmentFixture("department_lead")?.scopes[0].capabilities).toMatchObject({ canDraft: false, canReviewDepartment: true, canApproveFinance: false });
    expect(projectBudgetDevelopmentFixture("finance")?.scopes[0].capabilities).toMatchObject({ canReadFinance: true, canApproveFinance: false });
    expect(projectBudgetDevelopmentFixture("head_of_finance")?.scopes[0].capabilities).toMatchObject({ canReadFinance: true, canApproveFinance: true });
  });
});
