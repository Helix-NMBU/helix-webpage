import { createHash } from "node:crypto";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import { listProjectBudgetScopes, loadProjectBudgetScope, projectBudgetError } from "./finance-project-budget-foundation.js";
import { prepareProjectBudgetImport } from "./finance-project-budget-import.js";
import { normalizeManualItem } from "../../src/features/Finance/budget-domain.js";
import type { ProjectBudgetDetail, ProjectBudgetEntry, ProjectBudgetMutationResult, ProjectBudgetScope, ProjectBudgetSummary, ProjectBudgetVersion, ProjectBudgetWorkspace } from "../../src/features/Finance/project-budget-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["createProjectBudget", "saveProjectBudgetEntry", "removeProjectBudgetEntry", "submitProjectBudget", "approveDepartmentBudget", "approveProjectBudget", "returnProjectBudget", "withdrawProjectBudget", "requestProjectBudgetChanges", "previewProjectBudgetImport", "importProjectBudgetEntries", "adoptProjectBudgetEntries"]);
/** Completion remains a separate transaction routine so it cannot overwrite revision/import logic. */
export function isProjectBudgetMutation(action: unknown): action is string { return typeof action === "string" && (ACTIONS.has(action) || action === "setProjectBudgetCompletion" || action === "previewImport" || action === "importItems"); }
function uuid(value: unknown, label: string): string { if (typeof value !== "string" || !UUID.test(value)) throw new FinanceError(400, `Choose a valid ${label}.`); return value; }
function optionalUuid(value: unknown, label: string): string | null { return value == null || value === "" ? null : uuid(value, label); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
function normalizedWrite(body: Record<string, unknown>): Record<string, unknown> {
  if (!isProjectBudgetMutation(body.action)) throw new FinanceError(400, "Unknown project budget action.");
  const requestId = uuid(body.requestId, "request ID");
  if (body.action === "createProjectBudget") return { action: body.action, requestId, projectId: uuid(body.projectId, "project"), responsibleDepartmentId: uuid(body.responsibleDepartmentId, "responsible department") };
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new FinanceError(400, "A valid project budget revision is required.");
  const output: Record<string, unknown> = { action: body.action, requestId, projectBudgetId: uuid(body.projectBudgetId, "project budget"), expectedRevision: body.expectedRevision };
  if (body.action === "saveProjectBudgetEntry") {
    const input = body.entry && typeof body.entry === "object" && !Array.isArray(body.entry) ? body.entry as Record<string, unknown> : {};
    if (!["P1", "P2", "P3", "P4"].includes(String(input.ordinaryPriority))) throw new FinanceError(400, "Choose an ordinary priority from P1 through P4.");
    const normalized = normalizeManualItem({ ...input, priority: input.earmarkId ? "EM" : input.ordinaryPriority });
    if (!normalized.item || normalized.errors.length) throw new FinanceError(400, "Check the budget entry.", normalized.errors);
    if (normalized.item.plannedOre > 9223372036854775807n) throw new FinanceError(400, "Enter a smaller budget amount.");
    output.entry = { ...normalized.item, plannedOre: normalized.item.plannedOre.toString(), ordinaryPriority: input.ordinaryPriority,
      entryId: optionalUuid(input.entryId, "budget entry"), ownerMemberId: optionalUuid(input.ownerMemberId, "entry owner") };
  }
  if (body.action === "removeProjectBudgetEntry") output.entryId = uuid(body.entryId, "budget entry");
  if (body.action === "returnProjectBudget" || body.action === "withdrawProjectBudget" || body.action === "requestProjectBudgetChanges") {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 500) throw new FinanceError(400, "Enter a reason of up to 500 characters.", [{ field: "reason", message: "A reason is required." }]);
    output.reason = reason;
  }
  if (body.action === "previewProjectBudgetImport" || body.action === "importProjectBudgetEntries") {
    if (typeof body.csv !== "string") throw new FinanceError(400, "Enter CSV text for this project candidate.");
    output.csv = body.csv;
    if (body.action === "importProjectBudgetEntries") {
      if (typeof body.previewToken !== "string" || !/^[a-f0-9]{64}$/.test(body.previewToken)) throw new FinanceError(400, "Preview this candidate import before saving.");
      output.previewToken = body.previewToken;
    }
  }
  if (body.action === "adoptProjectBudgetEntries") {
    if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 500) throw new FinanceError(400, "Choose 1 to 500 legacy entries to adopt.");
    const seen = new Set<string>();
    output.entries = body.entries.map(value => {
      const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const budgetItemId = uuid(row.budgetItemId, "legacy budget entry");
      if (seen.has(budgetItemId)) throw new FinanceError(400, "Choose each legacy entry once.");
      seen.add(budgetItemId);
      if (row.ordinaryPriority !== undefined && !["P1", "P2", "P3", "P4"].includes(String(row.ordinaryPriority))) throw new FinanceError(400, "Choose an ordinary priority from P1 through P4.");
      return { budgetItemId, ...(row.ordinaryPriority ? { ordinaryPriority: row.ordinaryPriority } : {}) };
    });
  }
  return output;
}
export async function mutateProjectBudget(db: CvDatabase, identity: WorkspaceIdentity, body: Record<string, unknown>): Promise<ProjectBudgetMutationResult> {
  if (body.action === "setProjectBudgetCompletion") {
    // PBA-05 wires its independent transaction routine here.
    throw new FinanceError(503, "This project budget operation is not available yet.");
  }
  if (body.action === "previewImport" || body.action === "importItems") body = { ...body, action: body.action === "previewImport" ? "previewProjectBudgetImport" : "importProjectBudgetEntries" };
  const normalized = normalizedWrite(body);
  const hash = createHash("sha256").update(canonical(normalized)).digest("hex");
  try {
    if (normalized.action === "previewProjectBudgetImport" || normalized.action === "importProjectBudgetEntries") {
      if (normalized.action === "importProjectBudgetEntries") {
        const replay = await db.query<{ result: ProjectBudgetMutationResult | null }>("select finance.mutate_project_budget($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as result",
          [identity.userId, identity.googleSub, identity.email, normalized.requestId, hash, JSON.stringify({ ...normalized, replayOnly: true })]);
        if (replay.rows[0]?.result) return replay.rows[0].result;
      }
      const prepared = await prepareProjectBudgetImport(db, identity, { projectBudgetId: String(normalized.projectBudgetId), expectedRevision: Number(normalized.expectedRevision), csv: String(normalized.csv) });
      if (normalized.action === "previewProjectBudgetImport") return { ok: true, id: String(normalized.projectBudgetId), revision: Number(normalized.expectedRevision), viewVersion: prepared.preview.viewVersion, warnings: [], errors: [], importPreview: prepared.preview };
      if (normalized.previewToken !== prepared.preview.previewToken) throw new FinanceError(409, "The CSV or candidate changed. Preview the import again.");
      if (prepared.preview.errors.length) throw new FinanceError(400, "Correct the CSV and preview again.", prepared.preview.errors);
      normalized.entries = prepared.entries; normalized.snapshotToken = prepared.snapshotToken;
    }
    const result = await db.query<{ result: ProjectBudgetMutationResult }>("select finance.mutate_project_budget($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as result",
      [identity.userId, identity.googleSub, identity.email, normalized.requestId, hash, JSON.stringify(normalized)]);
    if (!result.rows[0]?.result) throw new FinanceError(503, "The project budget could not be saved.");
    return result.rows[0].result;
  } catch (error) { throw projectBudgetError(error); }
}

type SummaryRow = {
  id: string; project_id: string; project_name: string; season_id: string; season_code: string;
  responsible_department_id: string; department_name: string; revision: number;
  approved_version_id: string | null; pending_version_id: string | null; pending_stage: ProjectBudgetSummary["pendingStage"];
  approved_total_ore: string; pending_total_ore: string | null; capabilities: ProjectBudgetScope["capabilities"];
};
function summary(row: SummaryRow): ProjectBudgetSummary {
  return { id: row.id, projectId: row.project_id, projectName: row.project_name, seasonId: row.season_id, seasonCode: row.season_code,
    responsibleDepartmentId: row.responsible_department_id, responsibleDepartmentName: row.department_name, revision: row.revision,
    approvedVersionId: row.approved_version_id, pendingVersionId: row.pending_version_id, pendingStage: row.pending_stage,
    approvedTotalNok: formatOre(BigInt(row.approved_total_ore ?? "0")), pendingTotalNok: row.pending_total_ore === null ? null : formatOre(BigInt(row.pending_total_ore)), capabilities: row.capabilities };
}
const SUMMARY_FIELDS = `h.id,h.project_id,p.name as project_name,h.season_id,s.code as season_code,h.responsible_department_id,d.name as department_name,
 h.revision,h.approved_version_id,h.pending_version_id,pending.status as pending_stage,
 coalesce((select sum(e.planned_ore) from finance.project_budget_version_entries e where e.version_id=h.approved_version_id and not e.removed and e.status<>'cancelled'),0)::text as approved_total_ore,
 case when h.pending_version_id is not null then coalesce((select sum(e.planned_ore) from finance.project_budget_version_entries e where e.version_id=h.pending_version_id and not e.removed and e.status<>'cancelled'),0)::text else null end as pending_total_ore`;
const SUMMARY_JOINS = `join project_management.projects p on p.id=h.project_id join finance.seasons s on s.id=h.season_id
 join project_management.departments d on d.id=h.responsible_department_id left join finance.project_budget_versions pending on pending.id=h.pending_version_id`;
const VISIBLE = `(coalesce((scope->'capabilities'->>'canDraft')::boolean,false) or coalesce((scope->'capabilities'->>'canReviewDepartment')::boolean,false)
  or h.approved_version_id is not null or pending.status in ('department_pending','finance_pending'))`;

export async function loadProjectBudgetWorkspace(db: CvDatabase, identity: WorkspaceIdentity, projectId?: string, departmentId?: string): Promise<ProjectBudgetWorkspace> {
  if (projectId) uuid(projectId, "project");
  if (departmentId) uuid(departmentId, "department");
  try {
    let scopes = await listProjectBudgetScopes(db, identity);
    if (projectId) {
      const scoped = scopes.find(scope => scope.projectId === projectId) ?? await loadProjectBudgetScope(db, identity, projectId);
      scopes = [scoped];
    }
    if (departmentId) scopes = scopes.filter(scope => scope.responsibleDepartmentId === departmentId);
    const result = (await db.query<{ scopes: ProjectBudgetScope[]; headers: SummaryRow[]; systems: NonNullable<ProjectBudgetWorkspace["systems"]>; view_version: string }>(
      `with authorized as materialized (select finance.project_budget_scope($1::uuid,$2,$3,(item->>'projectId')::uuid,nullif(item->>'responsibleDepartmentId','')::uuid) as scope from jsonb_array_elements($4::jsonb) item)
       select coalesce((select jsonb_agg(scope) from authorized),'[]'::jsonb) as scopes,
       coalesce((select jsonb_agg(to_jsonb(row)) from (select ${SUMMARY_FIELDS},authorized.scope->'capabilities' as capabilities
         from finance.project_budgets h ${SUMMARY_JOINS} join authorized on authorized.scope->>'projectId'=h.project_id::text where ${VISIBLE} order by p.name,h.id) row),'[]'::jsonb) as headers,
       coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'name',sys.name,'departmentName',project_management.canonical_department(dept.name)) order by sys.code)
         from finance.systems sys join identity.departments dept on dept.department_key=sys.department_key where sys.active and exists(select 1 from authorized
           cross join lateral jsonb_array_elements(authorized.scope->'departments') department where department->>'name'=project_management.canonical_department(dept.name))),'[]'::jsonb) as systems,
       (select version::text from finance.view_versions where singleton) as view_version`,
      [identity.userId, identity.googleSub, identity.email, JSON.stringify(scopes.map(s => ({ projectId: s.projectId, responsibleDepartmentId: s.responsibleDepartmentId })))],
    )).rows[0];
    if (!result) throw new FinanceError(503, "Project budgets are temporarily unavailable.");
    return { viewVersion: Number(result.view_version), scopes: result.scopes, budgets: result.headers.map(summary), systems: result.systems };
  } catch (error) { throw projectBudgetError(error); }
}

type VersionRow = { id: string; version_number: number; revision: number; status: ProjectBudgetVersion["status"]; submitted_at: string | null;
  department_approved_by: string | null; department_approved_at: string | null; approved_by: string | null; approved_at: string | null; entries: EntryRow[] };
type EntryRow = { entry_id: string; budget_item_id: string | null; public_ref: string | null; system_id: string; description: string; category: string;
  planned_ore: string; ordinary_priority: ProjectBudgetEntry["ordinaryPriority"]; priority: ProjectBudgetEntry["priority"]; reuse_status: ProjectBudgetEntry["reuseStatus"];
  expected_purchase_date: string | null; owner_member_id: string | null; owner_email: string | null; status: ProjectBudgetEntry["status"]; note: string | null; earmark_id: string | null; removed: boolean; actual_ore: string; purchase_count?: number; complete: boolean };
function version(row: VersionRow | null): ProjectBudgetVersion | null {
  if (!row) return null;
  const entries = row.entries.map(e => ({ entryId: e.entry_id, budgetItemId: e.budget_item_id, publicRef: e.public_ref, systemId: e.system_id, description: e.description,
    category: e.category, plannedNok: formatOre(BigInt(e.planned_ore)), ordinaryPriority: e.ordinary_priority, priority: e.priority, reuseStatus: e.reuse_status,
    expectedPurchaseDate: e.expected_purchase_date, ownerMemberId: e.owner_member_id, ownerEmail: e.owner_email, status: e.status, note: e.note, earmarkId: e.earmark_id, removed: e.removed,
    actualNok: formatOre(BigInt(e.actual_ore)), completion: e.complete ? "complete" as const : Number(e.purchase_count ?? 0) > 0 ? "partial" as const : "not_purchased" as const }));
  return { id: row.id, versionNumber: row.version_number, revision: row.revision, status: row.status, submittedAt: row.submitted_at,
    departmentApprovedBy: row.department_approved_by, departmentApprovedAt: row.department_approved_at, approvedBy: row.approved_by, approvedAt: row.approved_at,
    entries, totalNok: formatOre(row.entries.reduce((total, e) => total + (!e.removed && e.status !== "cancelled" ? BigInt(e.planned_ore) : 0n), 0n)) };
}
export async function loadProjectBudgetDetail(db: CvDatabase, identity: WorkspaceIdentity, projectBudgetId: string): Promise<ProjectBudgetDetail> {
  uuid(projectBudgetId, "project budget");
  try {
    const result = (await db.query<{ header: SummaryRow; versions: VersionRow[]; decisions: ProjectBudgetDetail["decisions"] }>(
      `with authorized as materialized (select h.id,finance.project_budget_scope($1::uuid,$2,$3,h.project_id,h.responsible_department_id) as scope from finance.project_budgets h where h.id=$4::uuid)
       select to_jsonb(row) as header,
         coalesce((select jsonb_agg(to_jsonb(vrow)) from (select v.id,v.version_number,v.revision,v.status,v.submitted_at::text,v.department_approved_by,v.department_approved_at::text,v.approved_by,v.approved_at::text,
           coalesce((select jsonb_agg(to_jsonb(erow) order by erow.entry_id) from (select ve.entry_id,ve.system_id,ve.description,ve.category,ve.planned_ore::text as planned_ore,ve.ordinary_priority,ve.reuse_status,ve.expected_purchase_date,ve.owner_member_id,ve.owner_email,ve.status,ve.note,ve.earmark_id,ve.removed,pe.budget_item_id,i.public_ref,
             case when exists(select 1 from finance.budget_obligations o join finance.funding_applications app on app.id=o.application_id where o.entry_id=pe.id and o.released_at is null and app.awarded_at is not null) then 'P0' else ve.ordinary_priority end as priority,
             coalesce((select sum(a.amount_ore) from finance.allocations a join finance.purchase_lines pl on pl.id=a.line_id join finance.purchases purchase on purchase.id=pl.purchase_id where a.budget_item_id=pe.id and purchase.status='registered'),0)::text as actual_ore,
             (select count(distinct purchase.id)::integer from finance.allocations a join finance.purchase_lines pl on pl.id=a.line_id join finance.purchases purchase on purchase.id=pl.purchase_id where a.budget_item_id=pe.id and purchase.status='registered') as purchase_count,
             coalesce(pc.complete,false) as complete from finance.project_budget_version_entries ve join finance.project_budget_entries pe on pe.id=ve.entry_id
             left join finance.budget_items i on i.id=pe.budget_item_id left join finance.project_budget_completion pc on pc.entry_id=pe.id where ve.version_id=v.id) erow),'[]'::jsonb) as entries
           from finance.project_budget_versions v where v.project_budget_id=row.id) vrow),'[]'::jsonb) as versions,
         coalesce((select jsonb_agg(jsonb_build_object('id',decision.id,'versionId',decision.version_id,'action',decision.action,'actorMemberId',decision.actor_member_id,'reason',decision.reason,'createdAt',decision.created_at,'snapshot',decision.snapshot) order by decision.created_at,decision.id)
           from finance.project_budget_decisions decision where decision.project_budget_id=row.id),'[]'::jsonb) as decisions
       from (select ${SUMMARY_FIELDS},authorized.scope->'capabilities' as capabilities from finance.project_budgets h ${SUMMARY_JOINS} join authorized on authorized.id=h.id where ${VISIBLE}) row`,
      [identity.userId, identity.googleSub, identity.email, projectBudgetId],
    )).rows[0];
    if (!result) throw new FinanceError(404, "This project budget is no longer available.");
    return { ...summary(result.header), approvedVersion: version(result.versions.find(v => v.id === result.header.approved_version_id) ?? null),
      pendingVersion: version(result.versions.find(v => v.id === result.header.pending_version_id) ?? null), historyVersions: result.versions.filter(v => v.status === "approved").sort((a, b) => a.version_number - b.version_number).map(v => version(v)!), decisions: result.decisions };
  } catch (error) { throw projectBudgetError(error); }
}
