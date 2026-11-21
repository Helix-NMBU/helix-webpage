// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MemberNotificationsProvider } from "../MemberPlatform/MemberNotifications";
import { DepartmentWorkspace } from "./DepartmentWorkspace";
import { directoryFixture } from "./fixtures.test-support";

vi.mock("./department-home-repository", () => ({
  departmentHomeRepository: async () => ({ load: async (departmentId: string) => ({ departmentId, revision: 1, description: "", driveFolderUrl: null, canEdit: false }) }),
}));

vi.mock("./department-budget-home-repository", async importOriginal => ({
  ...await importOriginal<typeof import("./department-budget-home-repository")>(),
  createDepartmentBudgetHomeRepository: () => ({ load: async (departmentId: string) => ({ departmentId, departmentName: "Management", seasonId: "season", seasonCode: "S27", viewVersion: 1, approvedTotalNok: "0.00", legacyTotalNok: "0.00", projects: [] }) }),
}));

describe("department member displays", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  async function open(tab: string) {
    const data = directoryFixture();
    const [lead, member] = data.members;
    const viewer = { ...member, id: "viewer", name: "Viewer Example" };
    data.members = [lead, member, viewer];
    const department = { ...data.departments[0], memberIds: [lead.id, member.id, viewer.id], viewerIds: [viewer.id], leadId: lead.id, leadIds: [lead.id] };
    data.departments = [department];
    await act(async () => root.render(<MemoryRouter initialEntries={[`/departments/management${tab}`]}><MemberThemeProvider><MemberNotificationsProvider><DepartmentWorkspace department={department} data={data} /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
  }
  it("excludes Viewers from home avatars while retaining Leads and Members", async () => {
    await open("");
    const button = container.querySelector('[aria-label="View 2 department members"]');
    expect(button?.querySelector('[aria-label="Members: Alex Example, Sam Example"]')).not.toBeNull();
    expect(button?.textContent).not.toContain("Viewer Example");
  });
  it("excludes Viewers from the Members table", async () => {
    await open("?tab=members");
    const table = container.querySelector("table");
    expect(table?.textContent).toContain("Alex Example");
    expect(table?.textContent).toContain("Sam Example");
    expect(table?.textContent).not.toContain("Viewer Example");
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(2);
  });
  it.each(["member", "viewer", "admin_nonmember"])("scopes the Budget pill for %s without private packet requests", async role => {
    const data = directoryFixture(); data.canAdmin = true; data.canManageProjects = true;
    const included = role !== "admin_nonmember";
    const department = { ...data.departments[0], memberIds: included ? [data.viewerId] : [], viewerIds: role === "viewer" ? [data.viewerId] : [], leadId: "other-lead", leadIds: ["other-lead"] };
    data.departments = [department];
    const request = vi.fn(async (_url: RequestInfo | URL) => Response.json({})); vi.stubGlobal("fetch", request);
    await act(async () => root.render(<MemoryRouter initialEntries={["/departments/management?tab=budgets"]}><MemberThemeProvider><MemberNotificationsProvider><DepartmentWorkspace department={department} data={data}/></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
    expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe(included ? "Budget" : "Home");
    expect([...container.querySelectorAll('[role="tab"]')].some(tab => tab.textContent === "Budget")).toBe(included);
    if (included) expect(container.textContent).toContain("No approved project budgets yet.");
    expect(request.mock.calls.some(call => /departmentBudgetPackage|departmentBudgetPreview|action=projectBudget/.test(String(call[0])))).toBe(false);
  });

});
