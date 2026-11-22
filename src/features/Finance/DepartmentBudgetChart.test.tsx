// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DepartmentBudgetChart } from "./DepartmentBudgetChart";
import { dashboardBudgetFixture, item } from "./budget-dashboard.test-support";
import type { DepartmentBudgetPackage } from "./department-budget-types";
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { const height = this.classList.contains("recharts-legend-wrapper") ? 24 : 250; return { width: 840, height, x: 0, y: 0, top: 0, left: 0, right: 840, bottom: height, toJSON: () => ({}) }; });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("renders one chart widget with approved totals and keeps the request separate", async () => {
  const budgets = dashboardBudgetFixture([{ ...item("P1", "100.00"), projectId: "p1", projectName: "Frame", actualNok: "80.00" }, item("P2", "9999.00", false)]);
  const pending = { status: "finance_pending", snapshot: { departmentId: "dep", departmentKey: "mechanical", seasonCode: "S27", proposedTotalNok: "120.00", deltaNok: "20.00", projects: [{ projectId: "p1", projectName: "Frame", responsibleDepartmentId: "dep", included: true, proposedTotalNok: "120.00" }] } } as DepartmentBudgetPackage;
  const render = (packet?: DepartmentBudgetPackage) => root.render(<DepartmentBudgetChart department={budgets.departments[0]} budgetStatus={budgets.budgetStatus} seasonCode="S27" pendingPackage={packet} />);
  await act(async () => render(pending));
  expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  expect(container.textContent).toContain("80% of the approved department budget spent."); expect(container.textContent).toContain("NOK 20.00");
  expect(container.textContent).toContain("Requested department budget"); expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(2);
  expect(container.textContent).not.toContain('By project'); expect(container.textContent).not.toContain('Frame');
  expect(container.querySelector('svg desc')?.textContent).toContain("Approved department budget NOK 100.00");
  expect(container.textContent).not.toContain("9,999.00");
  await act(async () => render());
  expect(container.textContent).not.toContain("Requested department budget"); expect(container.querySelectorAll('.recharts-pie-sector')).toHaveLength(2);
});
it("shows overspending without hiding costs or inventing an approved allocation", async () => {
  const budgets = dashboardBudgetFixture([]); budgets.departments[0].actualNok = "20.00";
  await act(async () => root.render(<DepartmentBudgetChart department={budgets.departments[0]} budgetStatus="absent" seasonCode="S27" />));
  expect(container.textContent).toContain("No approved allocation yet"); expect(container.textContent).toContain("Over budget");
  expect(container.textContent).toContain("NOK 20.00"); expect(container.textContent).not.toContain("Infinity");
});
it("uses a clear empty state before budgets and purchases exist", async () => {
  const budgets = dashboardBudgetFixture([]); budgets.departments[0].actualNok = "0.00";
  await act(async () => root.render(<DepartmentBudgetChart department={budgets.departments[0]} budgetStatus="absent" seasonCode="S27" />));
  expect(container.querySelector('[data-slot="chart"]')).toBeNull();
  expect(container.textContent).toContain("The overview will appear when a budget or purchase is recorded");
});

it("keeps the exact overage visible when spending exceeds a nonzero budget", async () => {
  const budgets = dashboardBudgetFixture([{ ...item("P1", "100.00"), actualNok: "125.25" }]);
  budgets.departments[0].actualNok = "125.25";
  await act(async () => root.render(<DepartmentBudgetChart department={budgets.departments[0]} budgetStatus={budgets.budgetStatus} seasonCode="S27" />));
  expect(container.textContent).toContain("125.3% of the approved department budget spent.");
  expect(container.textContent).toContain("Over budget"); expect(container.textContent).toContain("NOK 25.25");
  expect(container.querySelector('svg[role="img"] desc')?.textContent).toContain("Recorded spending NOK 125.25");
});
