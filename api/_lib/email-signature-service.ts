import pg from "pg";
import { defaultSignatureSettings, parseSignatureSettings, renderSignature, type SignatureSnapshot } from "../../src/features/MemberPlatform/email-signature.js";
import { neonCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

export interface EmailSignatureServices {
  read(token: string): Promise<SignatureSnapshot>;
  save(token: string, settings: unknown, expectedRevision: unknown): Promise<SignatureSnapshot>;
  forMember(identity: WorkspaceIdentity): Promise<SignatureSnapshot>;
}

export function createEmailSignatureServices(deps: { db: CvDatabase; authenticate: (token: string) => Promise<WorkspaceIdentity> }): EmailSignatureServices {
  async function member(identity: WorkspaceIdentity, requireAdmin = false) {
    const { rows } = await deps.db.query<{ name: string; email: string; role: string; admin: boolean }>(
      `select coalesce(nullif(m.full_name, ''), m.email) as name, m.email, coalesce(m.helix_role, '') as role,
        exists(select 1 from identity.member_roles r where r.member_id = m.id and r.role_key = 'platform_administrator') as admin
       from identity.members m where m.id = $1::uuid and m.google_sub = $2 and lower(m.email) = lower($3)`,
      [identity.userId, identity.googleSub, identity.email],
    );
    if (!rows[0]) throw new MemberCvError(403, "Your Google identity no longer matches this profile.");
    if (requireAdmin && !rows[0].admin) throw new MemberCvError(403, "Platform administrator access is required to edit the email signature.");
    return rows[0];
  }
  async function forMember(identity: WorkspaceIdentity): Promise<SignatureSnapshot> {
    const profile = await member(identity);
    const { rows } = await deps.db.query<{ settings: unknown; revision: number }>("select settings, revision from member_mail.signature_settings where singleton = true");
    const settings = rows[0] ? parseSignatureSettings(rows[0].settings) : structuredClone(defaultSignatureSettings);
    return { settings, revision: rows[0]?.revision ?? 0, signature: renderSignature(settings, profile) };
  }
  return {
    forMember,
    async read(token) { return forMember(await deps.authenticate(token)); },
    async save(token, input, expectedRevision) {
      const identity = await deps.authenticate(token);
      await member(identity, true);
      if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0) throw new MemberCvError(400, "Reload the saved signature before editing.");
      let settings;
      try { settings = parseSignatureSettings(input); }
      catch (error) { throw new MemberCvError(400, error instanceof Error ? error.message : "Check the signature settings."); }
      const { rows } = await deps.db.query<{ revision: number }>(
        `insert into member_mail.signature_settings (singleton, settings, revision, updated_by)
         select true, $1::jsonb, 1, $2::uuid where $3::integer = 0
         on conflict (singleton) do nothing returning revision`, [JSON.stringify(settings), identity.userId, expectedRevision],
      );
      if (!rows.length) {
        const updated = await deps.db.query<{ revision: number }>(
          `update member_mail.signature_settings set settings = $1::jsonb, revision = revision + 1, updated_by = $2::uuid, updated_at = now()
           where singleton = true and revision = $3::integer returning revision`, [JSON.stringify(settings), identity.userId, expectedRevision],
        );
        if (!updated.rows.length) throw new MemberCvError(409, "The signature changed in another session. Reload it before saving again.");
      }
      return forMember(identity);
    },
  };
}

let pool: pg.Pool | undefined;
export function neonEmailSignatureServices(): EmailSignatureServices {
  if (!process.env.DATABASE_URL) throw new MemberCvError(503, "Email signature settings are temporarily unavailable.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(process.env.DATABASE_URL), max: 1 });
  const db: CvDatabase = { async query<T>(sql: string, params?: unknown[]) { const result = await pool!.query(sql, params); return { rows: result.rows as T[] }; } };
  return createEmailSignatureServices({ db, authenticate: (token) => neonCvServices().authenticate(token) });
}
