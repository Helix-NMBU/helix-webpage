import { seasonChartRange } from "../ProjectManagement/progress-chart";
import { canonicalNokOre } from "./project-budget-diff";
import type { FundingRecord, PublicBudgetItem, PublicBudgets, PublicDepartmentBudget } from "./types";

export const COVERAGE_LEVELS = [
  { name: "Baseline", priorities: "P0 and P1", rank: 1 },
  { name: "Level 1", priorities: "Baseline + P2", rank: 2 },
  { name: "Level 2", priorities: "Level 1 + P3", rank: 3 },
  { name: "Level 3", priorities: "Level 2 + P4", rank: 4 },
] as const;
export function approvedDepartmentItems(department: PublicDepartmentBudget, budgetStatus: PublicBudgets["budgetStatus"]) {
  return department.systems.flatMap(system => system.items).filter(item => item.approved === true || (item.approved === undefined && budgetStatus === "approved"));
}
export function approvedAllocation(department: PublicDepartmentBudget, status: PublicBudgets["budgetStatus"]) {
  return approvedDepartmentItems(department, status).reduce((sum, item) => sum + canonicalNokOre(item.effectivePlanNok), 0n);
}
export function coverageLevels(budgets: PublicBudgets | null) {
  const entries = budgets?.departments.flatMap(department => approvedDepartmentItems(department, budgets.budgetStatus)) ?? [];
  const rank = (entry: PublicBudgetItem) => entry.priority === "P0" || entry.priority === "EM" ? 0 : Number(entry.priority.slice(1));
  return COVERAGE_LEVELS.map(level => ({ ...level, amountOre: entries.reduce((sum, entry) => sum + (rank(entry) <= level.rank ? canonicalNokOre(entry.effectivePlanNok) : 0n), 0n) }));
}
export function seasonIncome(funding: readonly FundingRecord[], season: string, today: string) {
  const range = seasonChartRange(season, today);
  const endDate = `${Number(range.startDate.slice(0, 4)) + 1}-08-01`;
  const throughDate = today < range.startDate ? range.startDate : today < endDate ? today : endDate;
  const received = funding.filter(record => record.status === "received");
  const dated = received.filter(record => record.receivedDate && record.receivedDate >= range.startDate && record.receivedDate < endDate && record.receivedDate <= today).sort((a, b) => a.receivedDate!.localeCompare(b.receivedDate!) || a.id.localeCompare(b.id));
  const amounts = new Map<string, bigint>();
  for (const record of dated) amounts.set(record.receivedDate!, (amounts.get(record.receivedDate!) ?? 0n) + canonicalNokOre(record.amountNok));
  let cumulative = 0n;
  const points = [{ date: range.startDate, amountOre: 0n }];
  for (const [date, amount] of amounts) { cumulative += amount; points.push({ date, amountOre: cumulative }); }
  if (points[points.length - 1]?.date !== throughDate) points.push({ date: throughDate, amountOre: cumulative });
  const totalOre = received.reduce((sum, record) => sum + canonicalNokOre(record.amountNok), 0n);
  return { startDate: range.startDate, endDate, throughDate, totalOre, plottedOre: cumulative, unplacedOre: totalOre - cumulative, unplacedCount: received.length - dated.length, points };
}

export function dashboardDepartments(budgets: PublicBudgets, names: string[] = []): PublicDepartmentBudget[] {
  return [...budgets.departments, ...names.filter(name => !budgets.departments.some(department => department.name === name)).map(name => ({ departmentKey: name, name, plannedNok: "0.00", actualNok: "0.00", differenceNok: "0.00", unbudgetedNok: "0.00", systems: [] }))];
}
