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
vi.mock("./use-budget-review-signals", () => ({useBudgetReviewSignals: () => ({enabled:false,loading:false,data:null})}));
vi.mock("./DepartmentBudgetsPanel", () => ({ DepartmentBudgetsPanel: () => <h2>Department budget submissions</h2> }));
vi.mock("./ProjectBudgetsPanel", () => ({ ProjectBudgetsPanel: () => <h2>Project budgets</h2> }));
vi.mock("./BudgetsPage", () => ({ BudgetsBoard: () => <p>Season budget entries</p> }));
vi.mock("./SpendingPurchases", () => ({ SpendingPurchases: () => <div>Registered purchase cards</div> }));
vi.mock("./FinancingIncome", () => ({ FinancingIncome: () => <h2>Financing</h2> }));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); mocks.loadPage.mockReset(); });

it.each([false, true])("keeps the budget chart and department cards without the financing section, financing access %s", async financing => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container); root = createRoot(container);
  mocks.session = {
    access: "allowed", capabilities: { financing }, profiles: [], viewVersion: 1,
    budgets: { viewVersion: 1, budgetStatus: "approved", departments: [] }, financing: null,
    loadPage: mocks.loadPage,
  };
  await act(async () => root.render(<MemoryRouter><FinanceEntry page="budgets" /></MemoryRouter>));
  expect(container.querySelector("h1")?.textContent).toBe("Budgets");
  expect(container.textContent).toContain("Department budgets");
  expect(container.textContent).not.toContain("Department budget submissions");
  expect(container.textContent).not.toContain("Funding records and bank balance");
  expect(container.textContent).not.toContain("Season budget");
  expect([...container.querySelectorAll("h2")].some(heading=>heading.textContent==="Financing")).toBe(false);
  expect(mocks.loadPage.mock.calls).toEqual(financing ? [["financing"]] : []);
  expect(container.querySelector('[aria-label="Finance sections"]')).toBeNull();
});

it.each([false, true])("shows financing on Income & Spend only with financing access %s", async financing => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container); root = createRoot(container);
  mocks.session = {
    access: "allowed", capabilities: {financing,purchaseRegister:true}, profiles: [],viewVersion:1,
    overview:{viewVersion:1,budgetStatus:"approved",departments:[],publicEarmarks:[]},financing:null,
    purchases:{viewVersion:1,register:[{status:"registered",totalNok:"100.25",unpaid:false},{status:"registered",totalNok:"250.50",unpaid:true}]},
    loadPage:mocks.loadPage,
  };
  await act(async()=>root.render(<MemoryRouter><FinanceEntry page="overview"/></MemoryRouter>));
  expect(container.querySelector("h1")?.textContent).toBe("Income & Spend");
  expect(container.textContent).toContain("Registered purchase cards");
  expect([...container.querySelectorAll("h2")].some(heading=>heading.textContent==="Financing")).toBe(financing);
  expect(mocks.loadPage.mock.calls).toEqual(financing ? [["financing"]] : []);
  const summary=container.querySelector('[aria-label="Season income and spend"]')!;
  expect(summary.previousElementSibling?.textContent).toContain("Income, payments and registered purchases for this season.");
  const spend=summary.querySelector('[aria-labelledby="season-spend-summary-title"]')!;
  expect([...spend.querySelectorAll("dt")].map(row=>row.firstChild?.textContent)).toEqual(["Paid","Unpaid","Total"]);
  expect([...spend.querySelectorAll("dd")].map(row=>row.textContent)).toEqual(["NOK 100.25","NOK 250.50","NOK 350.75"]);
  expect(Boolean(summary.querySelector('[aria-labelledby="season-income-summary-title"]'))).toBe(financing);
  expect(Boolean(summary.querySelector('[aria-label="Loading season income totals"]'))).toBe(financing);
});

it("shows Season Income for an authorized income-only reader without requesting or exposing the purchase register", async()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  document.body.append(container);root=createRoot(container);
  mocks.session={access:"allowed",capabilities:{financing:true,purchaseRegister:false},profiles:[],viewVersion:1,overview:{viewVersion:1,budgetStatus:"absent",departments:[],publicEarmarks:[]},financing:{viewVersion:1,funding:[{id:"received",sourceName:"Grant",status:"received",amountNok:"900.25",receivedDate:"2026-11-24"}],wonIncome:[],parts:[],scenarios:[]},loadPage:mocks.loadPage};
  await act(async()=>root.render(<MemoryRouter><FinanceEntry page="overview"/></MemoryRouter>));
  const summary=container.querySelector('[aria-label="Season income and spend"]')!;
  expect(summary.textContent).toContain("Season Income");
  expect([...summary.querySelectorAll("dd")].map(row=>row.textContent)).toEqual(["NOK 900.25","NOK 0.00","NOK 900.25"]);
  expect(summary.textContent).not.toContain("Season Spend");
  expect(container.textContent).not.toContain("Registered purchase cards");
  expect(mocks.loadPage).not.toHaveBeenCalledWith("purchases");
});
