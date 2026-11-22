// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DepartmentHomeBudget } from "../Finance/department-budget-types";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import { MEMBER_ACCESS_CHANGED } from "../MemberPlatform/member-access-api";
import { DepartmentBudgetHomeError, type DepartmentBudgetHomeRepository } from "./department-budget-home-repository";
import { DepartmentBudgetOverview } from "./DepartmentBudgetOverview";
import * as budgetRepository from "./department-budget-home-repository";
import { DepartmentWorkspace } from "./DepartmentWorkspace";
import { directoryFixture } from "./fixtures.test-support";
const gates = vi.hoisted(() => ({ finance: false, packets: vi.fn(), projects: vi.fn() }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({ useOptionalFinanceAccess: () => gates.finance ? { access: "allowed", capabilities: { purchaseRegister: true } } : null }));
vi.mock("../Finance/DepartmentBudgetsPanel", () => ({ DepartmentBudgetsPanel: () => { gates.packets(); return <div>Private department review</div>; } }));
vi.mock("../Finance/ProjectBudgetsPanel", () => ({ ProjectBudgetsPanel: () => { gates.projects(); return <div>Private project budgets</div>; } }));

vi.mock("./department-home-repository", () => ({
  departmentHomeRepository: async () => ({ load: async (departmentId: string) => ({ departmentId, revision: 1, description: "Current department description", driveFolderUrl: null, canEdit: true }) }),
}));

const budget: DepartmentHomeBudget = {
  departmentId: "department", departmentName: "Mechanical & Production", seasonId: "season", seasonCode: "S27", viewVersion: 1,
  approvedTotalNok: "8900.75", legacyTotalNok: "250.25",
  projects: [{ projectId: "frame", projectName: "Chassis & assembly", approvedTotalNok: "8650.50" }],
};
let root: Root, container: HTMLDivElement;
function Notifications() { const context = useMemberNotifications(); return <output>{context?.items.map(item => <span key={item.id}>{item.title} {item.action && <button onClick={item.action.onClick}>{item.action.label}</button>}</span>)}</output>; }
beforeEach(() => {
  gates.finance = false; gates.packets.mockClear(); gates.projects.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(repository: DepartmentBudgetHomeRepository, viewerId = "member", departmentId = "department") {
  await act(async () => root.render(<MemoryRouter><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><DepartmentBudgetOverview departmentId={departmentId} viewerId={viewerId} repository={repository} /><Notifications /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
}

it("shows an ordinary member the approved total and project breakdown with normal project links", async () => {
  const repository = { load: vi.fn().mockResolvedValue(budget) };
  await render(repository);
  expect(container.textContent).toContain("Allocated budget");
  expect(container.textContent).toContain("NOK 8,900.75");
  expect(container.textContent).toContain("NOK 8,650.50");
  expect(container.textContent).toContain("Unmapped legacy budget");
  expect(container.querySelector('a[href="/projects/frame"]')?.textContent).toBe("Chassis & assembly");
  expect(container.querySelector('a[href*="budget"]')).toBeNull();
  expect(container.textContent).not.toMatch(/invoice|approval|pipeline/i);
  expect(repository.load).toHaveBeenCalledWith("department", expect.any(AbortSignal));
});

it("renders exact large amounts and a valid pre-season empty allocation", async () => {
  const repository = { load: vi.fn().mockResolvedValueOnce({ ...budget, approvedTotalNok: "92233720368547758.07" }).mockResolvedValueOnce({ ...budget, seasonId: null, approvedTotalNok: "0.00", legacyTotalNok: "0.00", projects: [] }) };
  await render(repository);
  expect(container.textContent).toContain("NOK 92,233,720,368,547,758.07");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("NOK 0.00");
  expect(container.textContent).toContain("No approved project budgets yet.");
  expect(container.textContent).not.toContain("Unmapped legacy budget");
});

it("opens approved allocations in Budget without discarding a Home draft", async () => {
  const repository = { load: vi.fn().mockResolvedValueOnce(budget).mockResolvedValue({ ...budget, viewVersion: 2, approvedTotalNok: "9900.75" }) };
  vi.spyOn(budgetRepository, "createDepartmentBudgetHomeRepository").mockReturnValue(repository);
  const data = directoryFixture(), department = { ...data.departments[0], leadId: "other-lead", leadIds: ["other-lead"], memberIds: [data.viewerId] };
  data.departments = [department];
  await act(async () => root.render(<MemoryRouter><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><DepartmentWorkspace department={department} data={data} /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
  await act(async () => (container.querySelector('[aria-label="Edit department description"]') as HTMLButtonElement).click());
  const sidebar = container.querySelector('aside[aria-label="Department details"]')!;
  expect(sidebar.querySelector('[aria-labelledby="department-budget-title"]')).toBeNull();
  expect(repository.load).not.toHaveBeenCalled();
  const draft = container.querySelector('[aria-label="Department description"]') as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, "Unfinished department description");
    draft.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => ([...container.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === "Budget") as HTMLButtonElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("Budget");
  expect(container.textContent).toContain("NOK 8,900.75");
  expect(gates.packets).not.toHaveBeenCalled(); expect(gates.projects).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("NOK 9,900.75");
  await act(async () => ([...container.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === "Home") as HTMLButtonElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect((container.querySelector('[aria-label="Department description"]') as HTMLTextAreaElement).value).toBe("Unfinished department description");
});

it("retains a labelled last value after a network failure then removes amounts after revocation", async () => {
  const repository = { load: vi.fn().mockResolvedValueOnce(budget).mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce(new DepartmentBudgetHomeError("Department access was revoked.", 403)) };
  await render(repository);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("Last loaded approved allocation");
  expect(container.textContent).toContain("NOK 8,900.75");
  expect(container.textContent).toContain("Could not load allocated budget Try again");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).not.toContain("NOK 8,900.75");
  expect(container.textContent).not.toContain("Chassis & assembly");
});

it("clears private amounts immediately on access-change events and ignores the old in-flight result", async () => {
  let finish!: (value: DepartmentHomeBudget) => void;
  const old = new Promise<DepartmentHomeBudget>(resolve => { finish = resolve; });
  const repository = { load: vi.fn().mockResolvedValueOnce(budget).mockReturnValueOnce(old).mockRejectedValueOnce(new DepartmentBudgetHomeError("Access revoked.", 403)) };
  await render(repository);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => window.dispatchEvent(new Event(MEMBER_ACCESS_CHANGED)));
  expect(container.textContent).not.toContain("NOK 8,900.75");
  await act(async () => finish({ ...budget, approvedTotalNok: "999999.00" }));
  expect(container.textContent).not.toContain("999,999");
});

it("never shows a late response from an earlier account or department", async () => {
  let finish!: (value: DepartmentHomeBudget) => void;
  const old = new Promise<DepartmentHomeBudget>(resolve => { finish = resolve; });
  const repository = { load: vi.fn().mockReturnValueOnce(old).mockResolvedValue({ ...budget, departmentId: "other", approvedTotalNok: "9.00", projects: [] }) };
  await render(repository, "first");
  await render(repository, "second", "other");
  expect(container.textContent).toContain("NOK 9.00");
  await act(async () => finish(budget));
  expect(container.textContent).not.toContain("NOK 8,900.75");
  expect(container.textContent).not.toContain("Chassis & assembly");
});

it("ignores recovery actions retained from an earlier account and department", async () => {
  const repository = { load: vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ ...budget, departmentId: "other", approvedTotalNok: "9.00", projects: [] }) };
  await render(repository, "first");
  await render(repository, "second", "other");
  const oldRecovery = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Try again")!;
  await act(async () => oldRecovery.click());
  expect(repository.load).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("NOK 9.00");
});

it("clears a pending response when the repository's session watcher reports account loss", async () => {
  let finish!: (value: DepartmentHomeBudget) => void, end!: () => void;
  const pending = new Promise<DepartmentHomeBudget>(resolve => { finish = resolve; });
  const stop = vi.fn();
  const repository = { load: vi.fn().mockReturnValue(pending), watchSession: (onEnd: () => void) => { end = onEnd; return stop; } };
  await render(repository);
  await act(async () => end());
  await act(async () => finish(budget));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(repository.load).toHaveBeenCalledOnce();
  expect(container.querySelector('[aria-label="Refresh allocated budget"]')).toBeNull();
  expect(container.textContent).not.toContain("NOK 8,900.75");
  expect(container.textContent).toContain("Your session has ended Sign in");
  await act(async () => root.unmount()); expect(stop).toHaveBeenCalledOnce(); root = createRoot(container);
});

it("polls visible pages without overlapping loads, times out stuck requests and permits recovery", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const repository = { load: vi.fn().mockResolvedValueOnce(budget).mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValue({ ...budget, approvedTotalNok: "9000.00" }) };
  await render(repository);
  await act(async () => { visibility.mockReturnValue("hidden"); await vi.advanceTimersByTimeAsync(30_000); });
  expect(repository.load).toHaveBeenCalledTimes(1);
  await act(async () => { visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); });
  const signal = repository.load.mock.calls[1][1] as AbortSignal;
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(repository.load).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(signal.aborted).toBe(true);
  expect(container.textContent).toContain("Last loaded approved allocation");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.textContent).toContain("NOK 9,000.00");
});

it("opens the approved overview from a member's Budget deep link without private review panels", async () => {
  const repository = { load: vi.fn().mockResolvedValue(budget) };
  vi.spyOn(budgetRepository, "createDepartmentBudgetHomeRepository").mockReturnValue(repository);
  const data = directoryFixture(), department = { ...data.departments[0], memberIds: [data.viewerId], leadId: "other", leadIds: ["other"] };
  await act(async () => root.render(<MemoryRouter initialEntries={["/?tab=budgets"]}><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><DepartmentWorkspace data={data} department={department} /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
  expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("Budget");
  expect(container.querySelector('table[aria-label="Approved project allocations"]')?.textContent).toContain("Chassis & assembly");
  expect(container.textContent).toContain("NOK 8,900.75");
  expect(gates.packets).not.toHaveBeenCalled(); expect(gates.projects).not.toHaveBeenCalled();
  expect(container.querySelector('aside[aria-label="Department details"]')).toBeNull();
});
it("keeps nonmember Finance reviewers in their authorized workflow without reading the membership-only overview", async () => {
  gates.finance = true;
  const repository = { load: vi.fn().mockResolvedValue(budget) };
  vi.spyOn(budgetRepository, "createDepartmentBudgetHomeRepository").mockReturnValue(repository);
  const data = directoryFixture(), department = { ...data.departments[0], memberIds: [], viewerIds: [], leadId: "other", leadIds: ["other"] };
  await act(async () => root.render(<MemoryRouter initialEntries={["/?tab=budgets"]}><MemberThemeProvider><MemberNotificationsProvider renderToaster={false}><DepartmentWorkspace data={data} department={department} /></MemberNotificationsProvider></MemberThemeProvider></MemoryRouter>));
  expect(container.querySelector('[role="tab"][data-state="active"]')?.textContent).toBe("Budget");
  expect(gates.packets).toHaveBeenCalled(); expect(gates.projects).toHaveBeenCalled();
  expect(repository.load).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-labelledby="department-budget-title"]')).toBeNull();
});
