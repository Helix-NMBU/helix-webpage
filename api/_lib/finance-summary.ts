import {allocatedSystemCatalog} from "../../src/features/Finance/department-allocation.js";
import { OPEN_APPROVED_COMMITMENT_ORE } from "./finance-effective-read.js";
import {
  buildDepartmentSummaries,
  calculateScenarios,
  presentFinanceOverview,
  type BudgetItemFact,
  type FundingFact,
  type FundingPartFact,
  type OverviewSystemFact,
} from "../../src/features/Finance/finance-calculations.js";
import { loadPublicEarmarks } from "./finance-funding-read.js";
import type { CvDatabase } from "./member-cv-service.js";
import type {
  EffectiveBudgetItemPriority,
  BudgetItemStatus,
  FundingConfidence,
  FundingScenario,
  FundingStatus,
  PublicOverview,
} from "./finance-types.js";

type Query = CvDatabase["query"];


type ItemRow = {
  id: string;
  department_key:string; department_name:string; sort_order:number;
  priority: EffectiveBudgetItemPriority;
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
  restricted_actual: { partId: string; amountOre: string }[];
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
       select i.id, allocation.department_key,allocated_department.name as department_name,allocated_department.sort_order, i.priority, i.status, allocation.planned_ore::text as planned_ore, i.protected,
              i.earmark_id, part.amount_ore::text as earmark_amount_ore,
              fund.id as funding_id, fund.status as funding_status, fund.confidence as funding_confidence,
              fund.amount_ore::text as funding_amount_ore, i.system_id,
              allocation.actual_ore::text as actual_ore,
              allocation.commitment_ore::text as commitment_ore,
              coalesce((select jsonb_agg(jsonb_build_object('partId',recorded_earmark_id,'amountOre',amount_ore::text)) from (
                select actual.recorded_earmark_id,sum(actual.amount_ore) as amount_ore
                from finance.registered_allocation_facts actual join finance.funding_parts recorded_part on recorded_part.id=actual.recorded_earmark_id
                where actual.budget_item_id=i.id
                group by actual.recorded_earmark_id) recorded),'[]'::jsonb) as restricted_actual
       from finance.effective_budget_entries i
       join finance.department_entry_financials allocation on allocation.entry_id=i.id
       join identity.departments allocated_department on allocated_department.department_key=allocation.department_key
       join finance.seasons s on s.id = i.season_id
       left join finance.funding_parts part on part.id = i.earmark_id
       left join finance.funding fund on fund.id = part.funding_id
       where s.code = $1
         and ($2::boolean or i.approved_version_id is not null or i.legacy_budget_status='approved' or i.protected
           or exists(select 1 from finance.registered_allocation_facts actual where actual.budget_item_id=i.id)
           or ${OPEN_APPROVED_COMMITMENT_ORE}>0)
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
    restrictedActual: row.restricted_actual.map(actual => ({ partId: actual.partId, amountOre: ore(actual.amountOre) })),
  };
}

function departmentFacts(systems: SystemRow[], items: ItemRow[]): OverviewSystemFact[] {
  const physical=systems.map(system=>({id:system.id,code:system.code,name:system.name,active:system.active,departmentKey:system.department_key,departmentName:system.department_name,sortOrder:Number(system.sort_order)}));
  const departments=[...systems.map(system=>({departmentKey:system.department_key,departmentName:system.department_name,sortOrder:Number(system.sort_order)})),...items.map(item=>({departmentKey:item.department_key,departmentName:item.department_name,sortOrder:Number(item.sort_order)}))];
  return allocatedSystemCatalog(physical,departments,items.map(item=>({systemId:item.system_id,departmentKey:item.department_key}))).map(system=>({...system,items:items.filter(item=>item.system_id===system.id&&item.department_key===system.departmentKey).map(toItemFact)}));
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

// The Season Overview receives a deliberately narrower projection in its own service.
// Reuse the same item/system calculations as Financials without exposing scenarios.
export async function loadDepartmentSummaries(query: Query, seasonCode: string, includeDraftItems: boolean) {
  const facts = await loadFacts(query, seasonCode, includeDraftItems);
  return buildDepartmentSummaries(departmentFacts(facts.systems, facts.items));
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
  approvedPresence?: PublicOverview["approvedPresence"];
  hasRecordedActuals?: boolean;
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
      approvedPresence: input.approvedPresence,
      hasRecordedActuals: input.hasRecordedActuals,
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
    approvedPresence: input.approvedPresence,
    hasRecordedActuals: input.hasRecordedActuals,
    departments,
    publicEarmarks,
    scenarios,
    earmarkSources: sources.rows.map((row) => ({ id: row.id, sourceName: row.source_name, conditions: row.conditions })),
    showAggregates: input.showAggregates,
    showPrivate: input.showPrivate,
  });
}
