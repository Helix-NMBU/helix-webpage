import type { CvDatabase } from "./member-cv-service.js";
import type { WonIncomeRecord } from "../../src/features/Finance/types.js";
import { formatOre } from "./finance-money.js";

/** Minimal agreed cash facts, called only after Finance financing access is verified.
 * Completing the linked invoicing task is the team's invoice-sent signal.
 */
export async function loadWonIncome(query: CvDatabase["query"], seasonCode: string): Promise<WonIncomeRecord[]> {
  const result = await query<{ opportunity_kind: "deal" | "grant"; contribution_id: string; deal_id: string; title: string; source_name: string; amount_ore: string; funding_id: string | null; planned_invoice_date: string | null; invoice_sent: boolean; invoice_sent_on: string | null }>(`
    select coalesce(to_jsonb(d)->>'opportunity_kind','deal') as opportunity_kind,c.id as contribution_id,d.id as deal_id,d.title,o.name as source_name,
           c.amount_ore::text as amount_ore,l.funding_id,c.invoice_date::text as planned_invoice_date,
           coalesce(invoice.status='done',false) as invoice_sent,
           case when invoice.status='done' then (invoice.completed_at at time zone 'Europe/Oslo')::date::text else null end as invoice_sent_on
    from partner_deals.deals d
    join partner.organizations o on o.id=d.organization_id
    join partner_deals.contributions c on c.deal_id=d.id
    join finance.seasons s on s.id=c.season_id
    left join partner_deals.funding_links l on l.contribution_id=c.id
    left join lateral (
      select t.status,t.completed_at from partner_deals.task_links tl
      join project_management.tasks t on t.id=tl.task_id
      where tl.deal_id=d.id and tl.season_id=c.season_id and tl.kind='invoice'
        and (tl.contribution_id=c.id or tl.contribution_id is null)
      order by (tl.contribution_id=c.id) desc nulls last limit 1
    ) invoice on true
    where s.code=$1 and d.stage='won' and d.cancelled_at is null
      and c.kind='cash' and c.amount_ore>0 and c.retired_at is null and c.pending_change_id is null
    order by o.name,c.id`, [seasonCode]);
  return result.rows.map(row=>({opportunityKind:row.opportunity_kind,contributionId:row.contribution_id,dealId:row.deal_id,title:row.title,sourceName:row.source_name,amountNok:formatOre(BigInt(row.amount_ore)),fundingId:row.funding_id,plannedInvoiceDate:row.planned_invoice_date,invoiceSent:row.invoice_sent,invoiceSentOn:row.invoice_sent_on}));
}
