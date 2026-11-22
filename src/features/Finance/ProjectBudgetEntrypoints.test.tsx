// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import { directoryFixture } from "../Workspace/fixtures.test-support";
import { FinanceEntry } from "./FinancePages";
import { ProjectDetail } from "../Workspace/ProjectDetail";
import { DepartmentWorkspace } from "../Workspace/DepartmentWorkspace";
const notify = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  access: "allowed",
  viewVersion: null,
  capabilities: null,
  budgets: null,
  overview: null,
  purchases: null,
  financing: null,
  pageLoading: true,
  loadPage: vi.fn(),
}));
const access = vi.hoisted(() => ({ allowed: true, pages: [] as string[] }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
}));
vi.mock("./project-budget-repository", async (original) => ({
  ...(await original<typeof import("./project-budget-repository")>()),
  createProjectBudgetRepository: () => createLocalProjectBudgetRepository(),
}));
vi.mock("../MemberPlatform/FinanceAccess", () => ({
  useFinanceAccess: () => session,
  useOptionalFinanceAccess:()=>session,
  FinanceGate: ({ children, page }: { children: ReactNode; page: string }) => {
    access.pages.push(page);
    return access.allowed ? children : <p>Finance access required</p>;
  },
}));
vi.mock("../Workspace/department-home-repository", () => ({
  departmentHomeRepository: async () => ({
    load: async (departmentId: string) => ({
      departmentId,
      revision: 1,
      description: "",
      driveFolderUrl: null,
      canEdit: false,
    }),
  }),
}));
let root: Root, container: HTMLDivElement;
const projectId = "00000000-0000-4000-8000-000000000100",
  departmentId = "00000000-0000-4000-8000-000000000300";
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  window.history.replaceState({}, "", "/?budgetRole=project_lead");
  access.allowed = true;
  access.pages = [];
  const repo = createLocalProjectBudgetRepository();
  const budget = await repo.mutate({
    action: "createProjectBudget",
    projectId,
    responsibleDepartmentId: departmentId,
    requestId: crypto.randomUUID(),
  });
  const workspace = await repo.load();
  const saved = await repo.mutate({
    action: "saveProjectBudgetEntry",
    projectBudgetId: budget.id,
    expectedRevision: budget.revision,
    requestId: crypto.randomUUID(),
    entry: {
      systemId: workspace.systems!.find(
        (system) => system.departmentName === "Mechanical & Production",
      )!.id,
      description: "Frame tubes",
      category: "material",
      plannedNok: "12000.25",
      ordinaryPriority: "P1",
      reuseStatus: "new",
      status: "planned",
    },
  });
  await repo.mutate({
    action: "submitProjectBudget",
    projectBudgetId: budget.id,
    expectedRevision: saved.revision,
    requestId: crypto.randomUUID(),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("project budget entry points", () => {
  it("shows the dashboard loading state without private queues and retains its Finance gate", async () => {
    window.history.replaceState({}, "", "/?budgetRole=finance");
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/finance/budgets"]}>
          <FinanceEntry page="budgets" />
        </MemoryRouter>,
      ),
    );
    expect(container.querySelector('[aria-label="Loading budget dashboard"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Project budgets"]')).toBeNull();
    expect(container.textContent).not.toContain("Review department submission");
    expect(access.pages).toContain("budgets");
    access.allowed = false;
    await act(async () =>
      root.render(
        <MemoryRouter>
          <FinanceEntry page="budgets" />
        </MemoryRouter>,
      ),
    );
    expect(container.textContent).toBe("Finance access required");
  });
  it("shows the project Budget tab when task-space access is unavailable", async () => {
    const data = {
      ...directoryFixture(),
      projectAccess: false,
      canManageProjects: false,
    };
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}?tab=budget`]}>
          <ProjectDetail project={data.projects[0]} directory={data} />
        </MemoryRouter>,
      ),
    );
    expect(
      container.querySelector('[aria-label="Budget"]')?.textContent,
    ).toContain("Frame tubes");
    expect(
      container.querySelector('[role="tab"][data-state="active"]')?.textContent,
    ).toBe("Budget");
  });
  it("exposes responsible-department approval through the department Budgets tab", async () => {
    window.history.replaceState({}, "", "/?budgetRole=department_lead");
    const data = directoryFixture(),
      department = data.departments.find((item) => item.id === departmentId)!;
    await act(async () =>
      root.render(
        <MemoryRouter
          initialEntries={[
            "/departments/mechanical-and-production?tab=budgets",
          ]}
        >
          <DepartmentWorkspace data={data} department={department} />
        </MemoryRouter>,
      ),
    );
    expect(
      container.querySelector('[aria-label="Project budgets"]')?.textContent,
    ).toContain("Frame tubes");
    expect(container.textContent).toContain("Review department submission");
  });
});
