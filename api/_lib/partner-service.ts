import pg from "pg";
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import type { PartnerDirectory, PartnerDownload, PartnerSession } from "../../src/features/PartnerPortal/types.js";
import type { RequestDetail, RequestHistory, RequestList, RequestReply, RequestSummary } from "../../src/features/SponsorWorkspace/request-types.js";
import { RequestWorkflowError, validateExpectedRevision, validateRequestDraft, validateRequestReply, REQUEST_STATUSES, type RequestStatus } from "../../src/features/SponsorWorkspace/requests.js";
import type { CvDatabase } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { createCvStorage, isOwnedPdfPath, PRESIGN_SECONDS, type CvObjectStorage } from "./member-cv-storage.js";
import { verifyNeonSession } from "./neon-session.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

export interface PartnerServices {
  requestOtp(email: string, origin: string): Promise<void>;
  authenticate(token: string): Promise<{ userId: string }>;
  session(userId: string): Promise<PartnerSession>;
  directory(userId: string, organizationId: string): Promise<PartnerDirectory>;
  download(userId: string, organizationId: string, memberId: string): Promise<PartnerDownload>;
  requests(userId: string, organizationId: string): Promise<RequestList>;
  request(userId: string, organizationId: string, requestId: string): Promise<{ request: RequestDetail }>;
  createRequest(userId: string, organizationId: string, draft: unknown): Promise<{ request: RequestDetail }>;
  mutateRequest(userId: string, organizationId: string, requestId: string, body: unknown): Promise<{ request: RequestDetail }>;
}
type MembershipRow = { organization_id: string; organization_name: string; email: string; full_name: string; agreement_tier: string | null };
type CvRow = {
  member_id: string; full_name: string; field_of_study: string | null; graduation_year: number | null;
  contact_email: string | null; phone: string | null; has_pdf: boolean;
};
type RequestRow = Record<string, unknown> & {
  id: string; partner_organization_id: string; organization_id: string | null;
  organization_name: string; type: string; title: string; status: RequestStatus; revision: number;
  assigned_admin_id: string | null; assigned_admin_email: string | null;
  created_at: string | Date; updated_at: string | Date;
};
const PARTNER_REQUEST_SELECT = `select r.*, o.id::text as organization_id, o.name as organization_name,
    s.email as assigned_admin_email
  from sponsor.requests r
  join partner.organizations o on o.id = r.partner_organization_id
  left join sponsor.staff s on s.id = r.assigned_admin_id`;
function asIso(value: unknown): string { return value instanceof Date ? value.toISOString() : String(value); }
function requestSummary(row: RequestRow): RequestSummary {
  return {
    id: String(row.id), organizationId: String(row.organization_id), organizationName: String(row.organization_name),
    type: row.type as RequestSummary["type"], title: String(row.title), status: row.status,
    revision: Number(row.revision), assignedAdminId: row.assigned_admin_id,
    assignedAdminName: row.assigned_admin_email, createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at),
  };
}
function workflowError(error: unknown): never {
  if (error instanceof MemberCvError || error instanceof RequestWorkflowError) throw error;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "P0002") throw new MemberCvError(404, "Request was not found.");
  if (code === "40001") throw new MemberCvError(409, error instanceof Error ? error.message : "This request changed. Reload it before trying again.");
  if (code === "42501") throw new MemberCvError(403, "Your current partner access does not allow this action.");
  if (["22023", "22P02", "23514"].includes(code)) throw new MemberCvError(400, "Check the request fields and try again.");
  throw new MemberCvError(503, "Could not save the request. Reload it before trying again.");
}

export function createPartnerServices(options: {
  db: CvDatabase;
  verify?: PartnerServices["authenticate"];
  storage: () => Pick<CvObjectStorage, "presign">;
  sendOtp?: (email: string, origin: string) => Promise<void>;
}): PartnerServices {
  const { db } = options;
  return {
    async requestOtp(email, origin) {
      const { rows } = await db.query<{ allowed: boolean }>("select partner.can_request_otp($1) as allowed", [email]);
      if (!rows[0]?.allowed) return;
      try {
        if (!options.sendOtp) throw new Error("OTP delivery is not configured");
        await options.sendOtp(email, origin);
      } catch {
        // Delivery errors, including rate limiting, must not reveal invitations.
        // No response from Neon (or address) is returned to this public caller.
      }
    },
    authenticate: options.verify ?? verifyNeonSession,
    async session(userId) {
      const { rows } = await db.query<MembershipRow>(`select m.organization_id, m.organization_name, m.email, m.full_name, o.agreement_tier
        from partner.authorized_memberships($1::uuid) m
        join partner.organizations o on o.id = m.organization_id`, [userId]);
      if (!rows.length) throw new MemberCvError(403, "Your account does not have active partner access. Contact Helix.");
      return {
        user: { email: rows[0].email, name: rows[0].full_name },
        organizations: rows.map((row) => ({
          id: row.organization_id,
          name: row.organization_name,
          entitlements: {
            directory: ["silver", "gold", "platinum", "main"].includes(row.agreement_tier ?? ""),
            requests: ["bronze", "silver", "gold", "platinum", "main"].includes(row.agreement_tier ?? ""),
          },
        })),
      };
    },
    async directory(userId, organizationId) {
      const entitlement = await db.query<{ allowed: boolean }>("select partner.can_access_directory($1::uuid, $2::uuid) as allowed", [userId, organizationId]);
      if (!entitlement.rows[0]?.allowed) throw new MemberCvError(403, "Your current agreement does not include the Talent Directory.");
      const { rows } = await partnerQuery<CvRow>(db, `
        select member_id, full_name, field_of_study, graduation_year, contact_email, phone, pdf_path is not null as has_pdf
        from partner.published_cvs($1::uuid, $2::uuid)`, [userId, organizationId]);
      return { members: rows.map((row) => ({
        memberId: row.member_id, fullName: row.full_name, fieldOfStudy: row.field_of_study,
        graduationYear: row.graduation_year, contactEmail: row.contact_email, phone: row.phone, hasPdf: row.has_pdf,
      })) };
    },
    async download(userId, organizationId, memberId) {
      const entitlement = await db.query<{ allowed: boolean }>("select partner.can_access_directory($1::uuid, $2::uuid) as allowed", [userId, organizationId]);
      if (!entitlement.rows[0]?.allowed) throw new MemberCvError(403, "Your current agreement does not include the Talent Directory.");
      const { rows } = await partnerQuery<{ pdf_path: string }>(db, `
        select pdf_path from partner.published_cvs($1::uuid, $2::uuid) where member_id = $3::uuid`,
      [userId, organizationId, memberId]);
      const path = rows[0]?.pdf_path;
      if (!path || !isOwnedPdfPath(memberId, path)) throw new MemberCvError(404, "No published CV is available to download.");
      return { url: await options.storage().presign(path), expiresIn: PRESIGN_SECONDS };
    },
    async requests(userId, organizationId) {
      const allowed = await db.query<{ allowed: boolean }>("select partner.can_manage_requests($1::uuid, $2::uuid) as allowed", [userId, organizationId]);
      if (!allowed.rows[0]?.allowed) throw new MemberCvError(403, "Your current agreement does not include Engagement Requests.");
      const rows = await db.query<RequestRow>(`${PARTNER_REQUEST_SELECT}
        where r.partner_organization_id = $1::uuid order by r.updated_at desc, r.id`, [organizationId]);
      return { requests: rows.rows.map(requestSummary), administrators: [] };
    },
    async request(userId, organizationId, id) {
      const allowed = await db.query<{ allowed: boolean }>("select partner.can_manage_requests($1::uuid, $2::uuid) as allowed", [userId, organizationId]);
      if (!allowed.rows[0]?.allowed) throw new MemberCvError(403, "Your current agreement does not include Engagement Requests.");
      const rows = await db.query<RequestRow & { body: string; author_email: string }>(`${PARTNER_REQUEST_SELECT}
        where r.partner_organization_id = $1::uuid and r.id = $2::uuid`, [organizationId, id]);
      const row = rows.rows[0];
      if (!row) throw new MemberCvError(404, "Request was not found.");
      const replies = (await db.query<Record<string, unknown>>(
        "select id, author_email, actor, body, created_at from sponsor.request_replies where request_id = $1::uuid order by created_at, id", [id],
      )).rows;
      const history = (await db.query<Record<string, unknown>>(
        "select id, revision, actor_email, kind, from_status, to_status, assigned_admin_email, created_at from sponsor.request_history where request_id = $1::uuid order by revision", [id],
      )).rows;
      return { request: {
        ...requestSummary(row), body: String(row.body), authorEmail: String(row.author_email),
        replies: replies.map((reply): RequestReply => ({ id: String(reply.id), authorEmail: String(reply.author_email), actor: reply.actor as RequestReply["actor"], body: String(reply.body), createdAt: asIso(reply.created_at) })),
        history: history.map((event): RequestHistory => ({ id: String(event.id), revision: Number(event.revision), actorEmail: String(event.actor_email), kind: event.kind as RequestHistory["kind"], fromStatus: event.from_status as RequestStatus | null, toStatus: event.to_status as RequestStatus | null, assignedAdminEmail: event.assigned_admin_email as string | null, createdAt: asIso(event.created_at) })),
      } };
    },
    async createRequest(userId, organizationId, value) {
      const draft = validateRequestDraft(value);
      try {
        const result = await db.query<{ id: string }>("select partner.create_engagement_request($1::uuid,$2::uuid,$3,$4,$5) as id", [userId, organizationId, draft.type, draft.title, draft.body]);
        return this.request(userId, organizationId, result.rows[0].id);
      } catch (error) { return workflowError(error); }
    },
    async mutateRequest(userId, organizationId, id, value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberCvError(400, "Send a request operation.");
      const input = value as Record<string, unknown>;
      const revision = validateExpectedRevision(input.expectedRevision);
      let payload: Record<string, unknown>;
      const operation = input.operation;
      const allowedKeys = ["id", "organizationId", "expectedRevision", "operation"];
      if (operation === "reply") { payload = { body: validateRequestReply(input.body) }; allowedKeys.push("body"); }
      else if (operation === "status") {
        if (input.status !== "cancelled" || !REQUEST_STATUSES.includes(input.status as RequestStatus)) throw new MemberCvError(403, "Only open requests can be cancelled by the partner organization.");
        payload = { status: input.status }; allowedKeys.push("status");
      } else throw new MemberCvError(400, "Choose a valid request operation.");
      if (Object.keys(input).some(key => !allowedKeys.includes(key))) throw new MemberCvError(400, "Unexpected request fields.");
      try {
        await db.query("select partner.mutate_engagement_request($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb)", [userId, organizationId, id, revision, operation, JSON.stringify(payload)]);
        return this.request(userId, organizationId, id);
      } catch (error) { return workflowError(error); }
    },
  };
}

async function partnerQuery<T>(db: CvDatabase, sql: string, params: unknown[]) {
  try { return await db.query<T>(sql, params); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42501") {
      throw new MemberCvError(403, "Your account does not have active access to this organization. Contact Helix.");
    }
    throw error;
  }
}

let pool: pg.Pool | undefined;
export async function sendNeonPartnerOtp(email: string, origin: string, baseUrl = process.env.NEON_AUTH_BASE_URL): Promise<void> {
  if (!baseUrl) throw new Error("Neon Auth is not configured");
  const auth = createAuthClient(baseUrl, {
    adapter: BetterAuthVanillaAdapter({ fetchOptions: {
      credentials: "omit", headers: { origin }, retry: 0,
    } }),
  });
  const result = await auth.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  if (result.error) throw new Error("OTP delivery failed");
}

export function neonPartnerServices(): PartnerServices {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MemberCvError(503, "Partner portal server configuration is missing.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  return createPartnerServices({
    db: { async query<T>(sql: string, params?: unknown[]) {
      const result = await pool!.query(sql, params);
      return { rows: result.rows as T[] };
    } },
    // A directory read does not require object-storage credentials.
    storage: () => createCvStorage(),
    sendOtp: sendNeonPartnerOtp,
  });
}
