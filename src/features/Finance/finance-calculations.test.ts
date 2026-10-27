import { describe, expect, it } from "vitest";
import { itemOpenCommitmentOre, lineRemainingOre } from "./commitment-domain.js";
import {
  buildDepartmentSummaries,
  calculateScenarios,
  deadlineAwareUsage,
  eligibleRemainingPlanOre,
  fundingEligible,
  itemScenarioNeedOre,
  mustReturnStartsOn,
  presentFinanceOverview,
  summedOpenCommitmentOre,
  systemBelongsOnOverview,
  usedFraction,
  type BudgetItemFact,
  type FundingFact,
  type FundingPartFact,
  type OverviewSystemFact,
} from "./finance-calculations.js";
import type { PublicEarmarkSummary } from "./types.js";

const nok = (whole: bigint) => whole * 100n;

function item(overrides: Partial<BudgetItemFact> & Pick<BudgetItemFact, "id">): BudgetItemFact {
  return {
    priority: "P1",
    status: "planned",
    plannedOre: 0n,
    actualOre: 0n,
    commitmentOre: 0n,
    unallocated: false,
    earmarkId: null,
    earmarkAmountOre: null,
    funding: null,
    ...overrides,
  };
}

function funding(overrides: Partial<FundingFact> & Pick<FundingFact, "id" | "status" | "amountOre">): FundingFact {
  return { confidence: null, ...overrides };
}

describe("FIN-09-A01 commitment-aware scenario need", () => {
  it("sums several commitments on one item before taking the max with remaining plan", () => {
    const commitment = summedOpenCommitmentOre([nok(3000n), nok(4500n)]);
    expect(commitment).toBe(itemOpenCommitmentOre([nok(3000n), nok(4500n)]));
    const row = item({
      id: "item-sum",
      priority: "P1",
      plannedOre: nok(9000n),
      actualOre: nok(1500n),
      commitmentOre: commitment,
    });
    const need = itemScenarioNeedOre(row, "downside");
    expect(need.eligibleRemainingPlanOre).toBe(nok(7500n));
    expect(need.needOre).toBe(nok(9000n));
  });

  it("keeps a negative unrestricted remainder and does not let unused restricted money cover unrelated need", () => {
    const restricted = funding({ id: "fund-restricted", status: "secured", amountOre: nok(2400n) });
    const items = [
      item({
        id: "earmarked",
        priority: "EM",
        plannedOre: nok(900n),
        actualOre: nok(200n),
        earmarkId: "part-a",
        earmarkAmountOre: nok(1800n),
        funding: restricted,
      }),
      item({ id: "general", priority: "P1", plannedOre: nok(1600n), actualOre: 0n }),
    ];
    const parts: FundingPartFact[] = [{ id: "part-a", fundingId: restricted.id, amountOre: nok(3000n) }];
    const [now] = calculateScenarios(items, [restricted], parts);
    expect(now.unrestrictedOre).toBe(nok(-600n));
    expect(now.unrestrictedNok).toBe("-600.00");
    expect(now.parts[0]).toMatchObject({ counted: true, coverOre: nok(900n), unusedOre: nok(2100n) });
    expect(now.needOreAmount).toBe(nok(2500n));
    expect(now.generalNeedOre).toBe(nok(1600n));
    expect(now.shortfallOre).toBe(nok(2200n));
    expect(now.shortfallNok).toBe("2200.00");
  });

  it("floors a covered general need at zero and still reports over-earmarking", () => {
    const source = funding({ id: "fund-over", status: "received", amountOre: nok(100n) });
    const [now] = calculateScenarios([], [source], [{ id: "part-over", fundingId: source.id, amountOre: nok(250n) }]);
    expect(now.unrestrictedOre).toBe(nok(-150n));
    expect(now.generalNeedOre).toBe(0n);
    expect(now.shortfallOre).toBe(nok(150n));
  });
});

describe("FIN-09-A02 golden commitment cases", () => {
  const approved = nok(10_000n);
  const actual = nok(4_000n);
  const plan = nok(12_000n);
  const commitment = summedOpenCommitmentOre([approved - actual]);

  it("turns an eligible 12,000 plan, 4,000 actual, and 10,000 approval into need 12,000", () => {
    expect(commitment).toBe(nok(6_000n));
    const row = item({ id: "golden", priority: "P1", plannedOre: plan, actualOre: actual, commitmentOre: commitment });
    expect(itemScenarioNeedOre(row, "downside").needOre).toBe(nok(12_000n));
    const [now] = calculateScenarios([row], [], []);
    expect(now.needNok).toBe("12000.00");
  });

  it("still counts 10,000 when the priority is outside the scenario", () => {
    const row = item({ id: "excluded", priority: "P3", plannedOre: plan, actualOre: actual, commitmentOre: commitment });
    expect(eligibleRemainingPlanOre({
      scenario: "downside",
      priority: "P3",
      status: "planned",
      plannedOre: plan,
      actualOre: actual,
      unallocated: false,
      funding: null,
    })).toBe(0n);
    expect(itemScenarioNeedOre(row, "downside").needOre).toBe(nok(10_000n));
    expect(itemScenarioNeedOre(row, "current").needOre).toBe(nok(10_000n));
    expect(itemScenarioNeedOre(row, "full").needOre).toBe(nok(12_000n));
  });

  it("keeps actual 11,000 and zero remaining commitment in every scenario", () => {
    const overrun = item({
      id: "overrun",
      priority: "P4",
      plannedOre: nok(10_000n),
      actualOre: nok(11_000n),
      commitmentOre: summedOpenCommitmentOre([lineRemainingOre(nok(10_000n), nok(11_000n))]),
    });
    expect(overrun.commitmentOre).toBe(0n);
    const scenarios = calculateScenarios([overrun], [], []);
    expect(scenarios.map((scenario) => scenario.needNok)).toEqual(["11000.00", "11000.00", "11000.00"]);
  });

  it("drops closed and cancelled commitments and ignores rejected or deleted funding", () => {
    expect(fundingEligible("full", { status: "deleted", confidence: "high" })).toBe(false);
    expect(fundingEligible("full", { status: "rejected", confidence: null })).toBe(false);
    expect(fundingEligible("current", { status: "applied", confidence: "medium" })).toBe(false);
    expect(fundingEligible("current", { status: "prospect", confidence: "high" })).toBe(false);
    expect(fundingEligible("full", { status: "prospect", confidence: null })).toBe(true);
    expect(fundingEligible("current", { status: "applied", confidence: "high" })).toBe(true);
    const deleted = funding({ id: "gone", status: "deleted", amountOre: nok(800n) });
    const row = item({
      id: "em-deleted",
      priority: "EM",
      plannedOre: nok(5000n),
      actualOre: nok(1750n),
      commitmentOre: 0n,
      earmarkId: "part-gone",
      funding: deleted,
    });
    expect(itemScenarioNeedOre(row, "full").needOre).toBe(nok(1750n));
  });
});

describe("FIN-09-A03 earmark deadline and scenario use stay separate", () => {
  it("caps deadline use, accepts the deadline day, and starts must-return the next Oslo day", () => {
    const amount = nok(6400n);
    const onDeadline = nok(2100n);
    const afterDeadline = nok(900n);
    const spendBy = "2026-10-27";
    expect(mustReturnStartsOn(spendBy)).toBe("2026-10-28");
    const onDay = deadlineAwareUsage(amount, onDeadline, spendBy, spendBy);
    expect(onDay).toMatchObject({ usedOre: onDeadline, overdue: false, mustReturnOre: 0n });
    const nextDay = deadlineAwareUsage(amount, onDeadline, spendBy, "2026-10-28");
    expect(nextDay).toMatchObject({ usedOre: onDeadline, leftOre: nok(4300n), overdue: true, mustReturnOre: nok(4300n) });
    const capped = deadlineAwareUsage(amount, amount + nok(50n), null, "2026-10-28");
    expect(capped.usedOre).toBe(amount);
    expect(capped.mustReturnOre).toBe(0n);

    const source = funding({ id: "fund-date", status: "secured", amountOre: amount });
    const row = item({
      id: "dated",
      priority: "EM",
      plannedOre: 0n,
      actualOre: onDeadline + afterDeadline,
      earmarkId: "part-date",
      earmarkAmountOre: amount,
      funding: source,
    });
    const [now] = calculateScenarios([row], [source], [{ id: "part-date", fundingId: source.id, amountOre: amount }]);
    expect(now.parts[0]?.coverOre).toBe(onDeadline + afterDeadline);
    expect(now.parts[0]?.coverOre).not.toBe(onDay.usedOre);
  });

  it("leaves unrelated need uncovered when restricted money is unused", () => {
    const source = funding({ id: "fund-gap", status: "received", amountOre: nok(10_000n) });
    const items = [
      item({
        id: "part-need",
        priority: "EM",
        plannedOre: nok(3000n),
        actualOre: 0n,
        earmarkId: "part-gap",
        earmarkAmountOre: nok(8000n),
        funding: source,
      }),
      item({ id: "other-need", priority: "P1", plannedOre: nok(5000n) }),
    ];
    const [now] = calculateScenarios(items, [source], [{ id: "part-gap", fundingId: source.id, amountOre: nok(8000n) }]);
    expect(now.restrictedCoverOre).toBe(nok(3000n));
    expect(now.parts[0]?.unusedOre).toBe(nok(5000n));
    expect(now.generalNeedOre).toBe(nok(5000n));
    expect(now.shortfallNok).toBe("3000.00");
  });
});

describe("FIN-09-A04 overview totals", () => {
  function system(overrides: Partial<OverviewSystemFact> & Pick<OverviewSystemFact, "id" | "name" | "departmentKey" | "departmentName" | "sortOrder">): OverviewSystemFact {
    return { code: "SYS-A", active: true, items: [], ...overrides };
  }

  it("orders departments by configured sort and keeps meaningful inactive systems", () => {
    const departments = buildDepartmentSummaries([
      system({
        id: "late",
        name: "Ål",
        code: "SYS-AL",
        departmentKey: "second",
        departmentName: "Alpha workshop",
        sortOrder: 2,
        active: false,
        items: [item({ id: "spent", actualOre: nok(640n), plannedOre: 0n })],
      }),
      system({
        id: "beta",
        name: "Beta",
        code: "SYS-BE",
        departmentKey: "second",
        departmentName: "Alpha workshop",
        sortOrder: 2,
        active: true,
      }),
      system({
        id: "empty-inactive",
        name: "Empty",
        code: "SYS-EMPTY",
        departmentKey: "second",
        departmentName: "Alpha workshop",
        sortOrder: 2,
        active: false,
      }),
      system({
        id: "zero",
        name: "Beta",
        code: "SYS-B",
        departmentKey: "first",
        departmentName: "Zebra workshop",
        sortOrder: 1,
        items: [item({ id: "plan", priority: "P2", plannedOre: nok(100n), actualOre: 0n })],
      }),
      system({
        id: "earmark-only",
        name: "Dormant",
        code: "SYS-D",
        departmentKey: "first",
        departmentName: "Zebra workshop",
        sortOrder: 1,
        active: false,
        items: [item({
          id: "em",
          priority: "EM",
          plannedOre: 0n,
          earmarkId: "part-keep",
          earmarkAmountOre: nok(50n),
          funding: funding({ id: "fund-keep", status: "secured", amountOre: nok(50n) }),
        })],
      }),
    ]);
    expect(departments.map((department) => department.name)).toEqual(["Zebra workshop", "Alpha workshop"]);
    expect(departments[0]?.systems.map((entry) => entry.name)).toEqual(["Beta", "Dormant"]);
    expect(departments[1]?.systems.map((entry) => entry.name)).toEqual(["Beta", "Ål"]);
    expect(departments[0]?.systems[0]).toMatchObject({ usedFraction: "0.0000", commitmentNok: "0.00", unbudgetedNok: "0.00" });
    expect(systemBelongsOnOverview({ active: false, planOre: 0n, actualOre: 0n, commitmentOre: 0n, earmarkedOre: 0n })).toBe(false);
  });

  it("breaks a shared department sort order by name, then by department id", () => {
    const departments = buildDepartmentSummaries([
      system({ id: "zebra-system", name: "Frame", departmentKey: "id-z", departmentName: "Zebra", sortOrder: 4 }),
      system({ id: "alpha-later-id", name: "Battery", departmentKey: "id-b", departmentName: "Alpha", sortOrder: 4 }),
      system({ id: "alpha-earlier-id", name: "Axle", departmentKey: "id-a", departmentName: "Alpha", sortOrder: 4 }),
    ]);

    expect(departments.map((department) => [department.name, department.departmentKey])).toEqual([
      ["Alpha", "id-a"],
      ["Alpha", "id-b"],
      ["Zebra", "id-z"],
    ]);
  });

  it("separates unbudgeted spending and leaves use undefined when the plan is zero", () => {
    const departments = buildDepartmentSummaries([
      system({
        id: "frame",
        name: "Frame",
        code: "SYS-FR",
        departmentKey: "mechanical-production",
        departmentName: "Mechanical",
        sortOrder: 1,
        items: [
          item({ id: "ordinary", plannedOre: nok(20n), actualOre: nok(9n) }),
          item({ id: "cancelled", status: "cancelled", plannedOre: nok(50n), actualOre: nok(4n) }),
          item({ id: "unallocated", unallocated: true, priority: "P1", plannedOre: 0n, actualOre: nok(6n), commitmentOre: nok(2n) }),
        ],
      }),
    ]);
    expect(departments[0]?.systems[0]).toMatchObject({
      plannedNok: "20.00",
      actualNok: "19.00",
      differenceNok: "1.00",
      unbudgetedNok: "6.00",
      commitmentNok: "2.00",
      usedFraction: "0.9500",
    });
    expect(usedFraction(nok(1n), 0n)).toBeNull();
  });
});

describe("FIN-09-A05 role filtered overview", () => {
  const earmark: PublicEarmarkSummary = {
    id: "part-public",
    publicRef: "FE-001",
    purpose: "Frame work",
    amountNok: "400.00",
    usedNok: "100.00",
    leftNok: "300.00",
    mustReturnNok: "0.00",
    spendBy: "2026-12-31",
    systemName: null,
  };

  it("omits scenarios and earmark sources from a public response", () => {
    const overview = presentFinanceOverview({
      viewVersion: 4,
      seasonCode: "S27",
      budgetStatus: "draft",
      approvedOn: null,
      departments: [],
      publicEarmarks: [earmark],
      scenarios: calculateScenarios([], [funding({ id: "hidden", status: "secured", amountOre: nok(10n) })], []),
      earmarkSources: [{ id: earmark.id, sourceName: "Example source", conditions: "Private condition text" }],
      showAggregates: false,
      showPrivate: false,
    });
    expect(overview.departments).toEqual([]);
    expect(overview.publicEarmarks).toEqual([earmark]);
    expect(overview).not.toHaveProperty("scenarios");
    expect(overview).not.toHaveProperty("earmarkSources");
    expect(JSON.stringify(overview)).not.toContain("Example source");
    expect(JSON.stringify(overview)).not.toContain("Private condition text");
    expect(JSON.stringify(overview)).not.toContain("bank");
  });

  it("includes scenarios and source conditions for a financing profile", () => {
    const overview = presentFinanceOverview({
      viewVersion: 4,
      seasonCode: "S27",
      budgetStatus: "approved",
      approvedOn: "2026-10-01",
      departments: [],
      publicEarmarks: [earmark],
      scenarios: calculateScenarios([], [], []),
      earmarkSources: [{ id: earmark.id, sourceName: "Example source", conditions: "Private condition text" }],
      showAggregates: true,
      showPrivate: true,
    });
    expect(overview.scenarios).toHaveLength(3);
    expect(overview.scenarios?.map((scenario) => scenario.label)).toEqual(["Now", "Realistic", "Optimistic"]);
    expect(overview.earmarkSources).toEqual([{ id: earmark.id, sourceName: "Example source", conditions: "Private condition text" }]);
  });
});
