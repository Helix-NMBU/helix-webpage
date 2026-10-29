import pg from "pg";
import { MemberCvError } from "./member-cv-error.js";
import { neonCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

type DealView = "pipeline" | "shared";
export class DuplicateFundingError extends MemberCvError { readonly code = "funding_possible_duplicate"; }
export class FundingMismatchError extends MemberCvError { readonly code = "funding_mismatch"; }
export type DealWorkspace = { canManage: boolean; canReviewFunding: boolean; canViewFinance: boolean; deals: unknown[]; organizations: unknown[]; seasons: unknown[] };
export type FundingCandidate = { id: string; revision: number; reference: string; status: string; amountOre: string; expectedDate: string | null };
export type FundingCandidates = { contributionId: string; amountOre: string; linkedFundingId: string | null; candidates: FundingCandidate[] };
export interface DealServices {
  load(token: string, view: DealView): Promise<DealWorkspace>;
  reviewNotifications(token: string): Promise<unknown[]>;
  markReviewNotificationsRead(token: string, ids: unknown): Promise<{ ok: true }>;
  recordAgreementChange(token: string, dealId: unknown, revision: unknown, kind: unknown, reason: unknown, terms: unknown, confirmed: unknown): Promise<{id:string}>;
  resolveAgreementChange(token: string, changeId: unknown, note: unknown, confirmed: unknown, manualConfirmed: unknown): Promise<{id:string}>;
  withdrawAgreementChange(token: string, changeId: unknown, note: unknown, confirmed: unknown): Promise<{id:string}>;
  requestFinanceReview(token: string, dealId: unknown, revision: unknown): Promise<{ count: number }>;
  financeReviewQueue(token: string): Promise<unknown[]>;
  resolveFinanceReview(token: string, reviewId: unknown, action: unknown, fundingId: unknown, revision: unknown, snapshot: unknown, confirmed: unknown): Promise<{ ok: true }>;
  taskDeal(token: string, taskId: unknown): Promise<{ dealId: string | null }>;
  createOrganization(token: string, name: unknown): Promise<{ id: string }>;
  renameOrganization(token: string, id: unknown, revision: unknown, name: unknown): Promise<{ id: string }>;
  save(token: string, body: unknown): Promise<{ id: string }>;
  linkFunding(token: string, contributionId: unknown, fundingId: unknown, expectedRevision: unknown): Promise<{ ok: true }>;
  unlinkFunding(token: string, contributionId: unknown): Promise<{ ok: true }>;
  fundingCandidates(token: string, contributionId: unknown): Promise<FundingCandidates>;
  approveSeparateFunding(token: string, contributionId: unknown, snapshot: unknown, confirmed: unknown): Promise<{ ok: true }>;
  confirmWon(token: string, dealId: unknown, revision: unknown, confirmed: unknown): Promise<{ id: string }>;
}

// One SQL statement binds the projection to the current grant and linked Google identity.
// The shared view never includes pre-won deals or private negotiation notes.
const readSql = `select caps.pipeline as "canManage",
 coalesce((select jsonb_agg(jsonb_build_object(
  'id',d.id,'organizationId',d.organization_id,'organizationName',o.name,'title',d.title,'stage',d.stage,
  'ownerMemberId',d.owner_member_id,'contactName',d.contact_name,'contactEmail',d.contact_email,
  'startsOn',d.starts_on,'endsOn',d.ends_on,'agreementLink',d.agreement_link,'revision',d.revision,
  'wonAt',d.won_at,'wonByMemberId',d.won_by_member_id,'cancelledAt',d.cancelled_at,
  'changes',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'kind',ac.kind,'reason',ac.reason,'beforeTerms',ac.before_terms,'proposedTerms',ac.proposed_terms,'status',ac.status,'createdAt',ac.created_at,'resolvedAt',ac.resolved_at,'withdrawnAt',ac.withdrawn_at,'resolutionNote',ac.resolution_note,'manualItems',coalesce((select jsonb_agg(jsonb_build_object('kind',mr.kind,'itemId',mr.item_id)) from partner_deals.manual_reconciliation_items mr where mr.change_id=ac.id),'[]'::jsonb)) order by ac.created_at,ac.id) from partner_deals.agreement_changes ac where ac.deal_id=d.id),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'status',t.status,'kind',l.kind,'deliverableId',l.deliverable_id,'seasonId',l.season_id,'contributionId',l.contribution_id,'canOpen',project_management.can_access_task($1::uuid,t.id)) order by l.kind,t.title) from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.deal_id=d.id),'[]'::jsonb),
  'contributions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'seasonId',c.season_id,'seasonCode',s.code,'seasonName',s.name,'kind',c.kind,'retiredAt',c.retired_at,'description',c.description,'amountOre',c.amount_ore::text,'invoiceDate',c.invoice_date,
   'manualHandling',exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id),
   'fundingStatus',case when coalesce((finance.capability_flags($1::uuid)->>'financing')::boolean,false) then (select f.status from partner_deals.funding_links l join finance.funding f on f.id=l.funding_id where l.contribution_id=c.id) else null end,
   'fundingNeedsReview',case when caps.pipeline or coalesce((finance.capability_flags($1::uuid)->>'financing')::boolean,false) then c.kind='cash' and c.retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and (not exists(select 1 from partner_deals.funding_links fl where fl.contribution_id=c.id) or partner_deals.linked_funding_mismatch(c.id)) else false end) order by c.id) from partner_deals.contributions c join finance.seasons s on s.id=c.season_id where c.deal_id=d.id and c.pending_change_id is null),'[]'::jsonb),
  'deliverables',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'retiredAt',v.retired_at,'description',v.description,'dueDate',v.due_date,'ownerMemberId',v.owner_member_id) order by v.id) from partner_deals.deliverables v where v.deal_id=d.id and v.pending_change_id is null),'[]'::jsonb)
 ) || case when $4='pipeline' then jsonb_build_object('negotiationNotes',d.negotiation_notes) else '{}'::jsonb end || case when caps.pipeline then jsonb_build_object(
 'financeReviews',coalesce((select jsonb_agg(jsonb_build_object('contributionId',r.contribution_id,'status',case when r.status='linked' and partner_deals.linked_funding_mismatch(c.id) then 'stale' when r.status='separate' and (select a.candidate_snapshot from partner_deals.separate_funding_approvals a where a.contribution_id=c.id) is distinct from partner_deals.funding_candidate_snapshot(c.id) then 'stale' else r.status end))
  from partner_deals.finance_reviews r join partner_deals.contributions c on c.id=r.contribution_id
  where c.deal_id=d.id and (r.organization_name,r.season_id,r.amount_ore)=(o.name,c.season_id,c.amount_ore)),'[]'::jsonb)) else '{}'::jsonb end order by d.updated_at desc,d.id)
 from partner_deals.deals d join partner.organizations o on o.id=d.organization_id
 where ($4='pipeline' or d.stage='won')),'[]'::jsonb) as deals,
 case when $4='pipeline' then coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'revision',coalesce(v.revision,0)) order by lower(o.name),o.id) from partner.organizations o left join partner_deals.organization_versions v on v.organization_id=o.id),'[]'::jsonb) else '[]'::jsonb end as organizations,
 coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'startDate',s.start_date,'endDate',s.end_date,'status',s.status) order by s.start_date) from finance.seasons s where $4='pipeline' or caps.pipeline or exists(select 1 from partner_deals.contributions sc join partner_deals.deals sd on sd.id=sc.deal_id where sd.stage='won' and sc.season_id=s.id)),'[]'::jsonb) as seasons
 from partner_deals.capabilities($1::uuid,$2,$3) caps where case when $4='pipeline' then caps.pipeline else caps.shared end`;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberCvError(400, "Check the deal details and try again.");
  return value as Record<string, unknown>;
}
function checkSave(value: unknown): Record<string, unknown> {
  const data = record(value);
  if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 200 || typeof data.organizationId !== "string" ||
      typeof data.stage !== "string" || !["lead", "contacted", "discussion", "proposal", "lost"].includes(data.stage) ||
      !Array.isArray(data.contributions) || data.contributions.length > 100 || !Array.isArray(data.deliverables) || data.deliverables.length > 100 ||
      (data.id !== undefined && (typeof data.id !== "string" || !Number.isSafeInteger(data.expectedRevision) || Number(data.expectedRevision) < 0))) {
    throw new MemberCvError(400, "Check the deal details and try again.");
  }
  if (data.agreementLink !== undefined && data.agreementLink !== "") {
    if (typeof data.agreementLink !== "string") throw new MemberCvError(400, "Enter a valid agreement link.");
    try { if (!["http:","https:"].includes(new URL(data.agreementLink).protocol)) throw new Error(); } catch { throw new MemberCvError(400, "Enter a valid agreement link."); }
  }
  for (const item of data.contributions) {
    const c = record(item);
    if (typeof c.seasonId !== "string" || !["cash", "product", "service"].includes(String(c.kind)) ||
        (c.amountOre != null && (typeof c.amountOre !== "string" || !/^[1-9][0-9]{0,17}$/.test(c.amountOre))) ||
        (c.kind === "cash" && (typeof c.amountOre !== "string" || typeof c.invoiceDate !== "string")) ||
        (c.kind !== "cash" && c.invoiceDate != null && c.invoiceDate !== "")) throw new MemberCvError(400, "Check the contribution details and try again.");
  }
  for (const item of data.deliverables) {
    const d = record(item);
    if (typeof d.title !== "string" || !d.title.trim() || d.title.length > 200) throw new MemberCvError(400, "Check the deliverable details and try again.");
  }
  return data;
}
function errorFor(error: unknown): never {
  if (error instanceof MemberCvError) throw error;
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (message.includes("deal_change_closed_season")) throw new MemberCvError(409,"A closed season still has active records. Ask Finance and Marketing to review it; this change remains unresolved.");
  if (message.includes("deal_change_cancel_finance")) throw new MemberCvError(409,"Ask Finance to retire unreceived funding before reconciling cancellation.");
  if (message.includes("deal_change_cancel_invoice")) throw new MemberCvError(409,"Ask Finance to cancel the open invoice task before reconciling cancellation.");
  if (message.includes("deal_change_cancel_task")) throw new MemberCvError(409,"Ask Marketing to cancel open deliverable tasks before reconciling cancellation.");
  if (message.includes("deal_change_reopen_finance")) throw new MemberCvError(409,"Ask Finance to restore matching funding before reconciling reopening.");
  if (message.includes("deal_change_reopen_invoice")) throw new MemberCvError(409,"Ask Finance to reopen the invoice task before reconciling reopening.");
  if (message.includes("deal_change_reopen_task")) throw new MemberCvError(409,"Ask Marketing to reopen deliverable tasks before reconciling reopening.");
  if (message.includes("deal_change_manual_required")) throw new MemberCvError(409,"Completed tasks or received funding require documented manual handling and explicit confirmation.");
  if (message.includes("deal_change_retire_finance")) throw new MemberCvError(409,"Ask Finance to retire the unreceived funding before removing this contribution.");
  if (message.includes("deal_change_retire_invoice")) throw new MemberCvError(409,"Ask Finance to cancel the linked invoice task before removing this contribution.");
  if (message.includes("deal_change_retire_task")) throw new MemberCvError(409,"Ask Marketing to cancel the linked task before removing this deliverable.");
  if (message.includes("deal_change_finance_review")) throw new MemberCvError(409,"Ask Finance to update the linked secured funding to the proposed amount before reconciling.");
  if (message.includes("deal_change_invoice_review")) throw new MemberCvError(409,"Ask Finance to update or cancel the linked invoice task before reconciling.");
  if (message.includes("deal_change_task_review")) throw new MemberCvError(409,"Ask Marketing to update the linked task to the proposed details before reconciling.");
  if (message.includes("deal_change_received_locked")) throw new MemberCvError(409,"A received funding amount needs separate handling. The original record was kept.");
  if (message.includes("deal_change_completed_locked")) throw new MemberCvError(409,"A completed task needs separate handling. The original task was kept.");
  if (message.includes("deal_change_pending")) throw new MemberCvError(409,"Reconcile or withdraw the existing agreement change before recording another.");
  if (message.includes("deal_change_cancelled")) throw new MemberCvError(409,"Reopen the agreement before reconciling its amendment.");
  if (message.includes("deal_change_conflict")) throw new MemberCvError(409,"This agreement changed. Reload it before continuing.");
  if (message.includes("deal_change_invalid")) throw new MemberCvError(400,"Check the agreement change and review note.");
  if (message.includes("deal_review_invalid")) throw new MemberCvError(400, "Choose an active review.");
  if (message.includes("deal_review_changed")) throw new MemberCvError(409, "The review or deal changed. Reload before continuing.");
  if (message.includes("deal_review_no_matches")) throw new MemberCvError(409, "No matching funding currently needs review.");
  if (message.includes("deal_funding_candidates_changed")) throw new MemberCvError(409, "Funding changed. Reload the candidates before continuing.");
  if (message.includes("deal_linked_organization")) throw new MemberCvError(409, "This partner has linked funding. Ask Finance to reconcile it before changing the partner name.");
  if (message.includes("deal_funding_stale_link")) throw new MemberCvError(409, "This funding record changed. Reload funding and review it before linking.");
  if (message.includes("deal_funding_possible_duplicate")) throw new DuplicateFundingError(409, "Existing funding may match this partner and season. Review it before confirming the deal.");
  if (message.includes("deal_funding_mismatch")) throw new FundingMismatchError(409, "The funding record does not match this deal or has changed. Review it with Finance.");
  if (message.includes("deal_funding_closed")) throw new MemberCvError(409, "A deal season is closed. Review the agreement with Finance.");
  if (message.includes("deal_forbidden") || code === "42501") throw new MemberCvError(403, "You do not have access to sponsor deals.");
  if (message.includes("deal_linked_contribution")) throw new MemberCvError(409, "This contribution is linked to funding. Ask Finance to unlink it before changing or removing it.");
  if (message.includes("deal_no_current_season")) throw new MemberCvError(409, "Set an active current season before confirming the deal.");
  if (message.includes("deal_task_season_unavailable")) throw new MemberCvError(409, "Tasks are not yet available for the current season.");
  if (message.includes("deal_marketing_lead_missing")) throw new MemberCvError(409, "Assign an active Business & Marketing lead or a deliverable owner before confirming the deal.");
  if (message.includes("deal_marketing_department_missing")) throw new MemberCvError(409, "Set up the Business & Marketing department before confirming the deal.");
  if (message.includes("deal_finance_lead_missing")) throw new MemberCvError(409, "Assign an active Finance lead before confirming the deal.");
  if (message.includes("deal_finance_department_missing")) throw new MemberCvError(409, "Set up the Finance department before confirming the deal.");
  if (message.includes("deal_invalid_marketing_owner")) throw new MemberCvError(409, "Choose a deliverable owner in the Business & Marketing department.");
  if (message.includes("deal_funding_unavailable")) throw new MemberCvError(503, "Funding is not configured. Ask an administrator to complete setup, then try again.");
  if (message.includes("deal_not_found")) throw new MemberCvError(404, "This deal is no longer available.");
  if (message.includes("deal_conflict") || message.includes("deal_won_locked") || code === "40001") throw new MemberCvError(409, "This deal changed or has been won. Reload it before saving.");
  if (message.includes("deal_invalid") || ["23502","23503","23505","23514","22007","22008","22P02","22003"].includes(code)) throw new MemberCvError(400, "Check the deal details and try again.");
  throw new MemberCvError(503, "Sponsor deals are temporarily unavailable. Your input has been kept.");
}
export function createDealServices(deps: { db: CvDatabase; authenticate(token: string): Promise<WorkspaceIdentity> }): DealServices {
  const identity = async (token: string) => deps.authenticate(token);
  return {
    async load(token, view) {
      try {
        if (view !== "pipeline" && view !== "shared") throw new MemberCvError(400, "Choose a valid deal view.");
        const actor = await identity(token);
        const result = await deps.db.query<DealWorkspace>(readSql, [actor.userId,actor.googleSub,actor.email,view]);
        if (!result.rows[0]) throw new MemberCvError(403, "You do not have access to sponsor deals.");
        // Recheck after reading so a revoked grant or disabled account cannot
        // receive data captured by the earlier statement snapshot.
        const access = await deps.db.query<{ pipeline: boolean; shared: boolean; can_review_funding: boolean; can_view_finance: boolean }>(
          "select pipeline, shared, pipeline and coalesce((finance.capability_flags($1::uuid)->>'manageFunding')::boolean,false) as can_review_funding, coalesce((finance.capability_flags($1::uuid)->>'financing')::boolean,false) as can_view_finance from partner_deals.capabilities($1::uuid,$2,$3)",
          [actor.userId, actor.googleSub, actor.email],
        );
        const current = access.rows[0];
        if (!current || (view === "pipeline" ? !current.pipeline : !current.shared)) {
          throw new MemberCvError(403, "You do not have access to sponsor deals.");
        }
        const workspace=result.rows[0];
        if (!current.can_view_finance) workspace.deals=workspace.deals.map(value => {
          const deal=value as Record<string,unknown>;
          return {...deal,contributions:Array.isArray(deal.contributions) ? deal.contributions.map(value => {
            const contribution=value as Record<string,unknown>;
            return {...contribution,fundingStatus:null,fundingNeedsReview:current.pipeline ? contribution.fundingNeedsReview : false};
          }) : []};
        });
        if (view === "shared" && workspace.canManage && !current.pipeline) throw new MemberCvError(403, "Your sponsor deal access changed. Reload the agreements.");
        return { ...workspace, canManage: current.pipeline, canReviewFunding: view === "pipeline" && current.can_review_funding, canViewFinance: current.can_view_finance };
      } catch (error) { return errorFor(error); }
    },
    async reviewNotifications(token) {
      try {
        const actor=await identity(token);
        const query="select partner_deals.review_notifications($1::uuid,$2,$3) as value";
        const args=[actor.userId,actor.googleSub,actor.email];
        // Re-read after the projection to discard results if grants were revoked.
        await deps.db.query(query,args);
        const current=await deps.db.query<{value:unknown[]}>(query,args);
        if (!Array.isArray(current.rows[0]?.value)) throw new Error("Missing notifications");
        return current.rows[0].value;
      } catch(error) { return errorFor(error); }
    },
    async markReviewNotificationsRead(token, ids) {
      try {
        if (!Array.isArray(ids) || ids.length>100 || ids.some(id=>typeof id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new MemberCvError(400,"Choose valid notifications.");
        const actor=await identity(token);
        await deps.db.query("select partner_deals.mark_review_notifications_read($1::uuid,$2,$3,$4::uuid[])",[actor.userId,actor.googleSub,actor.email,ids]);
        return {ok:true};
      } catch(error) { return errorFor(error); }
    },
    async recordAgreementChange(token, dealId, revision, kind, reason, terms, confirmed) {
      try {
        if (confirmed!==true || typeof dealId!=="string" || !Number.isSafeInteger(revision) || Number(revision)<0 || !["amendment","cancellation","reopening"].includes(String(kind)) || typeof reason!=="string" || !reason.trim() || reason.length>2000) throw new MemberCvError(400,"Check the agreement change.");
        if (kind==="amendment") {
          const data=record(terms);
          if(typeof data.agreementLink!=="string") throw new MemberCvError(400,"Enter a valid agreement link.");
          if(data.agreementLink) { try { if(!["http:","https:"].includes(new URL(data.agreementLink).protocol)) throw new Error(); } catch { throw new MemberCvError(400,"Enter a valid agreement link."); } }
        }
        const actor=await identity(token);
        const rows=await deps.db.query<{id:string}>("select partner_deals.record_agreement_change($1::uuid,$2,$3,$4::uuid,$5::integer,$6,$7,$8::jsonb) as id",[actor.userId,actor.googleSub,actor.email,dealId,revision,kind,reason,kind==="amendment"?JSON.stringify(terms):null]);
        if(!rows.rows[0]?.id)throw new Error("Missing change identifier");return rows.rows[0];
      } catch(error) { return errorFor(error); }
    },
    async resolveAgreementChange(token, changeId, note, confirmed, manualConfirmed) {
      try {
        if(confirmed!==true || typeof changeId!=="string" || typeof note!=="string" || !note.trim() || note.length>2000) throw new MemberCvError(400,"Enter a review note before reconciling.");
        const actor=await identity(token);
        const rows=await deps.db.query<{id:string}>("select partner_deals.resolve_agreement_change($1::uuid,$2,$3,$4::uuid,$5,$6::boolean) as id",[actor.userId,actor.googleSub,actor.email,changeId,note,manualConfirmed===true]);
        if(!rows.rows[0]?.id)throw new Error("Missing change identifier");return rows.rows[0];
      } catch(error) { return errorFor(error); }
    },
    async withdrawAgreementChange(token, changeId, note, confirmed) {
      try {
        if(confirmed!==true || typeof changeId!=="string" || typeof note!=="string" || !note.trim() || note.length>2000) throw new MemberCvError(400,"Enter a reason before withdrawing.");
        const actor=await identity(token);
        const rows=await deps.db.query<{id:string}>("select partner_deals.withdraw_agreement_change($1::uuid,$2,$3,$4::uuid,$5) as id",[actor.userId,actor.googleSub,actor.email,changeId,note]);
        if(!rows.rows[0]?.id)throw new Error("Missing change identifier");return rows.rows[0];
      } catch(error) { return errorFor(error); }
    },
    async requestFinanceReview(token, dealId, revision) {
      try {
        if (typeof dealId !== "string" || !Number.isSafeInteger(revision) || Number(revision) < 0) throw new MemberCvError(400,"Choose a valid deal.");
        const actor=await identity(token);
        const result=await deps.db.query<{count:number}>("select partner_deals.request_finance_review($1::uuid,$2,$3,$4::uuid,$5::integer) as count",[actor.userId,actor.googleSub,actor.email,dealId,revision]);
        return {count:Number(result.rows[0]?.count ?? 0)};
      } catch(error) { return errorFor(error); }
    },
    async financeReviewQueue(token) {
      try {
        const actor=await identity(token);
        const result=await deps.db.query<{value:unknown[]}>("select partner_deals.finance_review_queue($1::uuid,$2,$3) as value",[actor.userId,actor.googleSub,actor.email]);
        const check=await deps.db.query<{allowed:boolean}>("select partner_deals.finance_reviewer($1::uuid,$2,$3) as allowed",[actor.userId,actor.googleSub,actor.email]);
        if(!check.rows[0]?.allowed)throw new MemberCvError(403,"Finance access is required.");
        if(!Array.isArray(result.rows[0]?.value))throw new Error("Missing reviews");
        return result.rows[0].value;
      } catch(error) { return errorFor(error); }
    },
    async resolveFinanceReview(token, reviewId, action, fundingId, revision, snapshot, confirmed) {
      try {
        if(confirmed!==true || typeof reviewId!=="string" || !["link","unlink","separate"].includes(String(action)) || (["link","unlink"].includes(String(action)) && (typeof fundingId!=="string" || !Number.isSafeInteger(revision) || Number(revision)<0)) || (action==="separate" && (!Array.isArray(snapshot) || snapshot.length>100))) throw new MemberCvError(400,"Review the funding before continuing.");
        const actor=await identity(token);
        await deps.db.query("select partner_deals.resolve_finance_review($1::uuid,$2,$3,$4::uuid,$5,$6::uuid,$7::integer,$8::jsonb)",[actor.userId,actor.googleSub,actor.email,reviewId,action,action==="link"||action==="unlink"?fundingId:null,action==="link"||action==="unlink"?revision:null,action==="separate"?JSON.stringify(snapshot):null]);
        return {ok:true};
      } catch(error) { return errorFor(error); }
    },
    async taskDeal(token, taskId) {
      try {
        if (typeof taskId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) throw new MemberCvError(400, "Choose a valid task.");
        const actor = await identity(token);
        const query = `select d.id as "dealId" from partner_deals.task_links l
          join partner_deals.deals d on d.id=l.deal_id and d.stage='won'
          where l.task_id=$4::uuid and project_management.can_access_task($1::uuid,l.task_id)
            and coalesce((select shared from partner_deals.capabilities($1::uuid,$2,$3)),false)`;
        const result = await deps.db.query<{ dealId: string }>(query, [actor.userId, actor.googleSub, actor.email, taskId]);
        if (!result.rows[0]) return { dealId: null };
        // Recheck both grants after reading so revoked task or deal access cannot reveal the association.
        const access = await deps.db.query<{ allowed: boolean }>(
          `select coalesce((select shared from partner_deals.capabilities($1::uuid,$2,$3)),false)
            and project_management.can_access_task($1::uuid,$4::uuid) as allowed`,
          [actor.userId, actor.googleSub, actor.email, taskId],
        );
        return { dealId: access.rows[0]?.allowed ? result.rows[0].dealId : null };
      } catch (error) { return errorFor(error); }
    },
    async createOrganization(token, name) {
      try {
        if (typeof name !== "string" || !name.trim() || name.length > 200) throw new MemberCvError(400, "Enter a partner name.");
        const actor = await identity(token);
        const result = await deps.db.query<{id: string}>("select partner_deals.create_organization($1::uuid,$2,$3,$4) as id", [actor.userId,actor.googleSub,actor.email,name]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
    async renameOrganization(token, id, revision, name) {
      try {
        if (typeof id !== "string" || !Number.isSafeInteger(revision) || Number(revision) < 0 || typeof name !== "string" || !name.trim() || name.length > 200) throw new MemberCvError(400, "Check the partner details.");
        const actor = await identity(token);
        const result = await deps.db.query<{id: string}>("select partner_deals.rename_organization($1::uuid,$2,$3,$4::uuid,$5::integer,$6) as id", [actor.userId,actor.googleSub,actor.email,id,revision,name]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
    async fundingCandidates(token, contributionId) {
      try {
        if (typeof contributionId !== "string") throw new MemberCvError(400, "Choose a cash contribution.");
        const actor = await identity(token);
        const result = await deps.db.query<{ value: FundingCandidates }>("select partner_deals.funding_candidates($1::uuid,$2,$3,$4::uuid) as value", [actor.userId,actor.googleSub,actor.email,contributionId]);
        const recheck = await deps.db.query<{ allowed: boolean }>("select coalesce((select pipeline from partner_deals.capabilities($1::uuid,$2,$3)),false) and coalesce((finance.capability_flags($1::uuid)->>'manageFunding')::boolean,false) as allowed", [actor.userId,actor.googleSub,actor.email]);
        if (!recheck.rows[0]?.allowed) throw new MemberCvError(403, "You do not have access to sponsor funding.");
        if (!result.rows[0]?.value) throw new Error("Missing candidates");
        return result.rows[0].value;
      } catch (error) { return errorFor(error); }
    },
    async approveSeparateFunding(token, contributionId, snapshot, confirmed) {
      try {
        if (confirmed !== true || typeof contributionId !== "string" || !Array.isArray(snapshot) || snapshot.length > 100) throw new MemberCvError(400, "Review the matching funding records before confirming.");
        const actor = await identity(token);
        await deps.db.query("select partner_deals.approve_separate_funding($1::uuid,$2,$3,$4::uuid,$5::jsonb)", [actor.userId,actor.googleSub,actor.email,contributionId,JSON.stringify(snapshot)]);
        return { ok: true };
      } catch (error) { return errorFor(error); }
    },
    async linkFunding(token, contributionId, fundingId, expectedRevision) {
      try {
        if (typeof contributionId !== "string" || typeof fundingId !== "string" || !Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0) throw new MemberCvError(400, "Choose a cash contribution and funding record.");
        const actor = await identity(token);
        await deps.db.query("select partner_deals.prepare_funding_link($1::uuid,$2,$3,$4::uuid,$5::uuid,$6::integer)", [actor.userId,actor.googleSub,actor.email,contributionId,fundingId,expectedRevision]);
        return { ok: true };
      } catch (error) { return errorFor(error); }
    },
    async unlinkFunding(token, contributionId) {
      try {
        if (typeof contributionId !== "string") throw new MemberCvError(400, "Choose a cash contribution.");
        const actor = await identity(token);
        await deps.db.query("select partner_deals.remove_funding_link($1::uuid,$2,$3,$4::uuid)", [actor.userId,actor.googleSub,actor.email,contributionId]);
        return { ok: true };
      } catch (error) { return errorFor(error); }
    },
    async confirmWon(token, dealId, revision, confirmed) {
      try {
        if (confirmed !== true || typeof dealId !== "string" || !Number.isSafeInteger(revision) || Number(revision) < 0) throw new MemberCvError(400, "Confirm the agreed deal before continuing.");
        const actor = await identity(token);
        const result = await deps.db.query<{id: string}>("select partner_deals.confirm_won($1::uuid,$2,$3,$4::uuid,$5::integer) as id", [actor.userId,actor.googleSub,actor.email,dealId,revision]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
    async save(token, body) {
      try {
        const actor = await identity(token); const data = checkSave(body);
        const result = await deps.db.query<{id: string}>("select partner_deals.save_deal($1::uuid,$2,$3,$4::jsonb) as id", [actor.userId,actor.googleSub,actor.email,JSON.stringify(data)]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
  };
}
let pool: pg.Pool | undefined;
export function neonDealServices(): DealServices {
  const url = process.env.DATABASE_URL;
  if (!url) throw new MemberCvError(503, "Sponsor deals are not configured.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(url), max: 1 });
  return createDealServices({ db: { async query<T>(sql: string, params?: unknown[]) { return { rows: (await pool!.query(sql,params)).rows as T[] }; } }, authenticate: token => neonCvServices().authenticate(token) });
}
