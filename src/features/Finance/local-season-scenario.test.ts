// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareLocalSeasonScenario, prepareLocalPipelineForecastScenario, SEASON_SCENARIO_KEY, SEASON_SCENARIO_BACKUP } from "./local-season-scenario";
import { initialLocalWorkspace, createLocalProjectRepository } from "../ProjectManagement/local-repository";
import { createLocalProjectBudgetRepository } from "./project-budget-local";
import { createLocalDepartmentBudgetRepository } from "./department-budget-local";
import { createFinanceApi } from "./repository";
import { coverageLevels, seasonIncome } from "./budget-dashboard-model";
import { canonicalNokOre } from "./project-budget-diff";
import { setLocalMemberSignedIn } from "../MemberPlatform/local-mode";

const snapshot = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => { const key = localStorage.key(index)!; return [key, localStorage.getItem(key)]; }));
beforeEach(() => {
  vi.stubEnv("DEV", true); vi.stubEnv("MODE", "member-local");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
  localStorage.clear(); window.history.replaceState({}, "", "/finance/budgets?financeScenario=season&financeRole=head_of_finance&budgetRole=head_of_finance&memberRole=default");
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); });

it("builds all departments through approvals, seeds honest purchases and awards, preserves existing projects and runs once", async () => {
  const external = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External calls are forbidden in fixture setup"));
  const previous = initialLocalWorkspace(); previous.projects[0].description = "Keep the existing project description";
  localStorage.setItem("helix-member-local-projects-v1", JSON.stringify(previous));
  const [summary, same] = await Promise.all([prepareLocalSeasonScenario(), prepareLocalSeasonScenario()]);
  expect(same).toEqual(summary); expect(summary).toMatchObject({ projects: 16, budgets: 15, purchases: 31, receivedNok: "1860000.00", approvedNok: "2192000.00", pendingDepartments: ["Electronics", "Logistics"] });
  const workspace = await createLocalProjectRepository().load();
  expect(workspace.projects.find(project => project.id === previous.projects[0].id)?.description).toBe("Keep the existing project description");
  const budgets = await createLocalProjectBudgetRepository().load();
  for (const department of workspace.departments) expect(budgets.budgets.filter(budget => budget.responsibleDepartmentId === department.id && budget.approvedVersionId)).toHaveLength(2);
  expect((await createLocalDepartmentBudgetRepository().queue()).packages.filter(packet => packet.status === "finance_pending").map(packet => packet.snapshot.departmentName).sort()).toEqual(["Electronics", "Logistics"]);
  const api = createFinanceApi({ current: null }), view = await api.budgets(), funding = await api.financing(), purchases = await api.purchases();
  const income = seasonIncome(funding.funding, "S27", "2026-11-22"), levels = coverageLevels(view);
  expect(income.plottedOre).toBe(186000000n); expect(income.plottedOre).toBeGreaterThan(levels[1].amountOre); expect(income.plottedOre).toBeLessThan(levels[2].amountOre);
  expect(view.departments.every(department => canonicalNokOre(department.actualNok) > 0n)).toBe(true);
  expect(view.departments.flatMap(department => department.systems.flatMap(system => system.items)).filter(item => item.priority === "P0")).toHaveLength(2);
  expect(purchases.register).toHaveLength(31); expect(purchases.register?.some(purchase => purchase.unpaid)).toBe(true); expect(purchases.register?.some(purchase => purchase.invoice?.paid)).toBe(true); expect(purchases.register?.some(purchase => purchase.exceptions.length > 0)).toBe(true);
  expect(external).not.toHaveBeenCalled();
  const saved = snapshot(); expect(await prepareLocalSeasonScenario()).toEqual(summary); expect(snapshot()).toEqual(saved);
  expect(localStorage.getItem("helix-member-local-space-access-v1")).toBeNull(); expect(localStorage.getItem(SEASON_SCENARIO_BACKUP)).toContain("Keep the existing project description");
});
it.each([{ dev: false, mode: "member-local" }, { dev: true, mode: "production" }])("refuses initialization outside dedicated development: $dev/$mode", ({ dev, mode }) => {
  vi.stubEnv("DEV", dev); vi.stubEnv("MODE", mode); const before = snapshot();
  expect(() => prepareLocalSeasonScenario()).toThrow(/loopback/); expect(snapshot()).toEqual(before);
});
it("refuses signed-out setup without changing any data", () => {
  setLocalMemberSignedIn(false); const before = snapshot(); expect(() => prepareLocalSeasonScenario()).toThrow(/signed-in/); expect(snapshot()).toEqual(before);
});
it("restores the original fixture stores if preparation fails and leaves no completion marker", async () => {
  const previous = initialLocalWorkspace(); previous.canManage = false;
  localStorage.setItem("helix-member-local-projects-v1", JSON.stringify(previous));
  const before = snapshot();
  await expect(prepareLocalSeasonScenario()).rejects.toThrow("Project management access is required");
  expect(snapshot()).toEqual(before); expect(localStorage.getItem(SEASON_SCENARIO_KEY)).toBeNull();
});

it("refuses a non-loopback origin without touching local data", () => {
  const before = snapshot(); vi.stubGlobal("window", { location: { origin: "https://internal.helixnmbu.no" } });
  expect(() => prepareLocalSeasonScenario()).toThrow(/loopback/); expect(snapshot()).toEqual(before);
});

it("adds dated confidence examples once without modifying existing deals, roles or cash receipts", async () => {
  await prepareLocalSeasonScenario();
  const before = await createFinanceApi({current:null}).financing();
  const roles = ["helix-project-budgets-local-role-v1","helix-funding-applications-local-role-v1"].map(key=>localStorage.getItem(key));
  const external=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("External requests forbidden"));
  await prepareLocalPipelineForecastScenario();
  const after=await createFinanceApi({current:null}).financing();
  expect(after.pipelineForecast?.map(row=>row.confidence)).toEqual(["high","medium","low"]);
  expect(after.pipelineForecast?.map(row=>row.invoiceDate)).toEqual(["2026-11-29","2026-12-07","2026-12-16"]);
  expect(after.funding).toEqual(before.funding);
  expect(["helix-project-budgets-local-role-v1","helix-funding-applications-local-role-v1"].map(key=>localStorage.getItem(key))).toEqual(roles);
  const saved=snapshot(); await prepareLocalPipelineForecastScenario(); expect(snapshot()).toEqual(saved);
  expect(external).not.toHaveBeenCalled();
  vi.stubEnv("DEV",false); await expect(prepareLocalPipelineForecastScenario()).rejects.toThrow("loopback"); expect(snapshot()).toEqual(saved);
});
