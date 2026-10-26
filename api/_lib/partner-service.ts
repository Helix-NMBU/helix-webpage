import pg from "pg";
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla/adapters";
import type { PartnerDirectory, PartnerDownload, PartnerSession } from "../../src/features/PartnerPortal/types.js";
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
}
type MembershipRow = { organization_id: string; organization_name: string; email: string; full_name: string };
type CvRow = {
  member_id: string; full_name: string; field_of_study: string | null; graduation_year: number | null;
  contact_email: string | null; phone: string | null; has_pdf: boolean;
};

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
      const { rows } = await db.query<MembershipRow>("select * from partner.authorized_memberships($1::uuid)", [userId]);
      if (!rows.length) throw new MemberCvError(403, "Your account does not have active partner access. Contact Helix.");
      return {
        user: { email: rows[0].email, name: rows[0].full_name },
        organizations: rows.map((row) => ({ id: row.organization_id, name: row.organization_name })),
      };
    },
    async directory(userId, organizationId) {
      const { rows } = await partnerQuery<CvRow>(db, `
        select member_id, full_name, field_of_study, graduation_year, contact_email, phone, pdf_path is not null as has_pdf
        from partner.published_cvs($1::uuid, $2::uuid)`, [userId, organizationId]);
      return { members: rows.map((row) => ({
        memberId: row.member_id, fullName: row.full_name, fieldOfStudy: row.field_of_study,
        graduationYear: row.graduation_year, contactEmail: row.contact_email, phone: row.phone, hasPdf: row.has_pdf,
      })) };
    },
    async download(userId, organizationId, memberId) {
      const { rows } = await partnerQuery<{ pdf_path: string }>(db, `
        select pdf_path from partner.published_cvs($1::uuid, $2::uuid) where member_id = $3::uuid`,
      [userId, organizationId, memberId]);
      const path = rows[0]?.pdf_path;
      if (!path || !isOwnedPdfPath(memberId, path)) throw new MemberCvError(404, "No published CV is available to download.");
      return { url: await options.storage().presign(path), expiresIn: PRESIGN_SECONDS };
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
