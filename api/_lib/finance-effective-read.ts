import type { CvDatabase } from "./member-cv-service.js";
import type { FinanceApprovalPresence } from "./finance-types.js";
export interface EffectiveFinancePresence {
  approvedPresence: FinanceApprovalPresence;
  hasRecordedActuals: boolean;
}
export async function loadEffectiveFinancePresence(query: CvDatabase["query"], seasonCode: string | null): Promise<EffectiveFinancePresence> {
  if (!seasonCode) return { approvedPresence: { legacyBudget: false, projectBudgets: false }, hasRecordedActuals: false };
  const row = (await query<{ legacy: boolean; project: boolean; actual: boolean }>(`select
    exists(select 1 from finance.budgets b join finance.seasons s on s.id=b.season_id where s.code=$1 and b.status='approved') as legacy,
    exists(select 1 from finance.project_budgets h join finance.seasons s on s.id=h.season_id where s.code=$1 and h.approved_version_id is not null) as project,
    exists(select 1 from finance.purchases p join finance.seasons s on s.id=p.season_id where s.code=$1 and p.status='registered') as actual`, [seasonCode])).rows[0];
  if (!row) throw new Error("Effective financial presence is unavailable.");
  return { approvedPresence: { legacyBudget: row.legacy, projectBudgets: row.project }, hasRecordedActuals: row.actual };
}

/** Same recorded allocation source for current scenarios and historical restricted-funding usage. */
export const REGISTERED_ACTUAL_ORE = `(select coalesce(sum(actual.amount_ore),0) from finance.registered_allocation_facts actual where actual.budget_item_id=i.id)`;
export const REGISTERED_PURCHASE_COUNT = `(select count(distinct actual.purchase_id) from finance.registered_allocation_facts actual where actual.budget_item_id=i.id)`;
export const OPEN_APPROVED_COMMITMENT_ORE = `finance.budget_item_open_commitment_ore(i.id)`;
