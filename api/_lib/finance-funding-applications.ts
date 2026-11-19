import { createHash } from "node:crypto";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import { normalizeManualItem } from "../../src/features/Finance/budget-domain.js";
import { parseIsoDate } from "../../src/features/Finance/money.js";
import type { FundingApplicationBudgetContext, FundingApplicationCard, FundingApplicationDetail, FundingApplicationMutationResult, FundingApplicationQueue, FundingBudgetProposal, ProjectFundingProposals } from "../../src/features/Finance/funding-application-types.js";
import type { ProjectBudgetEntryInput } from "../../src/features/Finance/project-budget-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set(["linkFundingApplicationEntry", "proposeFundingBudgetEntry", "recordFundingAward", "releaseFundingObligation", "adoptFundingProposal"]);
export const isFundingApplicationMutation = (action: unknown): action is string => typeof action === "string" && actions.has(action);
function id(value: unknown, label: string) { if (typeof value !== "string" || !UUID.test(value)) throw new FinanceError(400, `Choose a valid ${label}.`); return value; }
function optionalId(value: unknown, label: string) { return value == null || value === "" ? null : id(value, label); }
function revision(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483647) throw new FinanceError(400, "Reload the current application and budget before saving."); return Number(value); }
function text(value: unknown, label: string, max: number, required = true) { if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new FinanceError(400, `Enter a valid ${label}.`); return value.trim(); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`; return JSON.stringify(value); }
export function fundingApplicationError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const source = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  if (source.code === "42501") return new FinanceError(403, "You do not have access to this funding application.");
  if (source.code === "P0002") return new FinanceError(404, "This funding application or budget entry is no longer available.");
  if (["40001", "23505"].includes(source.code ?? "")) return new FinanceError(409, "The funding application or budget changed. Reload it before saving again.");
  if (source.message?.includes("PROJECT_OBLIGATION_ACTIVE")) return new FinanceError(400, "This entry has an active P0 obligation. Head of Finance must release it with a reason before it can be removed, reduced, moved or downgraded.");
  if (source.message?.includes("FUNDING_HISTORY_IMMUTABLE")) return new FinanceError(400, "Awarded conditions and obligation history must be retained. Release an obligation with a reason if its conditions change.");
  if (["23514", "23503", "23502", "22P02", "22003", "22007", "22008"].includes(source.code ?? "")) return new FinanceError(400, "Check the funding application, budget entries and required reasons.");
  return new FinanceError(503, "Funding applications are temporarily unavailable. Try again.");
}
function normalize(body: Record<string, unknown>) {
  const action = String(body.action);
  if (!actions.has(action) && action !== "saveFundingApplication") throw new FinanceError(400, "Choose a funding application operation.");
  const output: Record<string, unknown> = { action, requestId: id(body.requestId, "request ID"), expectedRevision: revision(body.expectedRevision) };
  if (action === "saveFundingApplication") {
    return { ...output, dealId: id(body.dealId, "pipeline card"), dealExpectedRevision: revision(body.dealExpectedRevision), seasonId: id(body.seasonId, "season"),
      purchaseConditions: text(body.purchaseConditions, "purchase conditions", 5000), ...(body.fundingId !== undefined ? { fundingId: optionalId(body.fundingId, "grant funding") } : {}) };
  }
  output.applicationId = id(body.applicationId, "funding application");
  if (["linkFundingApplicationEntry", "proposeFundingBudgetEntry", "adoptFundingProposal"].includes(action)) output.expectedBudgetRevision = revision(body.expectedBudgetRevision);
  if (action === "linkFundingApplicationEntry") output.entryId = id(body.entryId, "budget entry");
  if (action === "proposeFundingBudgetEntry") {
    output.projectBudgetId = id(body.projectBudgetId, "project budget");
    const entry = body.entry && typeof body.entry === "object" ? body.entry as Record<string, unknown> : {};
    if (!["P1", "P2", "P3", "P4"].includes(String(entry.ordinaryPriority))) throw new FinanceError(400, "Choose an ordinary priority from P1 through P4.");
    const normalized = normalizeManualItem({ ...entry, priority: entry.earmarkId ? "EM" : entry.ordinaryPriority });
    if (!normalized.item || normalized.errors.length || normalized.item.plannedOre > 9223372036854775807n) throw new FinanceError(400, "Check the proposed budget entry.", normalized.errors);
    output.entry = { ...normalized.item, plannedOre: normalized.item.plannedOre.toString(), ordinaryPriority: entry.ordinaryPriority,
      entryId: optionalId(entry.entryId, "budget entry"), ownerMemberId: optionalId(entry.ownerMemberId, "entry owner") };
    output.note = body.note === undefined ? "" : text(body.note, "proposal note", 1000, false);
  }
  if (action === "recordFundingAward") {
    try { output.awardDate = parseIsoDate(text(body.awardDate, "award date", 10)); } catch { throw new FinanceError(400, "Enter a valid award date."); }
    output.awardReference = text(body.awardReference, "award reference", 1000);
  }
  if (action === "releaseFundingObligation") { output.obligationId = id(body.obligationId, "obligation"); output.reason = text(body.reason, "release reason", 500); }
  if (action === "adoptFundingProposal") { output.proposalId = id(body.proposalId, "proposal"); output.projectBudgetId = id(body.projectBudgetId, "project budget"); }
  return output;
}
export async function mutateFundingApplication(db: CvDatabase, identity: WorkspaceIdentity, body: Record<string, unknown>): Promise<FundingApplicationMutationResult> {
  const normalized = normalize(body), hash = createHash("sha256").update(canonical(normalized)).digest("hex");
  try {
    const value = (await db.query<{ result: FundingApplicationMutationResult }>("select finance.mutate_funding_application($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as result",
      [identity.userId, identity.googleSub, identity.email, normalized.requestId, hash, JSON.stringify(normalized)])).rows[0]?.result;
    if (!value) throw new FinanceError(503, "The funding application could not be saved."); return value;
  } catch (error) { throw fundingApplicationError(error); }
}
const CARD = `jsonb_build_object('id',app.id,'dealId',app.deal_id,'title',deal.title,'seasonId',app.season_id,'seasonCode',season.code,'purchaseConditions',app.purchase_conditions,'fundingId',app.funding_id,'revision',app.revision,
 'award',case when app.awarded_at is not null then jsonb_build_object('actorMemberId',app.awarded_by_member_id,'recordedAt',app.awarded_at,'date',app.award_date,'reference',app.award_reference) else null end)`;
const APP_JOIN = `from finance.funding_applications app join partner_deals.deals deal on deal.id=app.deal_id join finance.seasons season on season.id=app.season_id`;
const PROPOSALS = `select jsonb_build_object('id',proposal.id,'applicationId',proposal.application_id,'applicationTitle',deal.title,'applicationRevision',app.revision,
 'projectBudgetId',proposal.project_budget_id,'entryId',proposal.entry_id,'desiredEntry',proposal.desired_entry,'note',proposal.note,'adoptedVersionId',proposal.adopted_version_id,
 'approvalStatus',case when proposal.adopted_at is null then 'needs_project_lead' when exists(select 1 from finance.project_budgets h join finance.project_budget_versions approved on approved.id=h.approved_version_id
  join finance.project_budget_versions adopted on adopted.id=proposal.adopted_version_id join finance.project_budget_version_entries entry on entry.version_id=approved.id and entry.entry_id=proposal.entry_id
  where h.id=proposal.project_budget_id and approved.version_number>=adopted.version_number and not entry.removed and entry.status<>'cancelled'
   and entry.system_id=(proposal.desired_entry->>'systemId')::uuid and entry.description=proposal.desired_entry->>'description'
   and entry.category=proposal.desired_entry->>'category' and entry.planned_ore>=(proposal.desired_entry->>'plannedOre')::bigint
   and entry.ordinary_priority=proposal.desired_entry->>'ordinaryPriority' and entry.reuse_status=proposal.desired_entry->>'reuseStatus'
   and entry.status=proposal.desired_entry->>'status'
   and entry.expected_purchase_date is not distinct from nullif(proposal.desired_entry->>'expectedPurchaseDate','')::date
   and entry.owner_member_id is not distinct from nullif(proposal.desired_entry->>'ownerMemberId','')::uuid
   and entry.owner_email is not distinct from nullif(proposal.desired_entry->>'ownerEmail','')
   and entry.note is not distinct from nullif(proposal.desired_entry->>'note','')) then 'approved' else 'awaiting_budget_approval' end,
 'mandatory',exists(select 1 from finance.budget_obligations obligation where obligation.application_id=app.id and obligation.entry_id=proposal.entry_id and obligation.released_at is null and app.awarded_at is not null),
 'createdByMemberId',proposal.created_by_member_id,'createdAt',proposal.created_at) as value
 from finance.funding_budget_proposals proposal join finance.funding_applications app on app.id=proposal.application_id join partner_deals.deals deal on deal.id=app.deal_id`;
type StoredProposal = Omit<FundingBudgetProposal, "desiredEntry"> & { desiredEntry: Record<string, unknown> & { plannedOre: string } };
function proposal(row: StoredProposal): FundingBudgetProposal {
  const { plannedOre, priority: _legacy, ...entry } = row.desiredEntry;
  return { ...row, desiredEntry: { ...entry, plannedNok: formatOre(BigInt(plannedOre)) } as unknown as ProjectBudgetEntryInput };
}
export async function loadFundingApplicationCard(db: CvDatabase, identity: WorkspaceIdentity, dealId: unknown): Promise<{ application: FundingApplicationCard | null }> {
  const target = id(dealId, "pipeline card");
  try {
    const row = (await db.query<{ allowed: boolean; exists: boolean; application: FundingApplicationCard | null }>(
      `with viewer as materialized (select finance.project_budget_verified_member($1::uuid,$2,$3) and coalesce((select pipeline from partner_deals.capabilities($1::uuid,$2,$3)),false) as allowed)
       select allowed,case when allowed then exists(select 1 from partner_deals.deals where id=$4::uuid) else false end as exists,
       case when allowed then (select ${CARD} ${APP_JOIN} where app.deal_id=$4::uuid) else null end as application from viewer`, [identity.userId, identity.googleSub, identity.email, target],
    )).rows[0];
    if (!row?.allowed) throw new FinanceError(403, "Pipeline access is required to identify a funding application.");
    if (!row.exists) throw new FinanceError(404, "This pipeline card is no longer available."); return { application: row.application };
  } catch (error) { throw fundingApplicationError(error); }
}
export async function loadFundingApplications(db: CvDatabase, identity: WorkspaceIdentity): Promise<FundingApplicationQueue> {
  try {
    const row = (await db.query<{ allowed: boolean; applications: FundingApplicationCard[]; version: string }>(
      `with viewer as materialized (select finance.funding_application_head($1::uuid,$2,$3) as allowed)
       select allowed,case when allowed then coalesce((select jsonb_agg(value order by value->>'title',value->>'id') from (select ${CARD} as value ${APP_JOIN}) cards),'[]'::jsonb) else '[]'::jsonb end as applications,
       (select version::text from finance.view_versions where singleton) as version from viewer`, [identity.userId, identity.googleSub, identity.email],
    )).rows[0];
    if (!row?.allowed) throw new FinanceError(403, "Head of Finance access is required to review funding applications.");
    return { viewVersion: Number(row.version), applications: row.applications };
  } catch (error) { throw fundingApplicationError(error); }
}
export async function loadFundingApplication(db: CvDatabase, identity: WorkspaceIdentity, applicationId: unknown): Promise<FundingApplicationDetail> {
  const target = id(applicationId, "funding application");
  try {
    const row = (await db.query<{ allowed: boolean; card: FundingApplicationCard | null; links: FundingApplicationDetail["links"]; proposals: StoredProposal[] }>(
      `with viewer as materialized (select finance.funding_application_head($1::uuid,$2,$3) as allowed)
       select allowed,case when allowed then (select ${CARD} ${APP_JOIN} where app.id=$4::uuid) else null end as card,
       case when allowed then coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'entryId',o.entry_id,'projectBudgetId',entry.project_budget_id,'projectName',project.name,
         'description',coalesce(effective.description,(select p.desired_entry->>'description' from finance.funding_budget_proposals p where p.entry_id=entry.id order by p.created_at desc limit 1),'Proposed entry'),
         'approvedNok',(coalesce(effective.planned_ore,0)/100)::text||'.'||lpad((coalesce(effective.planned_ore,0)%100)::text,2,'0'),'ordinaryPriority',effective.ordinary_priority,
         'mandatory',app.awarded_at is not null and o.released_at is null,'createdByMemberId',o.created_by_member_id,'createdAt',o.created_at,
         'release',case when o.released_at is not null then jsonb_build_object('actorMemberId',o.released_by_member_id,'recordedAt',o.released_at,'reason',o.release_reason) else null end) order by o.created_at,o.id)
         from finance.budget_obligations o join finance.funding_applications app on app.id=o.application_id join finance.project_budget_entries entry on entry.id=o.entry_id
         join finance.project_budgets h on h.id=entry.project_budget_id join project_management.projects project on project.id=h.project_id
         left join finance.effective_budget_entries effective on effective.id=entry.id where app.id=$4::uuid),'[]'::jsonb) else '[]'::jsonb end as links,
       case when allowed then coalesce((select jsonb_agg(value) from (${PROPOSALS} where app.id=$4::uuid) proposals),'[]'::jsonb) else '[]'::jsonb end as proposals from viewer`,
      [identity.userId, identity.googleSub, identity.email, target],
    )).rows[0];
    if (!row?.allowed) throw new FinanceError(403, "Head of Finance access is required to review funding applications.");
    if (!row.card) throw new FinanceError(404, "This funding application is no longer available.");
    return { ...row.card, links: row.links, proposals: row.proposals.map(proposal) };
  } catch (error) { throw fundingApplicationError(error); }
}
export async function loadProjectFundingProposals(db: CvDatabase, identity: WorkspaceIdentity, projectBudgetId: unknown): Promise<ProjectFundingProposals> {
  const target = id(projectBudgetId, "project budget");
  try {
    const row = (await db.query<{ scope: unknown; revision: number; version: string; proposals: StoredProposal[] }>(
      `select finance.project_budget_scope($1::uuid,$2,$3,h.project_id,h.responsible_department_id) as scope,h.revision,
       (select version::text from finance.view_versions where singleton) as version,
       coalesce((select jsonb_agg(value) from (${PROPOSALS} where proposal.project_budget_id=h.id) rows),'[]'::jsonb) as proposals from finance.project_budgets h where h.id=$4::uuid`, [identity.userId, identity.googleSub, identity.email, target],
    )).rows[0];
    if (!row) throw new FinanceError(404, "This project budget is no longer available.");
    return { viewVersion: Number(row.version), projectBudgetId: target, budgetRevision: row.revision, proposals: row.proposals.map(proposal) };
  } catch (error) { throw fundingApplicationError(error); }
}

export async function loadFundingApplicationBudgetContext(db: CvDatabase, identity: WorkspaceIdentity, applicationId: unknown): Promise<FundingApplicationBudgetContext> {
  const target = id(applicationId, "funding application");
  type Choice = Omit<FundingApplicationBudgetContext["entries"][number], "plannedNok" | "entry"> & { entry: StoredProposal["desiredEntry"] };
  try {
    const row = (await db.query<{ allowed: boolean; application_id: string | null; version: string; budgets: FundingApplicationBudgetContext["budgets"]; entries: Choice[]; systems: FundingApplicationBudgetContext["systems"] }>(
      `with viewer as materialized (select finance.funding_application_head($1::uuid,$2,$3) as allowed),
       application as (select app.* from finance.funding_applications app,viewer where app.id=$4::uuid and viewer.allowed),
       headers as (select h.*,p.name as project_name,p.departments,d.name as department_name from finance.project_budgets h join project_management.projects p on p.id=h.project_id
         join project_management.departments d on d.id=h.responsible_department_id join application app on app.season_id=h.season_id),
       approved_choices as (
         select e.id as entry_id,h.id as header_id,h.project_name,true as approved,e.priority,
           jsonb_build_object('entryId',e.id,'systemId',e.system_id,'description',e.description,'category',e.category,'plannedOre',e.planned_ore::text,
             'ordinaryPriority',coalesce(e.ordinary_priority,pending.ordinary_priority),'reuseStatus',e.reuse_status,'expectedPurchaseDate',e.expected_purchase_date,'ownerMemberId',e.owner_member_id,
             'ownerEmail',case when h.approved_version_id is not null then current_entry.owner_email else anchor.owner_email end,'status',e.status,'note',e.note,'earmarkId',e.earmark_id) as entry
         from finance.effective_budget_entries e join headers h on h.id=e.project_budget_id join finance.budget_items anchor on anchor.id=e.id
         left join finance.project_budget_version_entries current_entry on current_entry.version_id=h.approved_version_id and current_entry.entry_id=e.id
         left join finance.project_budget_version_entries pending on pending.version_id=h.pending_version_id and pending.entry_id=e.id
         where e.status<>'cancelled' and (h.approved_version_id is not null or (e.source='legacy' and e.legacy_budget_status='approved'))
           and coalesce(e.ordinary_priority,pending.ordinary_priority) is not null
       ), pending_choices as (
         select e.entry_id,h.id as header_id,h.project_name,false as approved,'Pending approval'::text as priority,
           jsonb_build_object('entryId',e.entry_id,'systemId',e.system_id,'description',e.description,'category',e.category,'plannedOre',e.planned_ore::text,'ordinaryPriority',e.ordinary_priority,
             'reuseStatus',e.reuse_status,'expectedPurchaseDate',e.expected_purchase_date,'ownerMemberId',e.owner_member_id,'ownerEmail',e.owner_email,'status',e.status,'note',e.note,'earmarkId',e.earmark_id) as entry
         from headers h join finance.project_budget_versions v on v.id=h.pending_version_id join finance.project_budget_version_entries e on e.version_id=v.id
         where v.status in ('department_pending','finance_pending') and not e.removed and e.status<>'cancelled' and not exists(select 1 from approved_choices a where a.entry_id=e.entry_id)
       ), proposed_choices as (
         select distinct on(p.entry_id) p.entry_id,h.id as header_id,h.project_name,false as approved,'Pending approval'::text as priority,p.desired_entry as entry
         from finance.funding_budget_proposals p join headers h on h.id=p.project_budget_id
         where not exists(select 1 from approved_choices a where a.entry_id=p.entry_id) and not exists(select 1 from pending_choices c where c.entry_id=p.entry_id)
         order by p.entry_id,p.created_at desc
       ), choices as (select * from approved_choices union all select * from pending_choices union all select * from proposed_choices)
       select viewer.allowed,(select id from application) as application_id,(select version::text from finance.view_versions where singleton) as version,
       coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'projectId',h.project_id,'projectName',h.project_name,'responsibleDepartmentName',h.department_name,'revision',h.revision,'approvedVersionId',h.approved_version_id,
         'systemIds',coalesce((select jsonb_agg(sys.id order by sys.id) from finance.systems sys join identity.departments d on d.department_key=sys.department_key where sys.active and project_management.canonical_department(d.name)=any(h.departments)),'[]'::jsonb)) order by h.project_name,h.id) from headers h),'[]'::jsonb) as budgets,
       coalesce((select jsonb_agg(jsonb_build_object('entryId',c.entry_id,'projectBudgetId',c.header_id,'projectName',c.project_name,'description',c.entry->>'description','ordinaryPriority',c.entry->>'ordinaryPriority','effectivePriority',c.priority,'approved',c.approved,'entry',c.entry) order by c.project_name,c.entry_id) from choices c),'[]'::jsonb) as entries,
       coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'name',sys.name,'departmentName',project_management.canonical_department(d.name)) order by sys.code)
         from finance.systems sys join identity.departments d on d.department_key=sys.department_key where sys.active and exists(select 1 from headers h where project_management.canonical_department(d.name)=any(h.departments))),'[]'::jsonb) as systems from viewer`,
      [identity.userId, identity.googleSub, identity.email, target],
    )).rows[0];
    if (!row?.allowed) throw new FinanceError(403, "Head of Finance access is required to review funding applications.");
    if (!row.application_id) throw new FinanceError(404, "This funding application is no longer available.");
    return { viewVersion: Number(row.version), applicationId: target, budgets: row.budgets, systems: row.systems,
      entries: row.entries.map(choice => { const { plannedOre, priority: _legacy, ...input } = choice.entry; return { ...choice, plannedNok: formatOre(BigInt(plannedOre)), entry: { ...input, plannedNok: formatOre(BigInt(plannedOre)) } as unknown as ProjectBudgetEntryInput }; }) };
  } catch (error) { throw fundingApplicationError(error); }
}
