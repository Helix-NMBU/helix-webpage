import { derivePartUsage, earmarkedOre } from "../../src/features/Finance/funding.js";
import { formatOre } from "./finance-money.js";
import type { CvDatabase } from "./member-cv-service.js";
import type {
  FundingLinkedItem,
  FundingPartRecord,
  FundingRecord,
  FundingStatus,
  FundingType,
  PublicEarmarkSummary,
} from "./finance-types.js";

type Query = CvDatabase["query"];

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function usage(amountOre: bigint, eligibleSpentOre: bigint, spendBy: string | null, today: string) {
  return derivePartUsage(amountOre, eligibleSpentOre, spendBy, today);
}

export async function loadPublicEarmarks(query: Query, seasonCode: string, today: string): Promise<PublicEarmarkSummary[]> {
  const result = await query<{
    id: string;
    public_ref: string;
    purpose: string;
    amount_ore: string;
    spend_by: string | null;
    eligible_spent_ore: string;
    system_name: string | null;
  }>(
    `select p.id, p.public_ref, p.purpose, p.amount_ore::text as amount_ore, p.spend_by::text as spend_by,
            (
              select coalesce(sum(a.amount_ore), 0)::text
              from finance.budget_items i
              join finance.allocations a on a.budget_item_id = i.id
              join finance.purchase_lines l on l.id = a.line_id
              join finance.purchases pur on pur.id = l.purchase_id
              where i.earmark_id = p.id
                and pur.status = 'registered'
                and (p.spend_by is null or pur.purchase_date <= p.spend_by)
            ) as eligible_spent_ore,
            (
              select sys.name
              from finance.budget_items i
              join finance.systems sys on sys.id = i.system_id
              join finance.budgets b on b.id = i.budget_id
              where i.earmark_id = p.id
                and i.status <> 'cancelled'
                and b.status <> 'draft'
              order by sys.name
              limit 1
            ) as system_name
     from finance.funding_parts p
     join finance.funding f on f.id = p.funding_id
     join finance.seasons s on s.id = f.season_id
     where s.code = $1
       and f.status in ('secured', 'received')
     order by p.public_ref`,
    [seasonCode],
  );
  return result.rows.map((row) => {
    const amountOre = BigInt(row.amount_ore);
    const spendBy = dateOnly(row.spend_by);
    const derived = usage(amountOre, BigInt(row.eligible_spent_ore), spendBy, today);
    return {
      id: row.id,
      publicRef: row.public_ref,
      purpose: row.purpose,
      amountNok: formatOre(amountOre),
      usedNok: formatOre(derived.usedOre),
      leftNok: formatOre(derived.leftOre),
      mustReturnNok: formatOre(derived.mustReturnOre),
      spendBy,
      systemName: row.system_name,
    };
  });
}

export async function loadFundingRecords(query: Query, seasonCode: string, today: string, includeDraftItems: boolean): Promise<{ funding: FundingRecord[]; parts: FundingPartRecord[] }> {
  const [fundingRows, partRows, itemRows] = await Promise.all([
    query<{
      id: string;
      public_ref: string;
      source_name: string;
      owner_name: string;
      funding_type: FundingType;
      amount_ore: string;
      status: FundingStatus;
      confidence: FundingRecord["confidence"];
      expected_date: string | null;
      received_date: string | null;
      owner_email: string | null;
      reporting_required: boolean;
      agreement_link: string | null;
      note: string | null;
      revision: number;
    }>(
      `select f.id, f.public_ref, f.source_name, f.owner_name, f.funding_type, f.amount_ore::text as amount_ore,
              f.status, f.confidence, f.expected_date::text as expected_date, f.received_date::text as received_date,
              f.owner_email, f.reporting_required, f.agreement_link, f.note, f.revision
       from finance.funding f
       join finance.seasons s on s.id = f.season_id
       where s.code = $1
       order by f.public_ref`,
      [seasonCode],
    ),
    query<{
      id: string;
      public_ref: string;
      funding_id: string;
      purpose: string;
      amount_ore: string;
      spend_by: string | null;
      conditions: string | null;
      revision: number;
      eligible_spent_ore: string;
    }>(
      `select p.id, p.public_ref, p.funding_id, p.purpose, p.amount_ore::text as amount_ore,
              p.spend_by::text as spend_by, p.conditions, p.revision,
              (
                select coalesce(sum(a.amount_ore), 0)::text
                from finance.budget_items i
                join finance.allocations a on a.budget_item_id = i.id
                join finance.purchase_lines l on l.id = a.line_id
                join finance.purchases pur on pur.id = l.purchase_id
                where i.earmark_id = p.id
                  and pur.status = 'registered'
                  and (p.spend_by is null or pur.purchase_date <= p.spend_by)
              ) as eligible_spent_ore
       from finance.funding_parts p
       join finance.funding f on f.id = p.funding_id
       join finance.seasons s on s.id = f.season_id
       where s.code = $1
       order by p.public_ref`,
      [seasonCode],
    ),
    query<{
      earmark_id: string;
      id: string;
      public_ref: string;
      description: string;
      status: FundingLinkedItem["status"];
      system_id: string;
      system_code: string;
      system_name: string;
    }>(
      `select i.earmark_id, i.id, i.public_ref, i.description, i.status,
              sys.id as system_id, sys.code as system_code, sys.name as system_name
       from finance.budget_items i
       join finance.systems sys on sys.id = i.system_id
       join finance.budgets b on b.id = i.budget_id
       join finance.funding_parts p on p.id = i.earmark_id
       join finance.funding f on f.id = p.funding_id
       join finance.seasons s on s.id = f.season_id
       where s.code = $1
         and i.status <> 'cancelled'
         and ($2::boolean or b.status <> 'draft')
       order by sys.name, i.public_ref`,
      [seasonCode, includeDraftItems],
    ),
  ]);

  const itemsByPart = new Map<string, FundingLinkedItem[]>();
  for (const row of itemRows.rows) {
    const item: FundingLinkedItem = {
      id: row.id,
      publicRef: row.public_ref,
      description: row.description,
      systemId: row.system_id,
      systemCode: row.system_code,
      systemName: row.system_name,
      status: row.status,
    };
    const list = itemsByPart.get(row.earmark_id) ?? [];
    list.push(item);
    itemsByPart.set(row.earmark_id, list);
  }

  const partOre = new Map<string, bigint[]>();
  const parts = partRows.rows.map((row): FundingPartRecord => {
    const amountOre = BigInt(row.amount_ore);
    const spendBy = dateOnly(row.spend_by);
    const derived = usage(amountOre, BigInt(row.eligible_spent_ore), spendBy, today);
    const linkedItems = itemsByPart.get(row.id) ?? [];
    const amounts = partOre.get(row.funding_id) ?? [];
    amounts.push(amountOre);
    partOre.set(row.funding_id, amounts);
    return {
      id: row.id,
      publicRef: row.public_ref,
      fundingId: row.funding_id,
      purpose: row.purpose,
      amountNok: formatOre(amountOre),
      spendBy,
      conditions: row.conditions,
      revision: Number(row.revision),
      usedNok: formatOre(derived.usedOre),
      leftNok: formatOre(derived.leftOre),
      mustReturnNok: formatOre(derived.mustReturnOre),
      overdue: derived.overdue,
      systemName: linkedItems[0]?.systemName ?? null,
      linkedItems,
    };
  });

  const funding = fundingRows.rows.map((row): FundingRecord => {
    const amountOre = BigInt(row.amount_ore);
    const related = parts.filter((part) => part.fundingId === row.id);
    const earmarked = earmarkedOre(partOre.get(row.id) ?? []);
    return {
      id: row.id,
      publicRef: row.public_ref,
      sourceName: row.source_name,
      ownerName: row.owner_name,
      fundingType: row.funding_type,
      amountNok: formatOre(amountOre),
      status: row.status,
      confidence: row.confidence,
      expectedDate: dateOnly(row.expected_date),
      receivedDate: dateOnly(row.received_date),
      ownerEmail: row.owner_email,
      reportingRequired: row.reporting_required,
      agreementLink: row.agreement_link,
      note: row.note,
      revision: Number(row.revision),
      earmarkedNok: formatOre(earmarked),
      unrestrictedNok: formatOre(amountOre - earmarked),
      linkedItemCount: related.reduce((sum, part) => sum + part.linkedItems.length, 0),
    };
  });

  return { funding, parts };
}
