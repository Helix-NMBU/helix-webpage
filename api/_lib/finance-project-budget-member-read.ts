import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import { projectBudgetError } from "./finance-project-budget-foundation.js";
import { APPROVED_MEMBER_BUDGET_CAPABILITIES, memberApprovedBudgetSummary, memberApprovedBudgetDetail } from "../../src/features/Finance/project-budget-member-view.js";
import type { ProjectBudgetDetail, ProjectBudgetEntry, ProjectBudgetScope, ProjectBudgetVersion, ProjectBudgetWorkspace } from "../../src/features/Finance/project-budget-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type MemberEntry = Pick<ProjectBudgetEntry, "entryId" | "budgetItemId" | "publicRef" | "systemId" | "description" | "category" | "ordinaryPriority" | "priority" | "reuseStatus" | "status" | "completion"> & { plannedOre: string; actualOre: string };
type MemberRow = {
  project_id: string; project_name: string; season_id: string; season_code: string; departments: ProjectBudgetScope["departments"];
  id: string | null; department_id: string | null; department_name: string | null; version_id: string | null;
  version_number: number | null; revision: number | null; approved_at: string | null; entries: MemberEntry[];
  actual_ore: string; unbudgeted_ore: string; view_version: number; systems: NonNullable<ProjectBudgetWorkspace["systems"]>;
};

/** Routing probe only: downstream private/member readers independently recheck authority.
 * A normal denied scope must not raise a SQL exception before choosing the safe reader,
 * because callers may already be inside an explicit transaction.
 */
export async function hasPrivateProjectBudgetReadScope(db: CvDatabase, identity: WorkspaceIdentity, target: string, byHeader: boolean): Promise<boolean> {
  if (!UUID.test(target)) throw new FinanceError(400, "Choose a valid project budget.");
  try {
    const result = await db.query<{ allowed: boolean }>(`with viewer as materialized (
      select finance.project_budget_verified_member($1::uuid,$2,$3) as verified,
        coalesce((finance.capability_flags($1::uuid)->>'purchaseRegister')::boolean,false) as finance
    ) select viewer.verified and (viewer.finance or exists(
      select 1 from project_management.projects project join finance.seasons season on season.code=project.season
      left join finance.project_budgets header on header.project_id=project.id and header.season_id=season.id
      where ${byHeader ? "header.id=$4::uuid" : "project.id=$4::uuid"} and (
        $1::uuid=any(project.lead_ids) or exists(select 1 from project_management.departments department
          join project_management.department_members membership on membership.department_id=department.id
          where department.season=project.season and department.name=any(project.departments)
            and (header.id is null or department.id=header.responsible_department_id)
            and membership.member_id=$1::uuid and membership.is_lead)
      ))) as allowed from viewer`, [identity.userId, identity.googleSub, identity.email, target]);
    return result.rows[0]?.allowed === true;
  } catch (error) { throw projectBudgetError(error); }
}

/** This read permission is deliberately separate from every Finance mutation/evidence scope.
 * Authorization and the approved pointer/entries are selected in one statement snapshot.
 * No draft rows, audit payloads, owner/funding details or invoice identifiers enter this projection.
 */
async function readMemberSnapshot(db: CvDatabase, identity: WorkspaceIdentity, target: string, byHeader: boolean): Promise<MemberRow> {
  if (!UUID.test(target)) throw new FinanceError(400, "Choose a valid project budget.");
  try {
    const result = await db.query<MemberRow>(`with authorized as materialized (
      select p.id,p.name,p.season,p.departments,s.id as season_id
      from project_management.projects p join finance.seasons s on s.code=p.season
      where ${byHeader ? "exists(select 1 from finance.project_budgets target where target.id=$4::uuid and target.project_id=p.id and target.season_id=s.id)" : "p.id=$4::uuid"}
        and p.season=project_management.current_season()
        and finance.project_budget_verified_member($1::uuid,$2,$3)
        and exists(select 1 from project_management.access access where access.member_id=$1::uuid and access.active)
        and exists(select 1 from project_management.tasks task join project_management.task_assignees assigned on assigned.task_id=task.id
          where task.project_id=p.id and task.season=p.season and task.kind='task' and assigned.member_id=$1::uuid)
        and exists(select 1 from project_management.departments department join project_management.department_members membership on membership.department_id=department.id
          where department.season=p.season and department.name=any(p.departments) and membership.member_id=$1::uuid and membership.access_level in ('member','lead'))
    ) select authorized.id as project_id,authorized.name as project_name,authorized.season_id,authorized.season as season_code,
      coalesce((select jsonb_agg(jsonb_build_object('id',department.id,'name',department.name,'leadIds','[]'::jsonb) order by department.id)
        from project_management.departments department where department.season=authorized.season and department.name=any(authorized.departments)),'[]'::jsonb) as departments,
      h.id,h.responsible_department_id as department_id,owner.name as department_name,v.id as version_id,v.version_number,v.revision,v.approved_at::text,
      coalesce((select jsonb_agg(jsonb_build_object('entryId',entry.entry_id,'budgetItemId',stable.budget_item_id,'publicRef',anchor.public_ref,
        'systemId',entry.system_id,'description',entry.description,'category',entry.category,'plannedOre',entry.planned_ore::text,
        'ordinaryPriority',entry.ordinary_priority,'priority',effective.priority,
        'reuseStatus',entry.reuse_status,'status',entry.status,
        'actualOre',coalesce((select sum(a.amount_ore) from finance.allocations a join finance.purchase_lines line on line.id=a.line_id
          join finance.purchases purchase on purchase.id=line.purchase_id where a.budget_item_id=entry.entry_id and purchase.status='registered'),0)::text,
        'completion',case when completion.complete then 'complete' when exists(select 1 from finance.allocations a join finance.purchase_lines line on line.id=a.line_id
          join finance.purchases purchase on purchase.id=line.purchase_id where a.budget_item_id=entry.entry_id and purchase.status='registered') then 'partial' else 'not_purchased' end)
        order by entry.entry_id) from finance.project_budget_version_entries entry
        join finance.project_budget_entries stable on stable.id=entry.entry_id
        join finance.effective_budget_entries effective on effective.id=entry.entry_id and effective.approved_version_id=v.id
        left join finance.budget_items anchor on anchor.id=stable.budget_item_id
        left join finance.project_budget_completion completion on completion.entry_id=entry.entry_id
        where entry.version_id=v.id and not entry.removed and entry.status<>'cancelled'),'[]'::jsonb) as entries,
      case when v.id is not null then coalesce((select sum(a.amount_ore) from finance.registered_allocation_facts a where a.project_id=authorized.id and a.season_id=authorized.season_id),0) else 0 end::text as actual_ore,
      case when v.id is not null then coalesce((select sum(a.amount_ore) from finance.registered_allocation_facts a where a.project_id=authorized.id and a.season_id=authorized.season_id and a.unbudgeted),0) else 0 end::text as unbudgeted_ore,
      (select version from finance.view_versions where singleton) as view_version,
      coalesce((select jsonb_agg(jsonb_build_object('id',system.id,'code',system.code,'name',system.name,'departmentName',project_management.canonical_department(catalog.name)) order by system.code)
        from finance.systems system join identity.departments catalog on catalog.department_key=system.department_key
        where exists(select 1 from finance.project_budget_version_entries entry where entry.version_id=v.id and entry.system_id=system.id and not entry.removed and entry.status<>'cancelled')),'[]'::jsonb) as systems
    from authorized left join finance.project_budgets h on h.project_id=authorized.id and h.season_id=authorized.season_id and h.approved_version_id is not null
      left join finance.project_budget_versions v on v.id=h.approved_version_id and v.project_budget_id=h.id and v.status='approved'
      left join project_management.departments owner on owner.id=h.responsible_department_id`, [identity.userId, identity.googleSub, identity.email, target]);
    if (!result.rows[0]) throw new FinanceError(403, "You do not have access to this project's approved budget.");
    return result.rows[0];
  } catch (error) { throw projectBudgetError(error); }
}
function approvedDetail(row: MemberRow): ProjectBudgetDetail | null {
  if (!row.id || !row.version_id || !row.department_id || !row.department_name) return null;
  const approved: ProjectBudgetVersion = {
    id: row.version_id, versionNumber: row.version_number!, revision: row.revision!, status: "approved", submittedAt: null,
    departmentApprovedBy: null, departmentApprovedAt: null, approvedBy: null, approvedAt: row.approved_at,
    totalNok: formatOre(row.entries.reduce((total, entry) => total + BigInt(entry.plannedOre), 0n)),
    entries: row.entries.map(entry => ({ entryId: entry.entryId, budgetItemId: entry.budgetItemId, publicRef: entry.publicRef,
      systemId: entry.systemId, description: entry.description, category: entry.category, plannedNok: formatOre(BigInt(entry.plannedOre)),
      ordinaryPriority: entry.ordinaryPriority, priority: entry.priority, reuseStatus: entry.reuseStatus, status: entry.status,
      actualNok: formatOre(BigInt(entry.actualOre)), completion: entry.completion, removed: false,
      expectedPurchaseDate: null, ownerMemberId: null, ownerEmail: null, note: null, earmarkId: null, invoices: [] })),
  };
  return memberApprovedBudgetDetail({ id: row.id, projectId: row.project_id, projectName: row.project_name, seasonId: row.season_id, seasonCode: row.season_code,
    responsibleDepartmentId: row.department_id, responsibleDepartmentName: row.department_name, revision: row.revision!, approvedVersionId: row.version_id,
    approvedTotalNok: approved.totalNok, actualNok: formatOre(BigInt(row.actual_ore)), unbudgetedNok: formatOre(BigInt(row.unbudgeted_ore)),
    capabilities: APPROVED_MEMBER_BUDGET_CAPABILITIES, pendingVersionId: null, pendingStage: null, pendingTotalNok: null,
    approvedVersion: approved, pendingVersion: null, historyVersions: [], decisions: [] });
}
export async function loadMemberApprovedProjectBudgetWorkspace(db: CvDatabase, identity: WorkspaceIdentity, projectId: string): Promise<ProjectBudgetWorkspace> {
  const row = await readMemberSnapshot(db, identity, projectId, false), detail = approvedDetail(row);
  return { viewVersion: Number(row.view_version), scopes: [{ memberId: identity.userId, projectId: row.project_id, projectName: row.project_name, seasonId: row.season_id,
    seasonCode: row.season_code, projectLeadIds: [], departments: row.departments.map(department => ({ id: department.id, name: department.name, leadIds: [] })),
    responsibleDepartmentId: detail?.responsibleDepartmentId ?? null, capabilities: APPROVED_MEMBER_BUDGET_CAPABILITIES,
    financials: { actualNok: detail?.actualNok ?? "0.00", unbudgetedNok: detail?.unbudgetedNok ?? "0.00" } }], budgets: detail ? [memberApprovedBudgetSummary(detail)] : [],
    systems: row.systems.map(system => ({ id: system.id, code: system.code, name: system.name, departmentName: system.departmentName })) };
}
export async function loadMemberApprovedProjectBudgetDetail(db: CvDatabase, identity: WorkspaceIdentity, projectBudgetId: string): Promise<ProjectBudgetDetail> {
  const detail = approvedDetail(await readMemberSnapshot(db, identity, projectBudgetId, true));
  if (!detail) throw new FinanceError(404, "This project's budget has not been approved.");
  return detail;
}
