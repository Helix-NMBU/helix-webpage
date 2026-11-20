// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { PublicBudgets } from "./types";
const state = vi.hoisted(() => ({ budgets: null as PublicBudgets | null }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({
  useFinanceAccess: () => ({ ...state, loadPage: vi.fn(), retry: vi.fn() }),
}));
import { BudgetsBoard } from "./BudgetsPage";
it("labels repeated physical systems by accounting department without duplicate document IDs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  state.budgets = {
    viewVersion: 1,
    seasonCode: "S27",
    budgetStatus: "draft",
    approvedOn: null,
    approvedPresence: { legacyBudget: false, projectBudgets: true },
    revision: 1,
    choices: { systems: [], items: [] },
    departments: ["mechanical", "electrical"].map((departmentKey) => ({
      departmentKey,
      name: departmentKey,
      plannedNok: "100.00",
      actualNok: "0.00",
      differenceNok: "100.00",
      unbudgetedNok: "0.00",
      systems: [
        {
          id: "physical",
          code: "SYS",
          name: "Same physical system",
          active: true,
          plannedNok: "100.00",
          actualNok: "0.00",
          differenceNok: "100.00",
          unbudgetedNok: "0.00",
          unbudgetedItemId: null,
          unbudgetedPublicRef: null,
          items: [],
        },
      ],
    })),
  };
  await act(async () => root.render(<BudgetsBoard />));
  const headings = [...container.querySelectorAll("h3")];
  expect(headings.map((heading) => heading.id)).toEqual([
    "system-mechanical-physical",
    "system-electrical-physical",
  ]);
  for (const heading of headings)
    expect(
      container.querySelector(`[aria-labelledby="${heading.id}"]`)?.textContent,
    ).toContain("Same physical system");
  expect(
    new Set(
      [...container.querySelectorAll("[id]")].map((element) => element.id),
    ).size,
  ).toBe(container.querySelectorAll("[id]").length);
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
