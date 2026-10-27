import { queryRequestFulfilledOre, loadRequestFulfillmentSummaries } from "./finance-commitment.js";
import { formatOre } from "./finance-money.js";
import { requestRemainingOre } from "../../src/features/Finance/commitment-domain.js";
import type { CvDatabase } from "./member-cv-service.js";
import type {
  BudgetChoices,
  FinanceCapabilitySet,
  FinanceRequestContext,
  HeadDecisionQueueItem,
  OwnRequestDetail,
  OwnRequestSummary,
  RequestDecisionRecord,
  RequestRevisionRecord,
} from "./finance-types.js";

type Query = <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;

export async function summarizeOwnRequests(query: Query, memberId: string): Promise<OwnRequestSummary[]> {
  const rows = await query<{
    id: string;
    public_ref: string;
    status: OwnRequestSummary["status"];
    planned_date: string | null;
    approved_total: string | null;
    released_ore: string;
  }>(
    `select r.id,
            r.public_ref,
            r.status,
            r.planned_date::text as planned_date,
            (
              select coalesce(sum(l.approved_ore), 0)::text
              from finance.request_lines l
              join finance.request_revisions rev on rev.id = l.revision_id
              where rev.id = r.approved_revision_id
            ) as approved_total,
            r.released_ore::text as released_ore
     from finance.requests r
     where r.requester_member_id = $1::uuid
     order by r.public_ref`,
    [memberId],
  );
  const summaries: OwnRequestSummary[] = [];
  for (const row of rows.rows) {
    const approvedOre = row.approved_total != null ? BigInt(row.approved_total) : null;
    const releasedOre = BigInt(row.released_ore);
    const fulfilledOre = approvedOre == null ? 0n : await queryRequestFulfilledOre(query, row.id);
    const remainingOre = approvedOre == null
      ? 0n
      : requestRemainingOre(approvedOre, fulfilledOre, releasedOre, row.status);
    summaries.push({
      id: row.id,
      publicRef: row.public_ref,
      status: row.status,
      plannedDate: row.planned_date,
      approvedNok: approvedOre == null ? null : formatOre(approvedOre),
      fulfilledNok: formatOre(fulfilledOre),
      remainingNok: formatOre(remainingOre),
      releasedNok: formatOre(releasedOre),
    });
  }
  return summaries;
}

export async function loadFinanceRequestContext(query: Query, seasonCode: string): Promise<FinanceRequestContext[]> {
  const rows = await query<{
    id: string;
    public_ref: string;
    status: FinanceRequestContext["status"];
    supplier_name: string | null;
    planned_date: string | null;
    requester_member_id: string;
  }>(
    `select r.id, r.public_ref, r.status, r.supplier_name, r.planned_date::text as planned_date, r.requester_member_id
     from finance.requests r
     join finance.seasons s on s.id = r.season_id
     where s.code = $1
     order by r.public_ref`,
    [seasonCode],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    publicRef: row.public_ref,
    status: row.status,
    supplierName: row.supplier_name,
    plannedDate: row.planned_date,
    requesterMemberId: row.requester_member_id,
  }));
}

export async function loadDecisionQueue(query: Query, seasonCode: string): Promise<HeadDecisionQueueItem[]> {
  const rows = await query<{
    id: string;
    public_ref: string;
    requester_member_id: string;
    revision_id: string;
    revision_number: number;
    supplier_name: string;
    justification: string;
    planned_date: string;
    late_reason: string | null;
    total_estimated: string;
    submitted_at: string;
    lines: Array<{
      id: string; budgetItemId: string; budgetItemPublicRef: string;
      budgetItemDescription: string; systemName: string; description: string; estimatedOre: string;
    }>;
  }>(
    `select r.id,
            r.public_ref,
            r.requester_member_id,
            rev.id as revision_id,
            rev.revision_number,
            rev.supplier_name,
            rev.justification,
            rev.planned_date::text as planned_date,
            rev.late_reason,
            coalesce(sum(l.estimated_ore), 0)::text as total_estimated,
            rev.submitted_at::text as submitted_at,
            jsonb_agg(jsonb_build_object(
              'id', l.id, 'budgetItemId', l.budget_item_id,
              'budgetItemPublicRef', item.public_ref, 'budgetItemDescription', item.description,
              'systemName', sys.name, 'description', l.description,
              'estimatedOre', l.estimated_ore::text
            ) order by l.ordinal) as lines
     from finance.requests r
     join finance.seasons s on s.id = r.season_id
     join finance.request_revisions rev on rev.id = r.submitted_revision_id
     join finance.request_lines l on l.revision_id = rev.id
     join finance.budget_items item on item.id = l.budget_item_id
     join finance.systems sys on sys.id = item.system_id
     where s.code = $1 and r.status = 'submitted'
     group by r.id, rev.id
     order by rev.submitted_at`,
    [seasonCode],
  );
  return rows.rows.map((row) => ({
    id: row.id,
    publicRef: row.public_ref,
    requesterMemberId: row.requester_member_id,
    revisionId: row.revision_id,
    revisionNumber: row.revision_number,
    supplierName: row.supplier_name,
    justification: row.justification,
    plannedDate: row.planned_date,
    lateReason: row.late_reason,
    totalEstimatedNok: formatOre(BigInt(row.total_estimated)),
    submittedAt: row.submitted_at,
    lines: row.lines.map(({ estimatedOre, ...line }) => ({ ...line, estimatedNok: formatOre(BigInt(estimatedOre)) })),
  }));
}

async function loadRevisions(query: Query, requestId: string): Promise<RequestRevisionRecord[]> {
  const revisions = await query<{
    id: string;
    revision_number: number;
    supplier_name: string;
    justification: string;
    planned_date: string;
    late_reason: string | null;
    submitted_at: string;
  }>(
    `select id, revision_number, supplier_name, justification, planned_date::text as planned_date, late_reason, submitted_at::text as submitted_at
     from finance.request_revisions
     where request_id = $1::uuid
     order by revision_number`,
    [requestId],
  );
  const result: RequestRevisionRecord[] = [];
  for (const revision of revisions.rows) {
    const lines = await query<{
      id: string;
      budget_item_id: string;
      description: string;
      estimated_ore: string;
      approved_ore: string | null;
    }>(
      `select id, budget_item_id, description, estimated_ore::text as estimated_ore, approved_ore::text as approved_ore
       from finance.request_lines
       where revision_id = $1::uuid
       order by ordinal`,
      [revision.id],
    );
    const decisionRows = await query<{
      revision_id: string;
      decision: RequestDecisionRecord["decision"];
      reason: string;
      actor_member_id: string;
      decided_at: string;
    }>(
      `select revision_id, decision, reason, actor_member_id, decided_at::text as decided_at
       from finance.request_decisions
       where revision_id = $1::uuid`,
      [revision.id],
    );
    const decision = decisionRows.rows[0];
    result.push({
      id: revision.id,
      revisionNumber: revision.revision_number,
      supplierName: revision.supplier_name,
      justification: revision.justification,
      plannedDate: revision.planned_date,
      lateReason: revision.late_reason,
      submittedAt: revision.submitted_at,
      lines: lines.rows.map((line) => ({
        id: line.id,
        budgetItemId: line.budget_item_id,
        description: line.description,
        estimatedNok: formatOre(BigInt(line.estimated_ore)),
        approvedNok: line.approved_ore == null ? null : formatOre(BigInt(line.approved_ore)),
      })),
      decision: decision
        ? {
          revisionId: decision.revision_id,
          revisionNumber: revision.revision_number,
          decision: decision.decision,
          reason: decision.reason,
          actorMemberId: decision.actor_member_id,
          decidedAt: decision.decided_at,
        }
        : null,
    });
  }
  return result;
}

export async function loadOwnRequestDetail(
  query: Query,
  memberId: string,
  requestId: string,
  capabilities: FinanceCapabilitySet,
): Promise<OwnRequestDetail | null> {
  const rows = await query<{
    id: string;
    public_ref: string;
    status: OwnRequestDetail["status"];
    revision: number;
    supplier_name: string | null;
    justification: string | null;
    planned_date: string | null;
    late_reason: string | null;
    close_reason: string | null;
    released_ore: string;
    submitted_revision_id: string | null;
    approved_revision_id: string | null;
    requester_member_id: string;
  }>(
    `select id, public_ref, status, revision, supplier_name, justification, planned_date::text as planned_date,
            late_reason, close_reason, released_ore::text as released_ore,
            submitted_revision_id, approved_revision_id, requester_member_id
     from finance.requests
     where id = $1::uuid`,
    [requestId],
  );
  const row = rows.rows[0];
  if (!row) return null;
  const isOwner = row.requester_member_id === memberId;
  const financeView = capabilities.purchaseRegister && !isOwner;
  if (!isOwner && !financeView) return null;

  const draftLines = isOwner
    ? (await query<{ budget_item_id: string; description: string; estimated_ore: string }>(
      `select budget_item_id, description, estimated_ore::text as estimated_ore
       from finance.request_draft_lines
       where request_id = $1::uuid
       order by ordinal`,
      [requestId],
    )).rows.map((line) => ({
      budgetItemId: line.budget_item_id,
      description: line.description,
      estimatedNok: formatOre(BigInt(line.estimated_ore)),
    }))
    : [];

  const revisions = await loadRevisions(query, requestId);
  const approvedRows = await query<{ total: string }>(
    `select coalesce(sum(approved_ore), 0)::text as total
     from finance.request_lines
     where revision_id = $1::uuid`,
    [row.approved_revision_id],
  );
  const approvedOre = row.approved_revision_id ? BigInt(approvedRows.rows[0]?.total ?? "0") : null;
  const releasedOre = BigInt(row.released_ore);
  const fulfilledOre = approvedOre == null ? 0n : await queryRequestFulfilledOre(query, requestId);
  const remainingOre = approvedOre == null
    ? 0n
    : requestRemainingOre(approvedOre, fulfilledOre, releasedOre, row.status);
  const fulfillments = isOwner
    ? await loadRequestFulfillmentSummaries(query, requestId, memberId)
    : undefined;

  return {
    id: row.id,
    publicRef: row.public_ref,
    status: row.status,
    revision: row.revision,
    supplierName: row.supplier_name,
    justification: isOwner ? row.justification : row.justification,
    plannedDate: row.planned_date,
    lateReason: isOwner ? row.late_reason : row.late_reason,
    closeReason: row.close_reason,
    releasedNok: formatOre(releasedOre),
    draftLines,
    submittedRevisionId: row.submitted_revision_id,
    approvedRevisionId: row.approved_revision_id,
    revisions: isOwner || financeView ? revisions : [],
    approvedNok: approvedOre == null ? null : formatOre(approvedOre),
    fulfilledNok: formatOre(fulfilledOre),
    remainingNok: formatOre(remainingOre),
    fulfillments,
  };
}

export async function loadRequestChoices(db: CvDatabase, seasonCode: string): Promise<BudgetChoices> {
  const rows = await db.query<{
    item_id: string;
    public_ref: string;
    description: string;
    system_id: string;
    status: string;
    system_code: string;
    system_name: string;
    department_key: string;
    active: boolean;
  }>(
    `select i.id as item_id, i.public_ref, i.description, i.system_id, i.status,
            s.code as system_code, s.name as system_name, s.department_key, s.active
     from finance.budget_items i
     join finance.budgets b on b.id = i.budget_id
     join finance.seasons se on se.id = b.season_id
     join finance.systems s on s.id = i.system_id
     where se.code = $1 and b.status = 'approved' and i.protected is not true and i.status <> 'cancelled'
     order by s.code, i.public_ref`,
    [seasonCode],
  );
  const systems = new Map<string, { id: string; code: string; name: string; departmentKey: string; active: boolean }>();
  const items = rows.rows.map((row) => {
    systems.set(row.system_id, {
      id: row.system_id,
      code: row.system_code,
      name: row.system_name,
      departmentKey: row.department_key,
      active: row.active,
    });
    return {
      id: row.item_id,
      publicRef: row.public_ref,
      description: row.description,
      systemId: row.system_id,
      status: row.status as BudgetChoices["items"][number]["status"],
    };
  });
  return {
    systems: [...systems.values()].map((system) => ({
      ...system,
      unbudgetedItemId: null,
      unbudgetedPublicRef: null,
    })),
    items,
  };
}
