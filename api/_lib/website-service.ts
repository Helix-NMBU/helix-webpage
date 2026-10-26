import { randomUUID } from "node:crypto";
import pg from "pg";
import { createCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { createCvStorage } from "./member-cv-storage.js";
import { MemberCvError } from "./member-cv-error.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import { createWebsiteStorage, type WebsiteStorage } from "./website-storage.js";
import { createWebsiteMailer, type EmailStatus, type WebsiteMailer } from "./website-email.js";
import { applicationId, isApplicationPath, parseApplication, parseCv, parseWebsitePosition, type ApplicationRow, type ManagedWebsitePosition, type WebsitePosition } from "./website-validation.js";

export interface WebsiteServices {
  positions(): Promise<WebsitePosition[]>;
  managedPositions(token: string): Promise<ManagedWebsitePosition[]>;
  createPosition(token: string, body: Record<string, unknown>): Promise<ManagedWebsitePosition>;
  updatePosition(token: string, id: string, body: Record<string, unknown>): Promise<ManagedWebsitePosition>;
  setPositionVisibility(token: string, id: string, visible: boolean): Promise<ManagedWebsitePosition>;
  deletePosition(token: string, id: string): Promise<{ deleted: true }>;
  submit(body: Record<string, unknown>, rateLimitKey: string): Promise<{ id: string; emailStatus: EmailStatus | "pending" }>;
  session(token: string): Promise<{ email: string; name: string }>;
  list(token: string, offset: number): Promise<{ applications: ApplicationRow[]; nextOffset: number | null }>;
  read(token: string, id: string): Promise<ApplicationRow>;
  file(token: string, id: string, kind: "cv" | "photo"): Promise<{ url: string; expiresIn: number }>;
  remove(token: string, id: string, reject: boolean): Promise<{ emailStatus: EmailStatus; cleanupPending: boolean }>;
  confirmation(token: string, id: string): Promise<{ emailStatus: EmailStatus }>;
}
export function applicationSeason(now: Date): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find(p => p.type === "year")?.value);
  const month = Number(parts.find(p => p.type === "month")?.value);
  return `S${String((month >= 7 ? year + 1 : year) % 100).padStart(2, "0")}`;
}
export function createWebsiteServices(deps: {
  db: CvDatabase; authenticate: (token: string) => Promise<WorkspaceIdentity>;
  storage: () => WebsiteStorage; positions?: () => Promise<WebsitePosition[]>;
  mail: WebsiteMailer; now?: () => Date;
}): WebsiteServices {
  const { db } = deps;
  async function authorize(token: string) {
    const identity = await deps.authenticate(token);
    const { rows } = await db.query<{ allowed: boolean }>(`select identity.member_has_feature(m.id, 'recruitment.manage') as allowed
      from identity.members m where m.id = $1::uuid and m.google_sub = $2 and lower(m.email) = lower($3)`, [identity.userId, identity.googleSub, identity.email]);
    if (!rows[0]?.allowed) throw new MemberCvError(403, "Your account does not have recruitment access. Contact Helix.");
    return identity;
  }
  const positionId = (id: string) => {
    if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new MemberCvError(400, "A valid position ID is required.");
    return id;
  };
  async function visiblePositions(): Promise<WebsitePosition[]> {
    const { rows } = await db.query<{ document: WebsitePosition }>("select document from website.positions where visible = true order by display_order, id");
    return rows.map(row => row.document);
  }
  async function readRow(id: string): Promise<ApplicationRow> {
    const row = (await db.query<ApplicationRow>("select * from website.applications where id = $1::uuid", [applicationId(id)])).rows[0];
    if (!row) throw new MemberCvError(404, "Application not found.");
    return row;
  }
  function paths(row: ApplicationRow) {
    const keys = [row.cv_path, row.photo_path].filter((p): p is string => Boolean(p));
    if (keys.some(path => !isApplicationPath(row, path))) throw new MemberCvError(409, "Application file ownership could not be verified. Contact Helix.");
    return keys;
  }
  return {
    positions: visiblePositions,
    async managedPositions(token) {
      await authorize(token);
      const { rows } = await db.query<{ document: WebsitePosition; visible: boolean }>("select document, visible from website.positions order by display_order, id");
      return rows.map(row => ({ ...row.document, visible: row.visible }));
    },
    async createPosition(token, body) {
      await authorize(token);
      const position = parseWebsitePosition(body.position ?? body);
      const { rows } = await db.query<{ document: WebsitePosition; visible: boolean }>(`insert into website.positions (id, document, visible, display_order)
        values ($1, $2::jsonb, false, coalesce((select max(display_order) + 1 from website.positions), 0))
        returning document, visible`, [position.id, JSON.stringify(position)]);
      if (!rows[0]) throw new MemberCvError(503, "Could not save the position.");
      return { ...rows[0].document, visible: rows[0].visible };
    },
    async updatePosition(token, id, body) {
      await authorize(token);
      const key = positionId(id);
      const position = parseWebsitePosition({ ...(body.position && typeof body.position === "object" ? body.position as object : body), id: key });
      const { rows } = await db.query<{ document: WebsitePosition; visible: boolean }>("update website.positions set document = $2::jsonb, updated_at = now() where id = $1 returning document, visible", [key, JSON.stringify(position)]);
      if (!rows[0]) throw new MemberCvError(404, "Position not found.");
      return { ...rows[0].document, visible: rows[0].visible };
    },
    async setPositionVisibility(token, id, visible) {
      await authorize(token);
      if (typeof visible !== "boolean") throw new MemberCvError(400, "Choose whether the position is visible.");
      const { rows } = await db.query<{ document: WebsitePosition; visible: boolean }>("update website.positions set visible = $2, updated_at = now() where id = $1 returning document, visible", [positionId(id), visible]);
      if (!rows[0]) throw new MemberCvError(404, "Position not found.");
      return { ...rows[0].document, visible: rows[0].visible };
    },
    async deletePosition(token, id) {
      await authorize(token);
      const { rows } = await db.query("delete from website.positions where id = $1 returning id", [positionId(id)]);
      if (!rows.length) throw new MemberCvError(404, "Position not found.");
      return { deleted: true };
    },
    async submit(body, rateLimitKey) {
      const input = parseApplication(body, await visiblePositions());
      const bytes = parseCv(body.cv_base64);
      await db.query("delete from website.application_submission_limits where window_started_at < now() - interval '2 days'");
      const limited = await db.query<{ request_count: number }>(`insert into website.application_submission_limits (rate_key, window_started_at, request_count)
        values ($1, now(), 1)
        on conflict (rate_key) do update set
          request_count = case when website.application_submission_limits.window_started_at <= now() - interval '1 hour' then 1 else website.application_submission_limits.request_count + 1 end,
          window_started_at = case when website.application_submission_limits.window_started_at <= now() - interval '1 hour' then now() else website.application_submission_limits.window_started_at end
        returning request_count`, [rateLimitKey]);
      if (limited.rows[0]?.request_count > 10) throw new MemberCvError(429, "Too many applications were submitted from this network. Please try again later.");
      const id = randomUUID();
      const season = applicationSeason((deps.now ?? (() => new Date()))());
      const path = `${season}/${id}/cv.pdf`;
      const storage = deps.storage();
      // Track before writing S3, including uncertain uploads/commits.
      await db.query("insert into website.application_uploads (path) values ($1)", [path]);
      try { await storage.put(path, bytes); }
      catch { throw new MemberCvError(503, "Could not store your CV. Please try again."); }
      let row: ApplicationRow;
      try {
        const saved = await db.query<ApplicationRow>(`with saved as (
          insert into website.applications (id, season, full_name, email, phone, study_program, study_program_other,
            year_of_study, motivation, position_id, position_title, interested_departments, cv_path, consent)
          values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13, true) returning *
        ), untracked as (delete from website.application_uploads where path = $13 and exists (select 1 from saved))
        select * from saved`, [id, season, input.full_name, input.email, input.phone, input.study_program, input.study_program_other,
          input.year_of_study, input.motivation, input.position_id, input.position_title, input.interested_departments, path]);
        if (!saved.rows[0]) throw new Error("Missing inserted application");
        row = saved.rows[0];
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "23505") {
          // Only a known rollback permits immediate removal. Uncertain commits
          // retain their files to avoid destroying a successfully saved CV.
          try { await storage.remove(path); await db.query("delete from website.application_uploads where path = $1", [path]); } catch { /* tracked */ }
          throw new MemberCvError(409, "An application has already been submitted for this email this season. Contact post@helixnmbu.no to make changes.");
        }
        throw new MemberCvError(503, "The submission result could not be confirmed. Contact post@helixnmbu.no before submitting again.");
      }
      let emailStatus: EmailStatus | "pending" = "pending";
      try { emailStatus = await deps.mail(row, "confirmation"); } catch { /* application is saved */ }
      return { id, emailStatus };
    },
    async session(token) { const identity = await authorize(token); return { email: identity.email, name: identity.name }; },
    async list(token, offset) {
      await authorize(token);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new MemberCvError(400, "Invalid page.");
      const { rows } = await db.query<ApplicationRow>("select * from website.applications order by created_at desc, id limit 101 offset $1", [offset]);
      return { applications: rows.slice(0, 100), nextOffset: rows.length > 100 ? offset + 100 : null };
    },
    async read(token, id) { await authorize(token); return readRow(id); },
    async file(token, id, kind) {
      await authorize(token);
      const row = await readRow(id);
      const path = kind === "photo" ? row.photo_path : row.cv_path;
      if (!path) throw new MemberCvError(404, "Application file not found.");
      if (!isApplicationPath(row, path)) throw new MemberCvError(403, "Application file ownership could not be verified.");
      return { url: await deps.storage().download(path, kind), expiresIn: 120 };
    },
    async remove(token, id, reject) {
      await authorize(token);
      const row = await readRow(id);
      const ownedPaths = paths(row);
      const emailStatus = reject ? await deps.mail(row, "rejection") : "skipped";
      const deleted = await db.query<{ path: string }>(`with removed as (
        delete from website.applications where id = $1::uuid returning cv_path, photo_path
      ), keys as (select cv_path as path from removed union select photo_path from removed where photo_path is not null)
      insert into website.file_cleanup (path) select path from keys on conflict do nothing returning path`, [id]);
      let cleanupPending = false;
      for (const { path } of deleted.rows) {
        if (!ownedPaths.includes(path)) { cleanupPending = true; continue; }
        try {
          const used = await db.query("select id from website.applications where cv_path = $1 or photo_path = $1 limit 1", [path]);
          if (used.rows.length) { cleanupPending = true; continue; }
          await deps.storage().remove(path);
          await db.query("delete from website.file_cleanup where path = $1", [path]);
        } catch { cleanupPending = true; }
      }
      return { emailStatus, cleanupPending };
    },
    async confirmation(token, id) { await authorize(token); return { emailStatus: await deps.mail(await readRow(id), "confirmation") }; },
  };
}
let pool: pg.Pool | undefined;
export function neonWebsiteServices(): WebsiteServices {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MemberCvError(503, "The application service is unavailable. Please try again later.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  const db: CvDatabase = { async query<T>(sql: string, params?: unknown[]) {
    const result = await pool!.query(sql, params); return { rows: result.rows as T[] };
  } };
  const cv = createCvServices({ db, storage: {
    putPdf: (path, bytes) => createCvStorage().putPdf(path, bytes),
    remove: path => createCvStorage().remove(path), presign: path => createCvStorage().presign(path),
  } });
  return createWebsiteServices({ db, authenticate: token => cv.authenticate(token),
    storage: () => createWebsiteStorage(), mail: createWebsiteMailer(db),
    positions: async () => [],
  });
}
