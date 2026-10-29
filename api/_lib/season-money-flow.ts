import { formatOre } from "./finance-money.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { SeasonMoneyFlow } from "../../src/features/ProjectManagement/season-financials-types.js";

/** Aggregate only, never returns funding sources or individual purchase details. */
export async function loadSeasonMoneyFlow(db: CvDatabase, seasonCode: string | null): Promise<SeasonMoneyFlow> {
  if (!seasonCode) return { status: "no-season" };
  try {
    const { rows } = await db.query<{ end_year: number; month: string | null; direction: string | null; amount_ore: string | null }>(`
      with season as (select id, end_date from finance.seasons where code=$1),
      events as (
        select to_char(f.received_date, 'YYYY-MM') as month, 'in' as direction, f.amount_ore
        from finance.funding f join season s on s.id=f.season_id
        where f.funding_type='sponsor_cash' and f.status='received'
        union all
        select to_char(case when p.payment_method='team_account' and p.document_kind='receipt' then p.purchase_date
          when p.payment_method='outlay' then r.paid_on else i.paid_on end, 'YYYY-MM'), 'out', l.amount_ore
        from finance.purchases p join season s on s.id=p.season_id
        join finance.purchase_lines l on l.purchase_id=p.id
        left join finance.outlay_reimbursements r on r.purchase_id=p.id
        left join finance.invoice_obligations i on i.purchase_id=p.id
        where p.status='registered' and (case when p.payment_method='team_account' and p.document_kind='receipt' then true
          when p.payment_method='outlay' then coalesce(r.paid, false) else coalesce(i.paid, false) end)
      )
      select extract(year from s.end_date)::integer as end_year, e.month, e.direction, sum(e.amount_ore)::text as amount_ore
      from season s left join events e on true
      group by s.end_date, e.month, e.direction`, [seasonCode]);
    if (!rows.length || !Number.isInteger(rows[0].end_year)) return { status: "unavailable" };
    const endYear = rows[0].end_year;
    const months = Array.from({ length: 11 }, (_, index) => {
      const month = (index + 8) % 12 + 1;
      const year = index < 4 ? endYear - 1 : endYear;
      return { month: `${year}-${String(month).padStart(2, "0")}`, moneyInNok: "0.00", moneyOutNok: "0.00" };
    });
    const values = new Map(months.map(item => [item.month, { input: 0n, output: 0n }]));
    let input = 0n, output = 0n, otherIn = 0n, otherOut = 0n;
    for (const row of rows) {
      if (row.direction === null) continue;
      if (!row.amount_ore || !/^\d+$/.test(row.amount_ore) || (row.direction !== "in" && row.direction !== "out")) return { status: "unavailable" };
      const amount = BigInt(row.amount_ore);
      const bucket = row.month ? values.get(row.month) : undefined;
      if (row.direction === "in") { input += amount; if (bucket) bucket.input += amount; else otherIn += amount; }
      else { output += amount; if (bucket) bucket.output += amount; else otherOut += amount; }
    }
    for (const item of months) { const bucket = values.get(item.month)!; item.moneyInNok = formatOre(bucket.input); item.moneyOutNok = formatOre(bucket.output); }
    return { status: "available", moneyInNok: formatOre(input), moneyOutNok: formatOre(output), months, otherInNok: formatOre(otherIn), otherOutNok: formatOre(otherOut) };
  } catch {
    return { status: "unavailable" };
  }
}
