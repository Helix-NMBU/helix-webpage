import {
  buildDepartmentSummaries,
  calculateScenarios,
  nokToOre,
  presentFinanceOverview,
  usedFraction,
  type BudgetItemFact,
  type FundingFact,
  type FundingPartFact,
  type OverviewSystemFact,
} from "../../src/features/Finance/finance-calculations.js";
import { loadPublicEarmarks } from "./finance-funding-read.js";
import { formatOre } from "./finance-money.js";
import type { CvDatabase } from "./member-cv-service.js";
import type {
  BudgetItemPriority,
  BudgetItemStatus,
  FundingConfidence,
  FundingScenario,
  FundingStatus,
  PublicBudgetItem,
  PublicBudgets,
  PublicDepartmentBudget,
  PublicOverview,
  PublicSystemBudget,
} from "./finance-types.js";

type Query = CvDatabase["query"];

const OPEN_COMMITMENT_ORE = `
coalesce((
  select sum(
    case
      when r.status = 'approved'
       and r.approved_revision_id = rev.id
       and coalesce(rl.approved_ore, 0) > coalesce(linked.spent, 0)
      then coalesce(rl.approved_ore, 0) - coalesce(linked.spent, 0)
      else 0
    end
  )
  from finance.request_lines rl
  join finance.request_revisions rev on rev.id = rl.revision_id
  join finance.requests r on r.id = rev.request_id
  left join lateral (
    select coalesce(sum(pl.amount_ore), 0) as spent
    from finance.purchase_lines pl
    join finance.purchases p on p.id = pl.purchase_id
    where pl.request_line_id = rl.id
      and p.status = 'registered'
  ) linked on true
  where rl.budget_item_id = i.id
), 0)
`;

type ItemRow = {
  id: string;
  priority: BudgetItemPriority;
  status: BudgetItemStatus;
  planned_ore: string;
  protected: boolean;
  earmark_id: string | null;
  earmark_amount_ore: string | null;
  funding_id: string | null;
  funding_status: FundingStatus | null;
  funding_confidence: FundingConfidence | null;
  funding_amount_ore: string | null;
  system_id: string;
  actual_ore: string;
  commitment_ore: string;
};

type SystemRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  department_key: string;
  department_name: string;
  sort_order: number | string;
};

function ore(value: string | null | undefined): bigint {
  return BigInt(value ?? "0");
}

async function loadFacts(query: Query, seasonCode: string, includeDraftItems: boolean): Promise<{ items: ItemRow[]; systems: SystemRow[]; funding: FundingFact[]; parts: FundingPartFact[] }> {
  // All subqueries execute in one PostgreSQL statement snapshot, including on a pooled connection.
  // Decimal values are cast to text before JSON aggregation to preserve integer precision.
  const result = await query<{
    items: ItemRow[];
    systems: SystemRow[];
    funding: { id: string; status: FundingStatus; confidence: FundingConfidence | null; amount_ore: string }[];
    parts: { id: string; funding_id: string; amount_ore: string }[];
  }>(
    `select
      coalesce((select jsonb_agg(to_jsonb(items) order by items.id) from (
       select i.id, i.priority, i.status, i.planned_ore::text as planned_ore, i.protected,
              i.earmark_id, part.amount_ore::text as earmark_amount_ore,
              fund.id as funding_id, fund.status as funding_status, fund.confidence as funding_confidence,
              fund.amount_ore::text as funding_amount_ore, i.system_id,
              coalesce(act.actual_ore, 0)::text as actual_ore,
              (${OPEN_COMMITMENT_ORE})::text as commitment_ore
       from finance.budget_items i
       join finance.budgets b on b.id = i.budget_id
       join finance.seasons s on s.id = b.season_id
       left join finance.funding_parts part on part.id = i.earmark_id
       left join finance.funding fund on fund.id = part.funding_id
       left join lateral (
         select coalesce(sum(a.amount_ore), 0) as actual_ore
         from finance.allocations a
         join finance.purchase_lines l on l.id = a.line_id
         join finance.purchases p on p.id = l.purchase_id and p.status = 'registered'
         where a.budget_item_id = i.id
       ) act on true
       where s.code = $1
         and ($2::boolean or b.status = 'approved')
       ) items), '[]'::jsonb) as items,
      coalesce((select jsonb_agg(to_jsonb(systems) order by systems.sort_order, systems.department_name,
                                 systems.department_key, systems.name, systems.code) from (
       select sys.id, sys.code, sys.name, sys.active,
              d.department_key, d.name as department_name, d.sort_order
       from finance.systems sys
       join identity.departments d on d.department_key = sys.department_key
       ) systems), '[]'::jsonb) as systems,
      coalesce((select jsonb_agg(to_jsonb(funding) order by funding.id) from (
       select f.id, f.status, f.confidence, f.amount_ore::text as amount_ore
       from finance.funding f
       join finance.seasons s on s.id = f.season_id
       where s.code = $1
       ) funding), '[]'::jsonb) as funding,
      coalesce((select jsonb_agg(to_jsonb(parts) order by parts.id) from (
       select p.id, p.funding_id, p.amount_ore::text as amount_ore
       from finance.funding_parts p
       join finance.funding f on f.id = p.funding_id
       join finance.seasons s on s.id = f.season_id
       where s.code = $1
       ) parts), '[]'::jsonb) as parts`,
    [seasonCode, includeDraftItems],
  );
  const facts = result.rows[0];
  if (!facts) throw new Error("Could not load finance scenario facts.");
  return {
    items: facts.items,
    systems: facts.systems,
    funding: facts.funding.map((row) => ({ id: row.id, status: row.status, confidence: row.confidence, amountOre: ore(row.amount_ore) })),
    parts: facts.parts.map((row) => ({ id: row.id, fundingId: row.funding_id, amountOre: ore(row.amount_ore) })),
  };
}

function toItemFact(row: ItemRow): BudgetItemFact {
  const funding = row.funding_id && row.funding_status && row.funding_amount_ore
    ? { id: row.funding_id, status: row.funding_status, confidence: row.funding_confidence, amountOre: ore(row.funding_amount_ore) }
    : null;
  return {
    id: row.id,
    priority: row.priority,
    status: row.status,
    plannedOre: ore(row.planned_ore),
    actualOre: ore(row.actual_ore),
    commitmentOre: ore(row.commitment_ore),
    unallocated: row.protected === true,
    earmarkId: row.earmark_id,
    earmarkAmountOre: row.earmark_amount_ore === null ? null : ore(row.earmark_amount_ore),
    funding,
  };
}

function departmentFacts(systems: SystemRow[], items: ItemRow[]): OverviewSystemFact[] {
  const bySystem = new Map<string, BudgetItemFact[]>();
  for (const row of items) {
    const list = bySystem.get(row.system_id) ?? [];
    list.push(toItemFact(row));
    bySystem.set(row.system_id, list);
  }
  return systems.map((system) => ({
    id: system.id,
    code: system.code,
    name: system.name,
    active: system.active === true,
    departmentKey: system.department_key,
    departmentName: system.department_name,
    sortOrder: Number(system.sort_order),
    items: bySystem.get(system.id) ?? [],
  }));
}

function publicScenario(scenario: ReturnType<typeof calculateScenarios>[number]): FundingScenario {
  return {
    key: scenario.key,
    label: scenario.label,
    eligibleFundingNok: scenario.eligibleFundingNok,
    earmarkedNok: scenario.earmarkedNok,
    unrestrictedNok: scenario.unrestrictedNok,
    needNok: scenario.needNok,
    restrictedCoverNok: scenario.restrictedCoverNok,
    generalNeedNok: scenario.generalNeedNok,
    shortfallNok: scenario.shortfallNok,
  };
}

export async function loadFundingScenarios(query: Query, seasonCode: string, includeDraftItems: boolean): Promise<FundingScenario[]> {
  const facts = await loadFacts(query, seasonCode, includeDraftItems);
  return calculateScenarios(facts.items.map(toItemFact), facts.funding, facts.parts).map(publicScenario);
}

export async function loadOverview(query: Query, input: {
  viewVersion: number;
  seasonCode: string | null;
  budgetStatus: PublicOverview["budgetStatus"];
  approvedOn: string | null;
  showAggregates: boolean;
  showPrivate: boolean;
  includeDraftItems: boolean;
  today: string;
}): Promise<PublicOverview> {
  if (!input.seasonCode) {
    return presentFinanceOverview({
      viewVersion: input.viewVersion,
      seasonCode: null,
      budgetStatus: input.budgetStatus,
      approvedOn: input.approvedOn,
      departments: [],
      publicEarmarks: [],
      scenarios: [],
      earmarkSources: [],
      showAggregates: false,
      showPrivate: input.showPrivate,
    });
  }
  const seasonCode = input.seasonCode;
  const [publicEarmarks, facts, sources] = await Promise.all([
    loadPublicEarmarks(query, seasonCode, input.today),
    input.showAggregates || input.showPrivate ? loadFacts(query, seasonCode, input.includeDraftItems) : Promise.resolve(null),
    input.showPrivate
      ? query<{ id: string; source_name: string; conditions: string | null }>(
        `select p.id, f.source_name, p.conditions
         from finance.funding_parts p
         join finance.funding f on f.id = p.funding_id
         join finance.seasons s on s.id = f.season_id
         where s.code = $1
           and f.status in ('secured', 'received')
         order by p.public_ref`,
        [seasonCode],
      )
      : Promise.resolve({ rows: [] as { id: string; source_name: string; conditions: string | null }[] }),
  ]);
  const scenarios = facts ? calculateScenarios(facts.items.map(toItemFact), facts.funding, facts.parts).map(publicScenario) : [];
  const departments = facts && input.showAggregates ? buildDepartmentSummaries(departmentFacts(facts.systems, facts.items)) : [];
  return presentFinanceOverview({
    viewVersion: input.viewVersion,
    seasonCode,
    budgetStatus: input.budgetStatus,
    approvedOn: input.approvedOn,
    departments,
    publicEarmarks,
    scenarios,
    earmarkSources: sources.rows.map((row) => ({ id: row.id, sourceName: row.source_name, conditions: row.conditions })),
    showAggregates: input.showAggregates,
    showPrivate: input.showPrivate,
  });
}

function withUse<T extends { plannedNok: string; actualNok: string; commitmentNok?: string; usedFraction?: string | null }>(
  entry: T,
  commitmentOre: bigint,
): T {
  return {
    ...entry,
    commitmentNok: formatOre(commitmentOre),
    usedFraction: usedFraction(nokToOre(entry.actualNok), nokToOre(entry.plannedNok)),
  };
}

export async function attachCommitmentSummaries(query: Query, budgets: PublicBudgets, seasonCode: string | null): Promise<PublicBudgets> {
  if (!seasonCode || budgets.departments.length === 0) return budgets;
  const rows = await query<{ id: string; commitment_ore: string }>(
    `select i.id, (${OPEN_COMMITMENT_ORE})::text as commitment_ore
     from finance.budget_items i
     join finance.budgets b on b.id = i.budget_id
     join finance.seasons s on s.id = b.season_id
     where s.code = $1`,
    [seasonCode],
  );
  const commitment = new Map(rows.rows.map((row) => [row.id, ore(row.commitment_ore)]));
  const departments = budgets.departments.map((department): PublicDepartmentBudget => {
    let departmentCommitment = 0n;
    const systems = department.systems.map((system): PublicSystemBudget => {
      let systemCommitment = commitment.get(system.unbudgetedItemId ?? "") ?? 0n;
      const items = system.items.map((item): PublicBudgetItem => {
        const itemCommitment = commitment.get(item.id) ?? 0n;
        systemCommitment += itemCommitment;
        return {
          ...item,
          commitmentNok: formatOre(itemCommitment),
          usedFraction: usedFraction(nokToOre(item.actualNok), nokToOre(item.effectivePlanNok)),
        };
      });
      departmentCommitment += systemCommitment;
      return { ...withUse(system, systemCommitment), items };
    });
    return { ...withUse(department, departmentCommitment), systems };
  });
  return { ...budgets, departments };
}
