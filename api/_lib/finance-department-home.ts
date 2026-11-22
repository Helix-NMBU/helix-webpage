import type { DepartmentHomeBudget } from "../../src/features/Finance/department-budget-types.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type AllocationRow = {
  department_id: string;
  department_name: string;
  season_id: string | null;
  season_code: string;
  view_version: string | number;
  total_ore: string;
  legacy_ore: string;
  projects: { projectId: string; projectName: string; amountOre: string }[];
};

/** One statement checks current membership and reads only approved allocation facts.
 * Widget access never grants project approval, invoice or organization-wide Finance access.
 */
export async function loadDepartmentHomeBudget(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  departmentId: unknown,
): Promise<DepartmentHomeBudget> {
  if (typeof departmentId !== "string" || !UUID.test(departmentId)) {
    throw new FinanceError(400, "Choose a valid department.");
  }
  try {
    const result = await db.query<AllocationRow>(
      `with authorized as materialized (
        select d.id,d.name,d.season,catalog.department_key,season.id as season_id
        from project_management.departments d
        join project_management.department_members membership on membership.department_id=d.id
        join identity.members member on member.id=membership.member_id and member.id=$1::uuid
        join neon_auth."user" account on account.id=member.auth_user_id
        join identity.departments catalog on
          project_management.canonical_department(catalog.name)=project_management.canonical_department(d.name)
        left join finance.seasons season on season.code=d.season
        where d.id=$4::uuid and d.season=project_management.current_season()
          and member.google_sub=$2 and lower(member.email)=lower($3)
          and lower(account.email)=lower(member.email) and account."emailVerified" is true and account.banned is not true
          and exists(select 1 from neon_auth.account linked where linked."userId"=account.id
            and linked."providerId"='google' and linked."accountId"=member.google_sub)
      )
      select authorized.id as department_id,authorized.name as department_name,
        authorized.season_id,authorized.season as season_code,version.version as view_version,
        (select coalesce(sum(allocation.planned_ore),0)::text
          from finance.department_plan_allocation allocation
          where allocation.season_id=authorized.season_id and allocation.department_key=authorized.department_key) as total_ore,
        (select coalesce(sum(allocation.planned_ore),0)::text
          from finance.department_plan_allocation allocation
          where allocation.season_id=authorized.season_id and allocation.department_key=authorized.department_key
            and allocation.legacy) as legacy_ore,
        coalesce((select jsonb_agg(jsonb_build_object(
          'projectId',project.project_id,'projectName',project.project_name,'amountOre',project.amount_ore)
          order by lower(project.project_name),project.project_id) from (
            select header.project_id,project.name as project_name,coalesce(sum(allocation.planned_ore),0)::text as amount_ore
            from finance.project_budgets header
            join project_management.projects project on project.id=header.project_id and project.season=authorized.season
            left join finance.department_plan_allocation allocation on allocation.project_id=header.project_id
              and allocation.season_id=header.season_id and allocation.department_key=authorized.department_key
            where header.responsible_department_id=authorized.id and header.season_id=authorized.season_id
              and header.approved_version_id is not null
            group by header.project_id,project.name
          ) project),'[]'::jsonb) as projects
      from authorized cross join finance.view_versions version where version.singleton`,
      [identity.userId, identity.googleSub, identity.email, departmentId],
    );
    const row = result.rows[0];
    if (!row) throw new FinanceError(403, "You can view budget allocations for departments that you belong to.");
    const viewVersion = Number(row.view_version);
    if (!Number.isSafeInteger(viewVersion)) throw new Error("Invalid Finance view version.");
    // Explicit allowlist: never spread query rows or return plan entries/private evidence.
    return {
      viewVersion,
      departmentId: row.department_id,
      departmentName: row.department_name,
      seasonId: row.season_id,
      seasonCode: row.season_code,
      approvedTotalNok: formatOre(BigInt(row.total_ore)),
      legacyTotalNok: formatOre(BigInt(row.legacy_ore)),
      projects: row.projects.map(project => ({
        projectId: project.projectId,
        projectName: project.projectName,
        approvedTotalNok: formatOre(BigInt(project.amountOre)),
      })),
    };
  } catch (error) {
    if (error instanceof FinanceError) throw error;
    throw new FinanceError(503, "Could not load the department budget allocation. Please try again.");
  }
}
