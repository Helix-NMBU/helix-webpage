import { compareDepartmentOrder, compareNb, differenceOre, effectivePlanOre } from "./budget-domain.js";
import { itemOpenCommitmentOre, scenarioNeedOre } from "./commitment-domain.js";
import { derivePartUsage } from "./funding.js";
import { addCalendarDays, formatOre } from "./money.js";
import type {
  BudgetItemPriority,
  BudgetItemStatus,
  FundingConfidence,
  FundingScenario,
  FundingStatus,
  PermittedEarmarkSource,
  PublicDepartmentSummary,
  PublicEarmarkSummary,
  PublicOverview,
} from "./types.js";

export const SCENARIO_KEYS = ["downside", "current", "full"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  downside: "Now",
  current: "Realistic",
  full: "Optimistic",
};

const ORDINARY_PRIORITIES: Record<ScenarioKey, readonly BudgetItemPriority[]> = {
  downside: ["P1"],
  current: ["P1", "P2"],
  full: ["P1", "P2", "P3", "P4"],
};

export type FundingFact = {
  id: string;
  status: FundingStatus;
  confidence: FundingConfidence | null;
  amountOre: bigint;
};

export type BudgetItemFact = {
  id: string;
  priority: BudgetItemPriority;
  status: BudgetItemStatus;
  plannedOre: bigint;
  actualOre: bigint;
  commitmentOre: bigint;
  unallocated: boolean;
  earmarkId: string | null;
  earmarkAmountOre: bigint | null;
  funding: FundingFact | null;
};

export type FundingPartFact = {
  id: string;
  fundingId: string;
  amountOre: bigint;
};

export type OverviewSystemFact = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  departmentKey: string;
  departmentName: string;
  sortOrder: number;
  items: BudgetItemFact[];
};

export type PartScenarioUse = {
  partId: string;
  counted: boolean;
  needOre: bigint;
  coverOre: bigint;
  unusedOre: bigint;
};

export type ScenarioComputation = FundingScenario & {
  key: ScenarioKey;
  eligibleFundingOre: bigint;
  earmarkedOre: bigint;
  unrestrictedOre: bigint;
  needOreAmount: bigint;
  restrictedCoverOre: bigint;
  generalNeedOre: bigint;
  shortfallOre: bigint;
  parts: PartScenarioUse[];
  itemNeeds: { itemId: string; needOre: bigint; eligibleRemainingPlanOre: bigint }[];
};

export function fundingEligible(scenario: ScenarioKey, funding: Pick<FundingFact, "status" | "confidence">): boolean {
  if (funding.status === "rejected" || funding.status === "deleted") return false;
  const secured = funding.status === "received" || funding.status === "secured";
  if (scenario === "downside") return secured;
  const highApplied = funding.status === "applied" && funding.confidence === "high";
  if (scenario === "current") return secured || highApplied;
  return secured || funding.status === "applied" || funding.status === "prospect";
}

export function priorityEligible(
  scenario: ScenarioKey,
  priority: BudgetItemPriority,
  funding: Pick<FundingFact, "status" | "confidence"> | null,
): boolean {
  if (priority === "EM") return funding !== null && fundingEligible(scenario, funding);
  return ORDINARY_PRIORITIES[scenario].includes(priority);
}

export function eligibleRemainingPlanOre(input: {
  scenario: ScenarioKey;
  priority: BudgetItemPriority;
  status: BudgetItemStatus;
  plannedOre: bigint;
  actualOre: bigint;
  unallocated: boolean;
  funding: Pick<FundingFact, "status" | "confidence"> | null;
}): bigint {
  const effective = effectivePlanOre(input.plannedOre, input.status, input.unallocated);
  const remaining = effective > input.actualOre ? effective - input.actualOre : 0n;
  if (!priorityEligible(input.scenario, input.priority, input.funding)) return 0n;
  return remaining;
}

/** Sum line remainings before comparing them with remaining plan. */
export function summedOpenCommitmentOre(lineRemainings: readonly bigint[]): bigint {
  return itemOpenCommitmentOre([...lineRemainings]);
}

export function itemScenarioNeedOre(item: BudgetItemFact, scenario: ScenarioKey): { needOre: bigint; eligibleRemainingPlanOre: bigint } {
  const eligibleRemainingPlan = eligibleRemainingPlanOre({
    scenario,
    priority: item.priority,
    status: item.status,
    plannedOre: item.plannedOre,
    actualOre: item.actualOre,
    unallocated: item.unallocated,
    funding: item.funding,
  });
  return {
    needOre: scenarioNeedOre(item.actualOre, item.commitmentOre, eligibleRemainingPlan),
    eligibleRemainingPlanOre: eligibleRemainingPlan,
  };
}

export function usedFraction(actualOre: bigint, planOre: bigint): string | null {
  if (planOre <= 0n) return null;
  const negative = actualOre < 0n;
  const absolute = negative ? -actualOre : actualOre;
  const rounded = (absolute * 20_000n + planOre) / (planOre * 2n);
  const whole = rounded / 10_000n;
  const fraction = (rounded % 10_000n).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function mustReturnStartsOn(spendBy: string): string {
  return addCalendarDays(spendBy, 1);
}

export function deadlineAwareUsage(amountOre: bigint, eligibleSpentOre: bigint, spendBy: string | null, today: string) {
  return derivePartUsage(amountOre, eligibleSpentOre, spendBy, today);
}

function scenarioMoney(computation: Omit<ScenarioComputation, keyof FundingScenario | "key"> & { key: ScenarioKey }): ScenarioComputation {
  return {
    ...computation,
    label: SCENARIO_LABELS[computation.key],
    eligibleFundingNok: formatOre(computation.eligibleFundingOre),
    earmarkedNok: formatOre(computation.earmarkedOre),
    unrestrictedNok: formatOre(computation.unrestrictedOre),
    needNok: formatOre(computation.needOreAmount),
    restrictedCoverNok: formatOre(computation.restrictedCoverOre),
    generalNeedNok: formatOre(computation.generalNeedOre),
    shortfallNok: formatOre(computation.shortfallOre),
  };
}

export function calculateScenarios(items: readonly BudgetItemFact[], funding: readonly FundingFact[], parts: readonly FundingPartFact[]): ScenarioComputation[] {
  return SCENARIO_KEYS.map((key) => {
    const eligibleFunding = funding.filter((record) => fundingEligible(key, record));
    const eligibleIds = new Set(eligibleFunding.map((record) => record.id));
    const countedParts = parts.filter((part) => eligibleIds.has(part.fundingId));
    const eligibleFundingOre = eligibleFunding.reduce((sum, record) => sum + record.amountOre, 0n);
    const earmarkedOre = countedParts.reduce((sum, part) => sum + part.amountOre, 0n);
    const unrestrictedOre = eligibleFundingOre - earmarkedOre;
    const itemNeeds = items.map((item) => ({ itemId: item.id, ...itemScenarioNeedOre(item, key) }));
    const needByItem = new Map(itemNeeds.map((entry) => [entry.itemId, entry.needOre]));
    const needOreAmount = itemNeeds.reduce((sum, entry) => sum + entry.needOre, 0n);
    const partsUse = parts.map((part): PartScenarioUse => {
      const counted = eligibleIds.has(part.fundingId);
      const linked = items.filter((item) => item.earmarkId === part.id);
      const needOre = linked.reduce((sum, item) => sum + (needByItem.get(item.id) ?? 0n), 0n);
      if (!counted) return { partId: part.id, counted: false, needOre, coverOre: 0n, unusedOre: part.amountOre };
      const coverOre = needOre < part.amountOre ? needOre : part.amountOre;
      return { partId: part.id, counted: true, needOre, coverOre, unusedOre: part.amountOre - coverOre };
    });
    const restrictedCoverOre = partsUse.reduce((sum, part) => sum + part.coverOre, 0n);
    const generalNeedOre = needOreAmount - restrictedCoverOre;
    const rawGap = generalNeedOre - unrestrictedOre;
    const shortfallOre = rawGap > 0n ? rawGap : 0n;
    return scenarioMoney({
      key,
      eligibleFundingOre,
      earmarkedOre,
      unrestrictedOre,
      needOreAmount,
      restrictedCoverOre,
      generalNeedOre,
      shortfallOre,
      parts: partsUse,
      itemNeeds,
    });
  });
}

export function systemBelongsOnOverview(input: { active: boolean; planOre: bigint; actualOre: bigint; commitmentOre: bigint; earmarkedOre: bigint }): boolean {
  if (input.active) return true;
  return input.planOre > 0n || input.actualOre > 0n || input.commitmentOre > 0n || input.earmarkedOre > 0n;
}

function earmarkedOnSystem(items: readonly BudgetItemFact[]): bigint {
  const seen = new Set<string>();
  let total = 0n;
  for (const item of items) {
    if (item.status === "cancelled" || item.unallocated || item.priority !== "EM" || !item.earmarkId) continue;
    if (seen.has(item.earmarkId)) continue;
    seen.add(item.earmarkId);
    total += item.earmarkAmountOre ?? 0n;
  }
  return total;
}

function moneyFields(planOre: bigint, actualOre: bigint, commitmentOre: bigint, unbudgetedOre: bigint) {
  return {
    plannedNok: formatOre(planOre),
    actualNok: formatOre(actualOre),
    differenceNok: formatOre(differenceOre(planOre, actualOre)),
    usedFraction: usedFraction(actualOre, planOre),
    commitmentNok: formatOre(commitmentOre),
    unbudgetedNok: formatOre(unbudgetedOre),
  };
}

export function buildDepartmentSummaries(systems: readonly OverviewSystemFact[]): PublicDepartmentSummary[] {
  const departments = new Map<string, PublicDepartmentSummary & { sortOrder: number }>();
  const orderedSystems = [...systems].sort((left, right) => compareDepartmentOrder(
    { sortOrder: left.sortOrder, name: left.departmentName, departmentKey: left.departmentKey },
    { sortOrder: right.sortOrder, name: right.departmentName, departmentKey: right.departmentKey },
  ) || compareNb(left.name, right.name) || compareNb(left.code, right.code));
  for (const system of orderedSystems) {
    let planOre = 0n;
    let actualOre = 0n;
    let commitmentOre = 0n;
    let unbudgetedOre = 0n;
    for (const item of system.items) {
      const plan = effectivePlanOre(item.plannedOre, item.status, item.unallocated);
      planOre += plan;
      actualOre += item.actualOre;
      commitmentOre += item.commitmentOre;
      if (item.unallocated) unbudgetedOre += item.actualOre;
    }
    if (!systemBelongsOnOverview({ active: system.active, planOre, actualOre, commitmentOre, earmarkedOre: earmarkedOnSystem(system.items) })) continue;
    let department = departments.get(system.departmentKey);
    if (!department) {
      department = {
        departmentKey: system.departmentKey,
        name: system.departmentName,
        sortOrder: system.sortOrder,
        ...moneyFields(0n, 0n, 0n, 0n),
        systems: [],
      };
      departments.set(system.departmentKey, department);
    }
    department.systems.push({
      id: system.id,
      code: system.code,
      name: system.name,
      active: system.active,
      ...moneyFields(planOre, actualOre, commitmentOre, unbudgetedOre),
    });
  }
  const listed = [...departments.values()].sort(compareDepartmentOrder);
  return listed.map((department) => {
    department.systems.sort((left, right) => compareNb(left.name, right.name) || compareNb(left.code, right.code));
    let planOre = 0n;
    let actualOre = 0n;
    let commitmentOre = 0n;
    let unbudgetedOre = 0n;
    for (const system of department.systems) {
      planOre += nokToOre(system.plannedNok);
      actualOre += nokToOre(system.actualNok);
      commitmentOre += nokToOre(system.commitmentNok);
      unbudgetedOre += nokToOre(system.unbudgetedNok);
    }
    const { sortOrder: _sortOrder, ...rest } = department;
    return { ...rest, ...moneyFields(planOre, actualOre, commitmentOre, unbudgetedOre), systems: department.systems };
  });
}

export function nokToOre(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = "00"] = value.slice(negative ? 1 : 0).split(".");
  const ore = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -ore : ore;
}

export function presentFinanceOverview(input: {
  viewVersion: number;
  seasonCode: string | null;
  budgetStatus: PublicOverview["budgetStatus"];
  approvedOn: string | null;
  departments: PublicDepartmentSummary[];
  publicEarmarks: PublicEarmarkSummary[];
  scenarios: FundingScenario[];
  earmarkSources: PermittedEarmarkSource[];
  showAggregates: boolean;
  showPrivate: boolean;
}): PublicOverview {
  const overview: PublicOverview = {
    viewVersion: input.viewVersion,
    seasonCode: input.seasonCode,
    budgetStatus: input.budgetStatus,
    approvedOn: input.approvedOn,
    departments: input.showAggregates ? input.departments : [],
    publicEarmarks: input.publicEarmarks,
  };
  if (input.showPrivate) {
    overview.scenarios = input.scenarios;
    overview.earmarkSources = input.earmarkSources;
  }
  return overview;
}
