import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import type { ProjectBudgetMappingReport, ProjectBudgetMappingRow, ProjectBudgetScope } from "../../src/features/Finance/project-budget-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function projectBudgetError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "42501" || message.includes("PROJECT_FORBIDDEN")) return new FinanceError(403, "You do not have access to this project budget.");
  if (code === "P0002") return new FinanceError(404, "This project budget is no longer available.");
  if (code === "23505" || code === "40001" || message.includes("PROJECT_CONFLICT")) return new FinanceError(409, "The project budget changed. Reload it before saving again.");
  if (["23503", "23514", "22P02"].includes(code)) return new FinanceError(400, "Choose valid project budget entries and departments.");
  return new FinanceError(503, "Project budgets are temporarily unavailable. Please try again.");
}

/** Always rechecks canonical Google linkage and current assignments in SQL. */
export async function loadProjectBudgetScope(
  db: CvDatabase, identity: WorkspaceIdentity, projectId: string, responsibleDepartmentId: string | null = null,
): Promise<ProjectBudgetScope> {
  if (!UUID.test(projectId) || (responsibleDepartmentId !== null && !UUID.test(responsibleDepartmentId))) {
    throw new FinanceError(400, "Choose a valid project and department.");
  }
  try {
    const result = await db.query<{ scope: ProjectBudgetScope }>(
      "select finance.project_budget_scope($1::uuid,$2,$3,$4::uuid,$5::uuid) as scope",
      [identity.userId, identity.googleSub, identity.email, projectId, responsibleDepartmentId],
    );
    if (!result.rows[0]?.scope) throw new FinanceError(403, "You do not have access to this project budget.");
    return result.rows[0].scope;
  } catch (error) { throw projectBudgetError(error); }
}

/** Scope discovery returns only projects the caller can read, never a global directory. */
export async function listProjectBudgetScopes(db: CvDatabase, identity: WorkspaceIdentity): Promise<ProjectBudgetScope[]> {
  try {
    const verified = (await db.query<{ verified: boolean }>(
      "select finance.project_budget_verified_member($1::uuid,$2,$3) as verified", [identity.userId, identity.googleSub, identity.email],
    )).rows[0]?.verified;
    if (!verified) throw new FinanceError(403, "A verified Helix member account is required.");
    const candidates = await db.query<{ project_id: string; responsible_department_id: string | null }>(
      `select p.id as project_id, coalesce(pb.responsible_department_id,
         (select d.id from project_management.departments d where d.season=p.season and d.name=any(p.departments)
          order by case when exists(select 1 from project_management.department_members dm where dm.department_id=d.id and dm.member_id=$1::uuid and dm.is_lead) then 0 else 1 end,d.id limit 1)) as responsible_department_id
       from project_management.projects p join finance.seasons s on s.code=p.season
       left join finance.project_budgets pb on pb.project_id=p.id and pb.season_id=s.id
       where coalesce((finance.capability_flags($1::uuid)->>'purchaseRegister')::boolean,false)
         or $1::uuid=any(p.lead_ids)
         or exists(select 1 from project_management.departments d join project_management.department_members dm on dm.department_id=d.id
           where d.season=p.season and d.name=any(p.departments) and dm.member_id=$1::uuid and dm.is_lead
             and (pb.id is null or pb.responsible_department_id=d.id))
       order by p.name,p.id`, [identity.userId],
    );
    const scopes: ProjectBudgetScope[] = [];
    for (const row of candidates.rows) scopes.push(await loadProjectBudgetScope(db, identity, row.project_id, row.responsible_department_id));
    return scopes;
  } catch (error) { throw projectBudgetError(error); }
}

type MappingItem = {
  id: string; public_ref: string; planned_ore: string; actual_ore: string; priority: string;
  system_department_name: string | null; mapped_project_id: string | null; approved_version_id: string | null;
};
type MappingProject = { id: string; departments: string[] };
type MappingDepartment = { id: string; name: string };

/** Read-only: a manifest is reviewed against one authoritative database snapshot. */
export async function previewProjectBudgetMapping(
  db: CvDatabase, identity: WorkspaceIdentity, seasonCode: string, manifest: readonly ProjectBudgetMappingRow[],
): Promise<ProjectBudgetMappingReport> {
  if (!/^S[0-9]{2}$/.test(seasonCode) || !Array.isArray(manifest) || manifest.length > 5000) {
    throw new FinanceError(400, "Choose a season and a mapping with at most 5,000 entries.");
  }
  try {
    const snapshot = (await db.query<{
      verified: boolean; can_preview: boolean; items: MappingItem[]; projects: MappingProject[]; departments: MappingDepartment[];
    }>(
      `with viewer as (select finance.project_budget_verified_member($1::uuid,$2,$3) as verified,
         coalesce((finance.capability_flags($1::uuid)->>'purchaseRegister')::boolean,false) as can_preview)
       select viewer.*,
         case when verified and can_preview then coalesce((select jsonb_agg(to_jsonb(entry)) from (
           select i.id,i.public_ref,(case when i.status='cancelled' then 0 else i.planned_ore end)::text as planned_ore,i.priority,
             project_management.canonical_department(d.name) as system_department_name,pb.project_id as mapped_project_id,pb.approved_version_id,
             coalesce((select sum(a.amount_ore) from finance.allocations a join finance.purchase_lines pl on pl.id=a.line_id
               join finance.purchases purchase on purchase.id=pl.purchase_id where a.budget_item_id=i.id and purchase.status='registered'),0)::text as actual_ore
           from finance.budget_items i join finance.budgets b on b.id=i.budget_id join finance.seasons s on s.id=b.season_id
           join finance.systems sys on sys.id=i.system_id join identity.departments d on d.department_key=sys.department_key
           left join finance.project_budget_entries pe on pe.budget_item_id=i.id left join finance.project_budgets pb on pb.id=pe.project_budget_id
           where s.code=$4 and not i.protected order by i.public_ref,i.id) entry),'[]'::jsonb) else '[]'::jsonb end as items,
         case when verified and can_preview then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'departments',p.departments))
           from project_management.projects p where p.season=$4),'[]'::jsonb) else '[]'::jsonb end as projects,
         case when verified and can_preview then coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name))
           from project_management.departments d where d.season=$4),'[]'::jsonb) else '[]'::jsonb end as departments
       from viewer`, [identity.userId, identity.googleSub, identity.email, seasonCode],
    )).rows[0];
    if (!snapshot?.verified || !snapshot.can_preview) throw new FinanceError(403, "Finance access is required to preview the migration mapping.");
    const items = new Map(snapshot.items.map(item => [item.id, item]));
    const projects = new Map(snapshot.projects.map(project => [project.id, project]));
    const departments = new Map(snapshot.departments.map(department => [department.id, department]));
    const seen = new Set<string>();
    const mapped = new Set<string>();
    const conflicts: ProjectBudgetMappingReport["conflicts"] = [];
    const rows: ProjectBudgetMappingReport["rows"] = [];
    let mappedTotal = 0n;
    manifest.forEach((row, index) => {
      const fail = (code: string, message: string) => conflicts.push({ row: index + 1, code, message });
      if (!row || typeof row !== "object" || !UUID.test(row.budgetItemId ?? "") || !UUID.test(row.projectId ?? "") || !UUID.test(row.responsibleDepartmentId ?? "")) {
        fail("invalid_reference", "Choose valid existing entry, project and department IDs."); return;
      }
      if (seen.has(row.budgetItemId)) { fail("duplicate_entry", "An existing entry can map to only one project."); return; }
      seen.add(row.budgetItemId);
      const item = items.get(row.budgetItemId), project = projects.get(row.projectId), department = departments.get(row.responsibleDepartmentId);
      if (!item) { fail("entry_not_in_season", "The entry does not belong to the selected season."); return; }
      if (!project || !department || !project.departments.includes(department.name)) {
        fail("project_department_mismatch", "Choose a same-season project and one of its departments."); return;
      }
      if (!item.system_department_name || !project.departments.includes(item.system_department_name)) {
        fail("system_project_mismatch", "The entry's system is outside the project's departments."); return;
      }
      if (item.mapped_project_id && (item.mapped_project_id !== row.projectId || item.approved_version_id)) {
        fail("already_mapped", "This entry already belongs to another or an approved project budget."); return;
      }
      if ((row.ordinaryPriority !== undefined && !["P1", "P2", "P3", "P4"].includes(row.ordinaryPriority)) || (item.priority === "EM" && row.ordinaryPriority === undefined)) {
        fail("ordinary_priority_required", "Choose P1 through P4 for an adopted earmarked entry."); return;
      }
      mapped.add(item.id);
      mappedTotal += BigInt(item.planned_ore);
      rows.push({ ...row, plannedNok: formatOre(BigInt(item.planned_ore)), actualNok: formatOre(BigInt(item.actual_ore)), publicRef: item.public_ref });
    });
    const eligibleLegacyItems = snapshot.items.filter(item => !item.approved_version_id);
    const unmapped = eligibleLegacyItems.filter(item => !mapped.has(item.id)).map(item => ({ budgetItemId: item.id, publicRef: item.public_ref,
      plannedNok: formatOre(BigInt(item.planned_ore)), actualNok: formatOre(BigInt(item.actual_ore)) }));
    const sourceTotal = eligibleLegacyItems.reduce((sum, item) => sum + BigInt(item.planned_ore), 0n);
    return { valid: conflicts.length === 0, seasonCode, rows, conflicts, unmapped,
      sourceTotalNok: formatOre(sourceTotal), mappedTotalNok: formatOre(mappedTotal), unmappedTotalNok: formatOre(sourceTotal - mappedTotal) };
  } catch (error) { throw projectBudgetError(error); }
}
