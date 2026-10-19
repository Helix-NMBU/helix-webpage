import { randomUUID } from "node:crypto";
import pg from "pg";
import type { CvData, CvEnvelope, CvRecord, CvSharing } from "../../src/features/MemberCV/types.js";
import { emptyCv, privateSharing } from "../../src/features/MemberCV/model.js";
import { MemberCvError } from "./member-cv-error.js";
import { assertFreshHelixGoogleAccount, assertLinkedHelixAccount } from "./helix-workspace.js";
import { verifyGoogleIdToken, verifyNeonSession } from "./neon-session.js";
import { createCvStorage, isOwnedPdfPath, type CvObjectStorage } from "./member-cv-storage.js";

export { MemberCvError } from "./member-cv-error.js";
export type WorkspaceIdentity = { userId: string; googleSub: string; email: string; name: string };
export type StoredCv = CvRecord & { publishedPath: string | null };
export type CvCommit = { action: "save" | "publish" | "withdraw"; expectedRevision: number; draft?: CvData; sharing?: CvSharing; path?: string | null };
export interface CvServices {
  authenticate(token: string): Promise<WorkspaceIdentity>;
  read(userId: string): Promise<StoredCv>;
  commit(userId: string, change: CvCommit): Promise<StoredCv>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  prepareUpload(userId: string, path: string, expectedRevision: number): Promise<void>;
  settleUpload(userId: string, path: string | null, uploadUncertain?: boolean): Promise<StoredCv>;
  cleanup(userId: string): Promise<void>;
  presignDownload(userId: string): Promise<{ url: string; expiresIn: number }>;
  newPath(userId: string): string;
}
export interface CvDatabase {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
type AuthRow = { email: string; name: string; email_verified: boolean; banned: boolean; account_id: string; id_token: string | null };
type MemberRow = { id: string; google_sub: string; email: string; full_name: string };

let pool: pg.Pool | undefined;
function database(): CvDatabase {
  if (!process.env.DATABASE_URL) throw new MemberCvError(503, "Member portal server configuration is missing.");
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const result = await pool!.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}

export function envelope(document: StoredCv, identity: WorkspaceIdentity): CvEnvelope {
  const { publishedPath: _path, ...record } = document;
  return { document: record, identity: { email: identity.email, name: identity.name } };
}
export function bearer(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new MemberCvError(401, "Log in to continue.");
  return match[1];
}
function record(row: Record<string, unknown>): StoredCv {
  return {
    draft: row.draft as CvData,
    sharing: row.sharing as CvSharing,
    revision: Number(row.revision),
    publishedRevision: row.published_revision === null || row.published_revision === undefined ? null : Number(row.published_revision),
    publishedAt: (row.published_at as string | null) ?? null,
    publishedPath: (row.published_path as string | null) ?? null,
  };
}
function mapSqlError(error: unknown, fallback: string): never {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "40001" || /Revision conflict|Upload candidate cancelled or expired/i.test(message)) {
    throw new MemberCvError(409, "This CV changed in another session. Reload the saved version before trying again.");
  }
  if (/Incomplete publication/i.test(message)) throw new MemberCvError(400, "Add your name and an education entry with institution and degree before publishing.");
  if (/Identity mismatch/i.test(message)) throw new MemberCvError(403, "Your Google identity no longer matches this profile. Log in with Helix Google again.");
  throw new MemberCvError(503, fallback);
}

export function createCvServices(deps: {
  db: CvDatabase;
  storage: CvObjectStorage;
  verifySession?: (token: string) => Promise<{ userId: string }>;
  verifyGoogle?: (idToken: string) => Promise<{ email: string; emailVerified: boolean; hd?: string; googleSub: string } | null>;
} ): CvServices {
  const { db, storage } = deps;
  const verifySession = deps.verifySession ?? verifyNeonSession;
  const verifyGoogle = deps.verifyGoogle ?? verifyGoogleIdToken;
  return {
    async authenticate(token) {
      const session = await verifySession(token);
      let auth: AuthRow | undefined;
      let member: MemberRow | undefined;
      try {
        auth = (await db.query<AuthRow>(
          `select lower(u.email) as email, u.name, u."emailVerified" as email_verified, coalesce(u.banned, false) as banned,
                  a."accountId" as account_id, a."idToken" as id_token
           from neon_auth."user" u
           join neon_auth.account a on a."userId" = u.id and a."providerId" = 'google'
           where u.id = $1
           order by a."createdAt" asc
           limit 1`,
          [session.userId],
        )).rows[0];
        member = (await db.query<MemberRow>(
          "select id, google_sub, email, full_name from identity.members where auth_user_id = $1",
          [session.userId],
        )).rows[0];
      } catch {
        throw new MemberCvError(503, "Could not verify member access.");
      }
      if (!auth) throw new MemberCvError(403, "Log in with your verified Helix Google Workspace account.");
      const linked = Boolean(member && member.google_sub === auth.account_id && member.email === auth.email);
      if (!linked) {
        if (!auth.id_token) throw new MemberCvError(403, "Google Workspace could not be confirmed for this account. Sign in with Google again.");
        const claims = await verifyGoogle(auth.id_token);
        if (!claims || claims.email !== auth.email) throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account.");
        assertFreshHelixGoogleAccount({
          email: auth.email,
          emailVerified: auth.email_verified && claims.emailVerified,
          hd: claims.hd,
          googleSub: claims.googleSub,
          accountSub: auth.account_id,
          banned: auth.banned,
        });
      } else if (member) {
        assertLinkedHelixAccount({
          email: auth.email,
          emailVerified: auth.email_verified,
          googleSub: auth.account_id,
          accountSub: auth.account_id,
          storedSub: member.google_sub,
          storedEmail: member.email,
          banned: auth.banned,
        });
      }
      try {
        const saved = await db.query<{ onboard_member: string }>(
          "select identity.onboard_member($1, $2, $3, $4, $5::jsonb, $6::jsonb)",
          [session.userId, auth.account_id, auth.email, auth.name || member?.full_name || "", JSON.stringify(emptyCv(auth.name || "", auth.email)), JSON.stringify(privateSharing)],
        );
        const memberId = saved.rows[0]?.onboard_member ?? member?.id;
        if (!memberId) throw new Error("missing member");
        return { userId: memberId, googleSub: auth.account_id, email: auth.email, name: auth.name || "" };
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        mapSqlError(error, "Could not prepare your private member profile. Try signing in again.");
      }
    },
    async read(userId) {
      try {
        const saved = await db.query("select draft, sharing, revision, published_revision, published_at, published_path from cv.documents where member_id = $1", [userId]);
        if (!saved.rows[0]) throw new MemberCvError(503, "Could not load your CV.");
        return record(saved.rows[0]);
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        throw new MemberCvError(503, "Could not load your CV.");
      }
    },
    async commit(userId, change) {
      try {
        const saved = await db.query<{ commit_member_cv: Record<string, unknown> }>(
          "select cv.commit_member_cv($1, $2, $3, $4::jsonb, $5::jsonb, $6) as commit_member_cv",
          [userId, change.action, change.expectedRevision, change.draft ? JSON.stringify(change.draft) : null, change.sharing ? JSON.stringify(change.sharing) : null, change.path ?? null],
        );
        if (!saved.rows[0]?.commit_member_cv) throw new Error("empty");
        return record(saved.rows[0].commit_member_cv);
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        mapSqlError(error, "The save result could not be confirmed. Reload your CV before retrying.");
      }
    },
    async prepareUpload(userId, path, expectedRevision) {
      try {
        await db.query("select cv.prepare_upload($1, $2, $3)", [userId, path, expectedRevision]);
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        mapSqlError(error, "Could not prepare the generated file. Publication has not changed.");
      }
    },
    async settleUpload(userId, path, uploadUncertain = false) {
      try {
        const saved = await db.query<{ settle_upload: Record<string, unknown> }>(
          "select cv.settle_upload($1, $2, $3) as settle_upload",
          [userId, path, uploadUncertain],
        );
        if (!saved.rows[0]?.settle_upload) throw new Error("empty");
        return record(saved.rows[0].settle_upload);
      } catch (error) {
        if (error instanceof MemberCvError) throw error;
        throw new MemberCvError(503, "The publication result could not be confirmed. Reload your CV before retrying. Its generated file remains tracked.");
      }
    },
    async upload(path, bytes) {
      await storage.putPdf(path, bytes);
    },
    async cleanup(userId) {
      try {
        await db.query("select cv.settle_upload($1, null, false)", [userId]);
      } catch {
        throw new MemberCvError(503, "CV file cleanup is pending.");
      }
      let queue: { path: string; not_before: string }[];
      try {
        queue = (await db.query<{ path: string; not_before: string }>("select path, not_before from cv.file_cleanup where member_id = $1", [userId])).rows;
      } catch {
        throw new MemberCvError(503, "CV file cleanup is pending.");
      }
      let deferred = false;
      for (const item of queue) {
        if (Date.parse(item.not_before) > Date.now()) { deferred = true; continue; }
        let current: { published_path: string | null; cv_path: string | null } | undefined;
        try {
          current = (await db.query<{ published_path: string | null; cv_path: string | null }>(
            `select d.published_path, e.cv_path
             from cv.documents d
             left join cv.directory_entries e on e.member_id = d.member_id
             where d.member_id = $1`,
            [userId],
          )).rows[0];
        } catch {
          throw new MemberCvError(503, "Could not verify retired CV cleanup. The files have been preserved.");
        }
        if (!current) throw new MemberCvError(503, "Could not verify retired CV cleanup. The files have been preserved.");
        if (current.published_path === item.path || current.cv_path === item.path) {
          try { await db.query("delete from cv.file_cleanup where member_id = $1 and path = $2", [userId, item.path]); }
          catch { throw new MemberCvError(503, "CV file cleanup is pending."); }
          continue;
        }
        try { await storage.remove(item.path); }
        catch (error) {
          if (error instanceof MemberCvError) throw error;
          throw new MemberCvError(503, "Publication visibility has changed, but retired file deletion is pending. Reload your CV to retry cleanup.");
        }
        try {
          await db.query("update cv.upload_candidates set status = 'deleted' where member_id = $1 and path = $2 and status = 'retired'", [userId, item.path]);
          await db.query("delete from cv.file_cleanup where member_id = $1 and path = $2", [userId, item.path]);
        } catch {
          throw new MemberCvError(503, "CV file cleanup is pending.");
        }
      }
      if (deferred) throw new MemberCvError(503, "CV file cleanup is pending while an uncertain upload settles.");
    },
    async presignDownload(userId) {
      const document = await this.read(userId);
      if (!document.publishedPath || !isOwnedPdfPath(userId, document.publishedPath)) {
        throw new MemberCvError(404, "No published CV is available to download.");
      }
      return { url: await storage.presign(document.publishedPath), expiresIn: 120 };
    },
    newPath(userId) { return `${userId}/${randomUUID()}.pdf`; },
  };
}

export function neonCvServices(): CvServices {
  return createCvServices({ db: database(), storage: createCvStorage() });
}
