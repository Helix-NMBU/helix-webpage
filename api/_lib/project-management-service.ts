import pg from "pg";
import type { ProjectWorkspace } from "../../src/features/ProjectManagement/types.js";
import { neonCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import { parseProjectMutation } from "./project-management-validation.js";

export interface ProjectServices {
  load(token: string): Promise<ProjectWorkspace>;
  mutate(token: string, body: unknown): Promise<ProjectWorkspace>;
}

// A single statement reads one consistent snapshot and the current module grant.
const workspaceSql = `select a.can_manage as "canManage", a.member_id as "viewerId", 'S27' as season,
  to_jsonb(a.task_lead_categories) as "taskLeadCategories",
  coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'season',d.season,'name',d.name,'revision',d.revision,
    'memberIds',coalesce((select jsonb_agg(dm.member_id order by dm.member_id) from project_management.department_members dm where dm.department_id=d.id),'[]'::jsonb),
    'leadId',(select dm.member_id from project_management.department_members dm where dm.department_id=d.id and dm.is_lead)) order by lower(d.name),d.id)
    from project_management.departments d where d.season='S27'),'[]'::jsonb) as departments,
  coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'season',p.season,'name',p.name,'description',p.description,
    'category',p.category,'departments',p.departments,'deadline',p.deadline,'revision',p.revision) order by p.name,p.id)
    from project_management.projects p where p.season = 'S27'),'[]'::jsonb) as projects,
  coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'season',t.season,'title',t.title,'description',t.description,
    'category',t.category,'projectId',t.project_id,'milestoneId',t.milestone_id,'assigneeIds',coalesce((select jsonb_agg(ta.member_id order by ta.member_id) from project_management.task_assignees ta where ta.task_id=t.id),'[]'::jsonb),'deadline',t.deadline,'startDate',t.start_date,
    'status',t.status,'priority',t.priority,'kind',t.kind,'partnerName',t.partner_name,'blockedReason',t.blocked_reason,
    'revision',t.revision,'createdAt',t.created_at,'updatedAt',t.updated_at,'completedAt',t.completed_at)
    order by t.deadline nulls last,t.created_at,t.id) from project_management.tasks t where t.season = 'S27'),'[]'::jsonb) as tasks,
  coalesce((select jsonb_agg(jsonb_build_object('taskId',e.task_id,'recordedAt',e.recorded_at,
    'category',e.category,'kind',e.kind,'status',e.status) order by e.recorded_at,e.event_id)
    from project_management.task_progress_events e where e.season = 'S27'),'[]'::jsonb) as "progressEvents",
  coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.full_name,'avatarUrl',to_jsonb(u)->>'image') order by m.full_name,m.id)
    from project_management.access eligible join identity.members m on m.id = eligible.member_id
    join neon_auth."user" u on u.id = m.auth_user_id
    where eligible.active and u.banned is not true and u."emailVerified" is true and lower(u.email) = m.email
      and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)),'[]'::jsonb) as members
  from project_management.access a join identity.members viewer on viewer.id = a.member_id
  join neon_auth."user" auth on auth.id = viewer.auth_user_id
  where a.member_id = $1::uuid and a.active and viewer.google_sub = $2 and viewer.email = $3
    and lower(auth.email) = viewer.email and auth."emailVerified" is true and auth.banned is not true
    and exists(select 1 from neon_auth.account linked where linked."userId" = auth.id and linked."providerId" = 'google' and linked."accountId" = viewer.google_sub)`;

function projectError(error: unknown): never {
  if (error instanceof MemberCvError) throw error;
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (message.includes("project_department_exists")) throw new MemberCvError(400, "A department with this name already exists.");
  if (message.includes("project_department_name")) throw new MemberCvError(400, "Department names cannot be changed after creation.");
  if (message.includes("project_department_member")) throw new MemberCvError(400, "Choose active platform members and a Lead who belongs to the department.");
  if (message.includes("project_task_lead_required")) throw new MemberCvError(403, "A Department Lead grant for this area is required to create, edit or assign tasks.");
  if (message.includes("project_forbidden")) throw new MemberCvError(403, "Project management access is required. Contact your project manager.");
  if (message.includes("project_not_found")) throw new MemberCvError(404, "This task or project is no longer available.");
  if (message.includes("project_conflict") || code === "23505") throw new MemberCvError(409, "This task or project changed. Reload the workspace before saving again.");
  if (message.includes("project_invalid_reference") || code === "23503") throw new MemberCvError(400, "Choose an eligible assignee and a milestone in the same project and area. Place milestones in a project before assigning tasks. Linked milestones cannot be moved or converted while their tasks would become invalid.");
  if (message.includes("project_invalid_hierarchy")) throw new MemberCvError(400, "Place milestones in a project and tasks in a milestone before saving.");
  if (message.includes("project_invalid") || ["23514", "22007", "22008", "22P02", "23502"].includes(code)) throw new MemberCvError(400, "Check the task or project fields and try again.");
  throw new MemberCvError(503, "Could not complete the project management request. Your input has been kept. Try again.");
}

export function createProjectServices(deps: { db: CvDatabase; authenticate(token: string): Promise<WorkspaceIdentity> }): ProjectServices {
  async function read(identity: WorkspaceIdentity): Promise<ProjectWorkspace> {
    const rows = (await deps.db.query<ProjectWorkspace>(workspaceSql, [identity.userId, identity.googleSub, identity.email])).rows;
    if (!rows[0]) throw new MemberCvError(403, "Project management access is required. Contact your project manager.");
    return rows[0];
  }
  return {
    async load(token) {
      try { return await read(await deps.authenticate(token)); }
      catch (error) { return projectError(error); }
    },
    async mutate(token, body) {
      try {
        const identity = await deps.authenticate(token);
        const change = parseProjectMutation(body);
        await deps.db.query(change.action === "save_department" ? "select project_management.save_department($1::uuid,$2,$3,$4::jsonb)" : "select project_management.mutate($1::uuid,$2,$3,$4::jsonb)", [identity.userId, identity.googleSub, identity.email, JSON.stringify(change)]);
        return await read(identity);
      } catch (error) { return projectError(error); }
    },
  };
}

let pool: pg.Pool | undefined;
export function neonProjectServices(): ProjectServices {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MemberCvError(503, "Project management is not configured.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  return createProjectServices({
    db: { async query<T>(sql: string, params?: unknown[]) { return { rows: (await pool!.query(sql, params)).rows as T[] }; } },
    authenticate: token => neonCvServices().authenticate(token),
  });
}
