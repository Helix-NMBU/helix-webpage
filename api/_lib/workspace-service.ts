import pg from "pg";
import {
  neonCvServices,
  type CvDatabase,
  type WorkspaceIdentity,
} from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { memberAccount } from "./member-account.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import { parseProjectMutation } from "./project-management-validation.js";
import type {
  MemberChange,
  WorkspaceDirectory,
} from "../../src/features/Workspace/types.js";

const eligible = `from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
 where u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
 and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)`;
const snapshotSql = `with actor as (select m.id ${eligible} and m.id=$1::uuid and m.google_sub=$2 and m.email=$3),
 seen as (update identity.members set last_seen_at=now() where id=(select id from actor) and (last_seen_at is null or last_seen_at<now()-interval '5 minutes') returning id,last_seen_at)
 select $1::uuid as "viewerId",
 ((select active from project_management.access where member_id=$1::uuid) is true or project_management.is_department_manager($1::uuid) or exists(select 1 from project_management.department_members where member_id=$1::uuid)) as "projectAccess",
 coalesce((select to_jsonb(task_lead_categories) from project_management.access where member_id=$1::uuid and active),'[]'::jsonb) as "taskLeadCategories",
 project_management.is_department_manager($1::uuid) as "canManageProjects",
 coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.full_name,'avatarUrl',to_jsonb(u)->>'image','helixRole',m.helix_role,
 'role',case when m.email='henrik.engdal@helixnmbu.no' then 'Admin' else 'Member' end,'joinedAt',m.created_at,'lastSeenAt',coalesce((select seen.last_seen_at from seen where seen.id=m.id),m.last_seen_at),'revision',m.directory_revision) order by lower(m.full_name),m.id) ${eligible}),'[]'::jsonb) as members,
 coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'season',d.season,'name',d.name,'revision',d.revision,
 'memberIds',coalesce((select jsonb_agg(member_id order by member_id) from project_management.department_members where department_id=d.id),'[]'::jsonb),
 'viewerIds',coalesce((select jsonb_agg(member_id) from project_management.department_members where department_id=d.id and access_level='viewer'),'[]'::jsonb),
 'leadId',(select member_id from project_management.department_members where department_id=d.id and is_lead))) from project_management.departments d where d.season='S27'),'[]'::jsonb) as departments,
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'season',p.season,'name',p.name,'description',p.description,'category',p.category,'departments',p.departments,
 'startDate',p.start_date,'deadline',p.deadline,'revision',p.revision,'priority',p.priority,'leadIds',p.lead_ids,
 'total',(select count(*) from project_management.tasks t where t.project_id=p.id and t.kind='task' and t.status<>'cancelled'),
 'done',(select count(*) from project_management.tasks t where t.project_id=p.id and t.kind='task' and t.status='done'),
 'milestones',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'deadline',t.deadline,'priority',t.priority) order by t.deadline nulls last,t.id) from project_management.tasks t where t.project_id=p.id and t.kind='milestone' and t.status not in ('done','cancelled')),'[]'::jsonb)) order by lower(p.name),p.id) from project_management.projects p where p.season='S27' and project_management.can_access_project($1::uuid,p.departments)),'[]'::jsonb) as projects where exists(select 1 from actor)`;

function invalid(): never {
  throw new MemberCvError(400, "Check the member details and try again.");
}
export function parseMemberChange(body: unknown): MemberChange {
  if (!body || typeof body !== "object" || JSON.stringify(body).length > 20000)
    return invalid();
  const input = body as MemberChange;
  const uuid = (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const revision = (value: unknown) =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value < 2147483647;
  if (
    input.action !== "save_member" ||
    !uuid(input.id) ||
    !revision(input.expectedRevision) ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 160 ||
    (input.helixRole !== null &&
      (typeof input.helixRole !== "string" || input.helixRole.length > 150))
  )
    return invalid();
  if (
    !Array.isArray(input.departments) ||
    input.departments.length !== 7 ||
    new Set(input.departments.map((d) => d?.id)).size !== 7 ||
    input.departments.some(
      (d) =>
        !d ||
        !uuid(d.id) ||
        !revision(d.revision) ||
        typeof d.member !== "boolean" ||
        typeof d.lead !== "boolean" ||
        (d.lead && !d.member) ||
        (d.access !== undefined && ![null, "member", "viewer", "lead"].includes(d.access)) ||
        (d.access !== undefined && (d.member !== (d.access !== null) || d.lead !== (d.access === "lead"))),
    )
  )
    return invalid();
  return {
    action: input.action,
    id: input.id,
    expectedRevision: input.expectedRevision,
    name: input.name.trim(),
    helixRole: input.helixRole?.trim() || null,
    departments: input.departments.map(({ id, revision, member, lead, access }) => ({
      id,
      revision,
      member,
      lead,
      ...(access !== undefined ? { access } : {}),
    })),
  };
}
export interface WorkspaceServices {
  load(token: string): Promise<WorkspaceDirectory>;
  mutate(token: string, body: unknown): Promise<WorkspaceDirectory>;
}
export function createWorkspaceServices(deps: {
  db: CvDatabase;
  authenticate(token: string): Promise<WorkspaceIdentity>;
}): WorkspaceServices {
  async function read(
    identity: WorkspaceIdentity,
  ): Promise<WorkspaceDirectory> {
    const directory = (
      await deps.db.query<WorkspaceDirectory>(snapshotSql, [
        identity.userId,
        identity.googleSub,
        identity.email,
      ])
    ).rows[0];
    if (!directory)
      throw new MemberCvError(
        403,
        "Workspace access requires your verified Helix Google account.",
      );
    return { ...directory, canAdmin: memberAccount(identity).role === "Admin" };
  }
  return {
    async load(token) {
      return read(await deps.authenticate(token));
    },
    async mutate(token, body) {
      try {
        const identity = await deps.authenticate(token);
        if (
          body &&
          typeof body === "object" &&
          "action" in body &&
          body.action === "save_project"
        ) {
          const change = parseProjectMutation(body);
          await deps.db.query(
            change.action === "save_project" && change.milestones !== undefined ? "select project_management.create_project_with_milestones($1::uuid,$2,$3,$4::jsonb)" : "select project_management.mutate($1::uuid,$2,$3,$4::jsonb)",
            [
              identity.userId,
              identity.googleSub,
              identity.email,
              JSON.stringify(change),
            ],
          );
        } else {
          if (memberAccount(identity).role !== "Admin")
            throw new MemberCvError(
              403,
              "Only platform admins can edit members.",
            );
          const change = parseMemberChange(body);
          await deps.db.query(
            "select identity.save_workspace_member($1::uuid,$2,$3,$4::jsonb)",
            [
              identity.userId,
              identity.googleSub,
              identity.email,
              JSON.stringify(change),
            ],
          );
        }
        return await read(identity);
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        const message = error instanceof Error ? error.message : "";
        const code =
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "";
        if (/project_task_lead_required/.test(message))
          throw new MemberCvError(403, "A Department Lead grant for this area is required to create milestones.");
        if (/forbidden/.test(message))
          throw new MemberCvError(
            403,
            "Only project managers or a Lead for this project’s department can manage projects.",
          );
        if (/lead_conflict/.test(message))
          throw new MemberCvError(
            409,
            "This department already has a Lead. Remove their Lead assignment before assigning another member.",
          );
        if (/projects_require_lead/.test(message))
          throw new MemberCvError(
            400,
            "Assign at least one project Lead before saving.",
          );
        if (/conflict/.test(message) || code === "23505")
          throw new MemberCvError(
            409,
            "This record changed. Reload the page before saving again.",
          );
        if (/not_found/.test(message))
          throw new MemberCvError(404, "This record is no longer available.");
        if (
          /invalid/.test(message) ||
          ["23514", "23503", "22P02", "22007", "22008", "23502"].includes(code)
        )
          throw new MemberCvError(
            400,
            "Check the project details, selected departments and milestones.",
          );
        throw new MemberCvError(
          503,
          "Could not save changes. Your input has been kept. Try again.",
        );
      }
    },
  };
}
let pool: pg.Pool | undefined;
export function neonWorkspaceServices() {
  if (!process.env.DATABASE_URL)
    throw new MemberCvError(503, "Workspace is not configured.");
  pool ??= new pg.Pool({
    connectionString: withVerifyFullSsl(process.env.DATABASE_URL),
    max: 1,
  });
  return createWorkspaceServices({
    db: {
      async query<T>(sql: string, params?: unknown[]) {
        return { rows: (await pool!.query(sql, params)).rows as T[] };
      },
    },
    authenticate: (token) => neonCvServices().authenticate(token),
  });
}
