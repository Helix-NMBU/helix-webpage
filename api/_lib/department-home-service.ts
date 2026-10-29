import pg from "pg";
import {
  neonCvServices,
  type CvDatabase,
  type WorkspaceIdentity,
} from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import {
  googleDriveFolder,
  type DepartmentHome,
  type DepartmentHomeChange,
} from "../../src/features/Workspace/department-home.js";
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function parseDepartmentHome(body: unknown): DepartmentHomeChange {
  if (!body || typeof body !== "object")
    throw new MemberCvError(400, "Check the department settings.");
  const input = body as DepartmentHomeChange;
  if (
    input.action !== "save_department_home" ||
    !uuid(input.departmentId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision > 2147483646 ||
    typeof input.description !== "string" ||
    input.description.length > 2000 ||
    (input.driveFolderUrl !== null &&
      (typeof input.driveFolderUrl !== "string" ||
        input.driveFolderUrl.length > 2048))
  )
    throw new MemberCvError(400, "Check the department settings.");
  try {
    return {
      action: input.action,
      departmentId: input.departmentId,
      expectedRevision: input.expectedRevision,
      description: input.description.trim(),
      driveFolderUrl: googleDriveFolder(input.driveFolderUrl),
    };
  } catch (error) {
    throw new MemberCvError(
      400,
      error instanceof Error
        ? error.message
        : "Enter a shared Drive folder link.",
    );
  }
}
export interface DepartmentHomeServices {
  load(token: string, id: unknown): Promise<DepartmentHome>;
  save(token: string, body: unknown): Promise<DepartmentHome>;
}
export function createDepartmentHomeServices(deps: {
  db: CvDatabase;
  authenticate(token: string): Promise<WorkspaceIdentity>;
}): DepartmentHomeServices {
  async function read(
    identity: WorkspaceIdentity,
    id: unknown,
  ): Promise<DepartmentHome> {
    if (!uuid(id)) throw new MemberCvError(400, "Choose a valid department.");
    const result = (
      await deps.db.query<
        Omit<DepartmentHome, "canEdit"> & {
          isLead: boolean;
          isProjectManager: boolean;
        }
      >(
        `select d.id as "departmentId",coalesce(h.revision,0) as revision,coalesce(h.description,'') as description,h.drive_folder_url as "driveFolderUrl",dm.is_lead as "isLead",
    project_management.is_department_manager($1::uuid) as "isProjectManager"
    from project_management.departments d join project_management.department_members dm on dm.department_id=d.id and dm.member_id=$1::uuid
    join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
    left join project_management.department_homes h on h.department_id=d.id
    where d.id=$2::uuid and d.season=project_management.current_season() and m.google_sub=$3 and m.email=$4 and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)`,
        [identity.userId, id, identity.googleSub, identity.email],
      )
    ).rows[0];
    if (!result)
      throw new MemberCvError(
        403,
        "You can open departments that you belong to.",
      );
    const { isLead, isProjectManager, ...home } = result;
    return {
      ...home,
      canEdit:
        isLead || isProjectManager,
    };
  }
  return {
    async load(token, id) {
      return read(await deps.authenticate(token), id);
    },
    async save(token, body) {
      try {
        const identity = await deps.authenticate(token);
        const change = parseDepartmentHome(body);
        await deps.db.query(
          "select project_management.save_department_home($1::uuid,$2,$3,$4::jsonb)",
          [
            identity.userId,
            identity.googleSub,
            identity.email,
            JSON.stringify(change),
          ],
        );
        return await read(identity, change.departmentId);
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        const message = error instanceof Error ? error.message : "";
        if (message.includes("department_home_forbidden"))
          throw new MemberCvError(
            403,
            "Only department Leads, Project Managers, or Platform Administrators can edit these settings.",
          );
        if (message.includes("department_home_conflict"))
          throw new MemberCvError(
            409,
            "Department settings changed. Reload the page before saving again.",
          );
        if (message.includes("department_home_invalid"))
          throw new MemberCvError(
            400,
            "Check the department description and shared Drive folder link.",
          );
        throw new MemberCvError(
          503,
          "Could not save department settings. Your input has been kept. Try again.",
        );
      }
    },
  };
}
let pool: pg.Pool | undefined;
export function neonDepartmentHomeServices(): DepartmentHomeServices {
  if (!process.env.DATABASE_URL)
    throw new MemberCvError(503, "Workspace is not configured.");
  pool ??= new pg.Pool({
    connectionString: withVerifyFullSsl(process.env.DATABASE_URL),
    max: 1,
  });
  return createDepartmentHomeServices({
    db: {
      async query<T>(sql: string, params?: unknown[]) {
        return { rows: (await pool!.query(sql, params)).rows as T[] };
      },
    },
    authenticate: (token) => neonCvServices().authenticate(token),
  });
}
