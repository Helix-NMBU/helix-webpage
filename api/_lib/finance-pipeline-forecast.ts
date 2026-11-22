import type { CvDatabase } from "./member-cv-service.js";
import { formatOre } from "./finance-money.js";
import { dealConfidence } from "../../src/features/PartnerDeals/confidence.js";
import type { PipelineIncomeRecord } from "../../src/features/Finance/types.js";

/** Called only after Finance's financing capability has been revalidated.
 * Exposes cash forecast facts, never pipeline contacts or negotiation details.
 */
export async function loadPipelineIncomeForecast(query: CvDatabase["query"], seasonCode: string): Promise<PipelineIncomeRecord[]> {
  const result = await query<{ contribution_id: string; funding_id: string | null; amount_ore: string; invoice_date: string | null; probability: number | null }>(`
    select c.id as contribution_id, l.funding_id, c.amount_ore::text as amount_ore,
           c.invoice_date::text as invoice_date, case when d.stage='won' then 100 else d.probability end as probability
    from partner_deals.contributions c
    join partner_deals.deals d on d.id=c.deal_id
    join finance.seasons s on s.id=c.season_id
    left join partner_deals.funding_links l on l.contribution_id=c.id
    left join finance.funding f on f.id=l.funding_id
    where s.code=$1 and c.kind='cash' and c.amount_ore>0
      and d.stage<>'lost' and d.cancelled_at is null
      and c.retired_at is null and c.pending_change_id is null
      and (f.id is null or f.status not in ('received','deleted'))
    order by c.invoice_date nulls last,c.id`, [seasonCode]);
  return result.rows.map(row => ({ contributionId: row.contribution_id, fundingId: row.funding_id, amountNok: formatOre(BigInt(row.amount_ore)), confidence: dealConfidence(row.probability), invoiceDate: row.invoice_date }));
}
