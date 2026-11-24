// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DepartmentBudgetCards } from "./BudgetDashboard";
import { SeasonIncomeChart } from "./SeasonIncomeChart";
import { dashboardBudgetFixture, funding, item } from "./budget-dashboard.test-support";

const state = vi.hoisted(() => ({ signals: { enabled: true, loading: false, data: null as unknown }, names: ["Mechanical & Production", "Finance"] }));
vi.mock("./use-budget-review-signals", () => ({ useBudgetReviewSignals: () => state.signals }));
vi.mock("../Workspace/WorkspaceContext", () => ({ useWorkspace: () => ({ data: { departments: state.names.map(name => ({ name })) } }) }));
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) { const height=this.classList.contains("recharts-legend-wrapper")?24:240; return { width: 840, height, x: 0, y: 0, top: 0, left: 0, right: 840, bottom: height, toJSON: () => ({}) }; }); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); state.names = ["Mechanical & Production", "Finance"]; state.signals = { enabled: true, loading: false, data: { queue: { packages: [] }, projects: { budgets: [] } } }; });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("shows approved allocation, current spending, a new package indicator and a stable drill-down link", async () => {
  const budgets = dashboardBudgetFixture([item("P1", "100.00"), item("P2", "99999.00", false)]);
  state.signals.data = { queue: { packages: [{ status: "finance_pending", snapshot: { departmentName: "Mechanical & Production", seasonCode: "S27" } }] }, projects: { budgets: [] } };
  await act(async () => root.render(<MemoryRouter><DepartmentBudgetCards budgets={budgets} /></MemoryRouter>));
  const card = container.querySelector('a[href="/finance/budgets/mechanical-and-production"]')!;
  expect(card.textContent).toContain("Changes requested"); expect(card.querySelector('[data-slot="badge"]')?.className).toContain("bg-[var(--warning)]"); expect(card.textContent).toContain("NOK 100.00"); expect(card.textContent).toContain("NOK 80.00"); expect(card.textContent).toContain("NOK 20.00"); expect(card.textContent).not.toContain("99,999");
  expect(card.textContent).not.toContain("department submission");
  expect(card.textContent).not.toContain("being revised");
  expect(container.querySelector('a[href="/finance/budgets/finance"]')?.textContent).toContain("No approved budget");
  state.signals.data = { queue: { packages: [{ status: "approved", snapshot: { departmentName: "Mechanical & Production", seasonCode: "S27" } }] }, projects: { budgets: [] } };
  await act(async () => root.render(<MemoryRouter><DepartmentBudgetCards budgets={budgets} /></MemoryRouter>));
  expect(card.querySelector('[data-slot="badge"]')).toBeNull();
  expect(card.textContent).not.toContain("No pending changes");
  state.signals.data = null;
  await act(async () => root.render(<MemoryRouter><DepartmentBudgetCards budgets={budgets} /></MemoryRouter>));
  expect(container.textContent).not.toContain("Changes requested"); expect(container.textContent).toContain("Change status unavailable"); expect(container.textContent).not.toContain("No pending changes");
});
it("draws received income, groups identical goal lines and omits redundant timeline controls", async () => {
  const budgets = dashboardBudgetFixture([item("P0", "100.00"), item("P2", "50.00")]);
  await act(async () => root.render(<SeasonIncomeChart budgets={budgets} financing={{ viewVersion: 1, seasonCode: "S27", funding: [funding("grant", "110.00", "2026-10-01"), funding("expected", "1000.00", null, "secured")], parts: [], scenarios: [] }} today="2026-11-22" />));
  expect(container.textContent).toContain("NOK 110.00"); expect(container.textContent).not.toContain("NOK 1,000.00"); expect(container.querySelector('svg desc')?.textContent).toContain("Income through 2026-11-22: NOK 110.00");
  expect(container.querySelectorAll('.recharts-reference-line')).toHaveLength(2);
  expect(container.textContent).toContain("Reached");
  expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
  expect(container.querySelectorAll(".recharts-line-dots circle")).toHaveLength(0);
  expect(container.querySelectorAll(".recharts-reference-dot")).toHaveLength(1);
  expect(container.textContent).not.toContain("Income goal reached");
  expect(container.textContent).toContain("Baseline + P2");
  expect(container.textContent).not.toContain("View income timeline");
  expect(container.textContent).not.toContain("Goals use approved budgets only.");
  expect(container.querySelector("table")).toBeNull();
});

it("draws three cumulative confidence projections without marking forecast-covered goals as reached", async () => {
  const budgets = dashboardBudgetFixture([item("P1", "100.00"), item("P2", "100.00"), item("P3", "100.00"), item("P4", "100.00")]);
  await act(async () => root.render(<SeasonIncomeChart budgets={budgets} financing={{ viewVersion: 1, seasonCode: "S27", funding: [funding("received", "50.00", "2026-10-01")], parts: [], scenarios: [], pipelineForecast: [{ contributionId: "p", fundingId: null, amountNok: "1000.00", confidence: "high", invoiceDate: "2026-12-01" }] }} today="2026-11-22" />));
  expect(container.querySelectorAll('.recharts-line')).toHaveLength(4);
  expect(container.textContent).toContain("Realistic"); expect(container.textContent).toContain("Optimistic");
  expect(container.textContent).not.toContain("Reached"); expect(container.textContent).toContain("NOK 50.00 to go");
  expect(container.querySelector('svg desc')?.textContent).toContain("planned invoice dates");
});


it("shows one Electrical card and retains changes requested under its Electronics directory name", async () => {
  const budgets = dashboardBudgetFixture([item("P1", "100.00")]);
  budgets.departments[0] = { ...budgets.departments[0], departmentKey: "electrical", name: "Electrical" };
  state.names = ["Electronics", "Finance"];
  state.signals.data = { queue: { packages: [{ status: "finance_pending", snapshot: { departmentName: "Electronics", seasonCode: "S27" } }] }, projects: { budgets: [] } };
  await act(async () => root.render(<MemoryRouter><DepartmentBudgetCards budgets={budgets} /></MemoryRouter>));
  const card = container.querySelector('a[href="/finance/budgets/electrical"]')!;
  expect(card.textContent).toContain("Changes requested");
  expect(card.textContent).toContain("NOK 100.00");
  expect(container.querySelector('a[href="/finance/budgets/electronics"]')).toBeNull();
});
