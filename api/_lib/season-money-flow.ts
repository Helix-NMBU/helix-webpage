import { formatOre } from "./finance-money.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { SeasonMoneyFlow } from "../../src/features/ProjectManagement/season-financials-types.js";

/** Aggregate only, never returns funding sources or individual purchase details. */
export async function loadSeasonMoneyFlow(db: CvDatabase, seasonCode: string | null): Promise<SeasonMoneyFlow> {
  if (!seasonCode) return { status: "no-season" };
  try {
    const { rows } = await db.query<{ money_in_ore: string; money_out_ore: string }>(`
      select
        coalesce((select sum(f.amount_ore) from finance.funding f
          where f.season_id=s.id and f.funding_type='sponsor_cash' and f.status='received'), 0)::text as money_in_ore,
        coalesce((select sum(l.amount_ore) from finance.purchases p
          join finance.purchase_lines l on l.purchase_id=p.id
          where p.season_id=s.id and p.status='registered'
            and (case when p.payment_method='team_account' and p.document_kind='receipt' then true
            when p.payment_method='outlay' then exists (
              select 1 from finance.outlay_reimbursements r where r.purchase_id=p.id and r.paid
            ) else exists (
              select 1 from finance.invoice_obligations i where i.purchase_id=p.id and i.paid
            ) end)), 0)::text as money_out_ore
      from finance.seasons s where s.code=$1`, [seasonCode]);
    const row = rows[0];
    if (!row || !/^\d+$/.test(row.money_in_ore) || !/^\d+$/.test(row.money_out_ore)) return { status: "unavailable" };
    return { status: "available", moneyInNok: formatOre(BigInt(row.money_in_ore)), moneyOutNok: formatOre(BigInt(row.money_out_ore)) };
  } catch {
    return { status: "unavailable" };
  }
}
