import pg from "pg";
import { bearer, createCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { createCvStorage } from "./member-cv-storage.js";
import { MemberCvError } from "./member-cv-error.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

export type AccessRole = { key: string; label: string };
export interface MemberAccessServices {
  self(token: string): Promise<{ memberId: string; email: string; name: string; departmentId: string | null; roles: AccessRole[]; features: string[] }>;
  members(token: string): Promise<{ departments: { id: string; name: string }[]; roles: AccessRole[]; members: { id: string; email: string; name: string; departmentId: string | null; roleKeys: string[] }[] }>;
  save(token: string, memberId: string, departmentId: string | null, roleKeys: string[]): Promise<{ saved: true }>;
}

export function createMemberAccessServices(deps: { db: CvDatabase; authenticate: (token: string) => Promise<WorkspaceIdentity> }): MemberAccessServices {
  const { db } = deps;
  async function identityAndId(token: string) {
    const identity = await deps.authenticate(token);
    const { rows } = await db.query<{ id: string }>(`select id from identity.members where id = $1::uuid and google_sub = $2 and lower(email) = lower($3)`, [identity.userId, identity.googleSub, identity.email]);
    if (!rows[0]) throw new MemberCvError(403, "Your Google identity no longer matches this profile.");
    return { identity, memberId: rows[0].id };
  }
  async function requireAdmin(memberId: string) {
    const { rows } = await db.query<{ allowed: boolean }>("select identity.member_has_feature($1::uuid, 'member_access.manage') as allowed", [memberId]);
    if (!rows[0]?.allowed) throw new MemberCvError(403, "Platform administrator access is required.");
  }
  return {
    async self(token) {
      const { identity, memberId } = await identityAndId(token);
      const { rows } = await db.query<{ department_id: string | null; roles: AccessRole[]; features: string[] }>(`select md.department_key as department_id,
        coalesce((select jsonb_agg(jsonb_build_object('key', r.role_key, 'label', r.label) order by r.sort_order) from identity.member_roles mr join identity.platform_roles r using (role_key) where mr.member_id = m.id), '[]'::jsonb) as roles,
        coalesce((select array_agg(f.feature_key order by pf.sort_order) from identity.member_features(m.id) f join identity.platform_features pf on pf.feature_key = f.feature_key), array[]::text[]) as features
        from identity.members m left join identity.member_departments md on md.member_id = m.id where m.id = $1::uuid`, [memberId]);
      const row = rows[0];
      if (!row) throw new MemberCvError(404, "Member not found.");
      return { memberId, email: identity.email, name: identity.name, departmentId: row.department_id, roles: row.roles, features: row.features };
    },
    async members(token) {
      const { memberId } = await identityAndId(token);
      await requireAdmin(memberId);
      const [departmentRows, roleRows, memberRows] = await Promise.all([
        db.query<{ id: string; name: string }>("select department_key as id, name from identity.departments order by sort_order"),
        db.query<AccessRole>("select role_key as key, label from identity.platform_roles order by sort_order"),
        db.query<{ id: string; email: string; name: string; department_id: string | null; role_keys: string[] }>(`select m.id, lower(m.email) as email, coalesce(nullif(m.full_name, ''), m.email) as name, md.department_key as department_id,
          coalesce((select array_agg(mr.role_key order by r.sort_order) from identity.member_roles mr join identity.platform_roles r using (role_key) where mr.member_id = m.id), array[]::text[]) as role_keys
          from identity.members m left join identity.member_departments md on md.member_id = m.id order by lower(m.email)`),
      ]);
      return { departments: departmentRows.rows, roles: roleRows.rows, members: memberRows.rows.map(({ role_keys, department_id, ...m }) => ({ ...m, departmentId: department_id, roleKeys: role_keys })) };
    },
    async save(token, memberId, departmentId, roleKeys) {
      const { memberId: actorId } = await identityAndId(token);
      await requireAdmin(actorId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) throw new MemberCvError(400, "A valid member ID is required.");
      if (actorId === memberId) throw new MemberCvError(403, "You cannot change your own access assignments.");
      if (departmentId !== null && (typeof departmentId !== "string" || departmentId.length > 80)) throw new MemberCvError(400, "Choose a valid department.");
      if (!Array.isArray(roleKeys) || roleKeys.length > 4 || roleKeys.some(key => typeof key !== "string") || new Set(roleKeys).size !== roleKeys.length) throw new MemberCvError(400, "Choose valid platform roles.");
      try { await db.query("select identity.save_member_access($1::uuid, $2::text, $3::text[])", [memberId, departmentId, roleKeys]); }
      catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/Member not found/i.test(message)) throw new MemberCvError(404, "Member not found.");
        if (/Invalid|department is required|last Platform administrator/i.test(message)) throw new MemberCvError(400, message);
        throw error;
      }
      return { saved: true };
    },
  };
}

let pool: pg.Pool | undefined;
export function neonMemberAccessServices(): MemberAccessServices {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MemberCvError(503, "The member service is unavailable. Please try again later.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  const db: CvDatabase = { async query<T>(sql: string, params?: unknown[]) { const result = await pool!.query(sql, params); return { rows: result.rows as T[] }; } };
  const cv = createCvServices({ db, storage: { putPdf: async () => { throw new Error("Not used"); }, remove: async () => {}, presign: async () => { throw new Error("Not used"); } } });
  return createMemberAccessServices({ db, authenticate: token => cv.authenticate(token) });
}
