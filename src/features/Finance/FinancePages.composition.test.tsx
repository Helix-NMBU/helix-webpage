// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { FinanceEntry } from "./FinancePages";

const mocks = vi.hoisted(() => ({ session: {} as Record<string, unknown>, loadPage: vi.fn() }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({
  FinanceGate: ({ children }: { children: React.ReactNode }) => children,
  useFinanceAccess: () => mocks.session,
}));
vi.mock("./DepartmentBudgetsPanel", () => ({ DepartmentBudgetsPanel: () => <h2>Department budget submissions</h2> }));
vi.mock("./ProjectBudgetsPanel", () => ({ ProjectBudgetsPanel: () => <h2>Project budgets</h2> }));
vi.mock("./BudgetsPage", () => ({ BudgetsBoard: () => <p>Season budget entries</p> }));
vi.mock("./FinancingIncome", () => ({ FinancingIncome: () => <h2>Financing</h2> }));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); mocks.loadPage.mockReset(); });

it.each([false, true])("combines planning and permitted funding on one page, financing access %s", async financing => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container); root = createRoot(container);
  mocks.session = {
    access: "allowed", capabilities: { financing }, profiles: [], viewVersion: 1,
    budgets: { viewVersion: 1, budgetStatus: "approved", departments: [] }, financing: null,
    loadPage: mocks.loadPage,
  };
  await act(async () => root.render(<MemoryRouter><FinanceEntry page="budgets" /></MemoryRouter>));
  expect(container.querySelector("h1")?.textContent).toBe("Budgets & Financing");
  expect(container.textContent).toContain("Department budgets");
  expect(container.textContent).not.toContain("Department budget submissions");
  expect(container.textContent).not.toContain("Funding records and bank balance");
  expect(container.textContent).not.toContain("Season budget");
  expect([...container.querySelectorAll("h2")].some(heading=>heading.textContent==="Financing")).toBe(financing);
  expect(mocks.loadPage.mock.calls).toEqual(financing ? [["financing"]] : []);
  expect(container.querySelector('[aria-label="Finance sections"]')).toBeNull();
});
