import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CvData, CvEnvelope, CvRecord, CvSharing } from "../../src/features/MemberCV/types.js";

export class MemberCvError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
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
  newPath(userId: string): string;
}
export function envelope(document: StoredCv, identity: WorkspaceIdentity): CvEnvelope {
  const { publishedPath: _path, ...record } = document;
  return { document: record, identity: { email: identity.email, name: identity.name } };
}
export function serverClients() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new MemberCvError(503, "Member portal server configuration is missing.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return { auth: createClient(url, anon, options), admin: createClient(url, service, options) };
}
export function bearer(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new MemberCvError(401, "Log in to continue.");
  return match[1];
}
export function matchesGoogleUser(user: { id: string; email?: string; identities?: { provider: string; identity_data?: Record<string, unknown> }[] }, identity: WorkspaceIdentity): boolean {
  return user.id === identity.userId && user.email?.toLowerCase() === identity.email && Boolean(user.identities?.some((item) => item.provider === "google" && item.identity_data?.sub === identity.googleSub));
}
function record(row: Record<string, unknown>): StoredCv {
  return { draft: row.draft as CvData, sharing: row.sharing as CvSharing, revision: Number(row.revision), publishedRevision: row.published_revision === null ? null : Number(row.published_revision), publishedAt: row.published_at as string | null, publishedPath: row.published_path as string | null };
}
export function supabaseCvServices(clients = serverClients()): CvServices {
  const { auth, admin } = clients;
  return {
    async authenticate(token) {
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user) throw new MemberCvError(401, "Your session has expired. Log in again.");
      const { data: row, error: identityError } = await admin.from("member_workspace_identities").select("user_id,google_sub,email,full_name").eq("user_id", data.user.id).maybeSingle();
      if (identityError) throw new MemberCvError(503, "Could not verify member access.");
      if (!row) throw new MemberCvError(403, "Log in with your verified Helix Google Workspace account.");
      const identity = { userId: row.user_id, googleSub: row.google_sub, email: row.email, name: row.full_name };
      if (!matchesGoogleUser(data.user, identity)) throw new MemberCvError(403, "Your Google identity no longer matches this profile. Log in with Helix Google again.");
      return identity;
    },
    async read(userId) {
      const { data, error } = await admin.from("member_cv_documents").select("*").eq("user_id", userId).single();
      if (error || !data) throw new MemberCvError(503, "Could not load your CV.");
      return record(data);
    },
    async commit(userId, change) {
      const { data, error } = await admin.rpc("commit_member_cv", { p_user_id: userId, p_action: change.action, p_expected_revision: change.expectedRevision, p_draft: change.draft ?? null, p_sharing: change.sharing ?? null, p_path: change.path ?? null });
      if (error) {
        if (error.code === "40001") throw new MemberCvError(409, "This CV changed in another session. Reload the saved version before trying again.");
        throw new MemberCvError(503, "The save result could not be confirmed. Reload your CV before retrying.");
      }
      return record(data as Record<string, unknown>);
    },
    async prepareUpload(userId, path, expectedRevision) {
      const { error } = await admin.rpc("prepare_member_cv_upload", { p_user_id: userId, p_path: path, p_expected_revision: expectedRevision });
      if (error?.code === "40001") throw new MemberCvError(409, "This CV changed in another session. Reload the saved version before trying again.");
      if (error) throw new MemberCvError(503, "Could not prepare the generated file. Publication has not changed.");
    },
    async settleUpload(userId, path, uploadUncertain = false) {
      // This RPC takes the same document lock as publication. It either observes
      // a finished commit or cancels this candidate before a queued commit starts.
      const { data, error } = await admin.rpc("settle_member_cv_upload", { p_user_id: userId, p_path: path, p_upload_uncertain: uploadUncertain });
      if (error || !data) throw new MemberCvError(503, "The publication result could not be confirmed. Reload your CV before retrying. Its generated file remains tracked.");
      return record(data as Record<string, unknown>);
    },
    async upload(path, bytes) {
      const { error } = await admin.storage.from("member-cvs").upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (error) throw new MemberCvError(503, "Could not store the generated CV. Publication has not changed.");
    },
    async cleanup(userId) {
      // Expired abandoned candidates are settled under the publication lock.
      // Currently running uploads keep their lease and cannot be retired here.
      const { error: settlementError } = await admin.rpc("settle_member_cv_upload", { p_user_id: userId, p_path: null });
      if (settlementError) throw new MemberCvError(503, "CV file cleanup is pending.");
      const { data, error } = await admin.from("member_cv_file_cleanup").select("path,not_before").eq("user_id", userId);
      if (error) throw new MemberCvError(503, "CV file cleanup is pending.");
      let deferred = false;
      for (const item of data ?? []) {
        if (Date.parse(item.not_before) > Date.now()) { deferred = true; continue; }
        const { data: current, error: currentError } = await admin.from("member_cv_documents").select("published_path").eq("user_id", userId).single();
        const { data: projection, error: projectionError } = await admin.from("students").select("cv_url").eq("id", userId).maybeSingle();
        if (currentError || projectionError) throw new MemberCvError(503, "Could not verify retired CV cleanup. The files have been preserved.");
        if (current?.published_path === item.path || projection?.cv_url === item.path) {
          const { error: retireError } = await admin.from("member_cv_file_cleanup").delete().eq("user_id", userId).eq("path", item.path);
          if (retireError) throw new MemberCvError(503, "CV file cleanup is pending.");
          continue;
        }
        await removeStoredCv(admin, item.path);
        const { error: candidateError } = await admin.from("member_cv_upload_candidates").update({ status: "deleted" }).eq("user_id", userId).eq("path", item.path).eq("status", "retired");
        if (candidateError) throw new MemberCvError(503, "CV file cleanup is pending.");
        const { error: deleteError } = await admin.from("member_cv_file_cleanup").delete().eq("user_id", userId).eq("path", item.path);
        if (deleteError) throw new MemberCvError(503, "CV file cleanup is pending.");
      }
      if (deferred) throw new MemberCvError(503, "CV file cleanup is pending while an uncertain upload settles.");
    },
    newPath(userId) { return `${userId}/${randomUUID()}.pdf`; },
  };
}
async function removeStoredCv(admin: SupabaseClient, path: string) {
  const { error } = await admin.storage.from("member-cvs").remove([path]);
  if (error) throw new MemberCvError(503, "Publication visibility has changed, but retired file deletion is pending. Reload your CV to retry cleanup.");
}
