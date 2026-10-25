import pg from "pg";
import { verifyNeonSession } from "./neon-session.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import type { SponsorContext, SponsorTier } from "../../src/features/SponsorWorkspace/types.js";

export class SponsorError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface SponsorDatabase {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface SponsorAccess {
  authenticate(token: string): Promise<SponsorContext>;
  mayRequestLogin(email: string): Promise<boolean>;
}

let pool: pg.Pool | undefined;
export function sponsorDatabase(): SponsorDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new SponsorError(503, "Sponsor access is not configured.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(connectionString), max: 1 });
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      return { rows: (await pool!.query(sql, params)).rows as T[] };
    },
  };
}

export function sponsorBearer(header: string | undefined): string {
  const match = header?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new SponsorError(401, "Sign in to continue.");
  return match[1];
}

export function normalizeSponsorEmail(value: unknown): string {
  if (typeof value !== "string") throw new SponsorError(400, "Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SponsorError(400, "Enter a valid email address.");
  }
  return email;
}

const DIRECTORY_TIERS = new Set<SponsorTier>(["silver", "gold", "platinum", "main"]);
export function sponsorEntitlements(tier: SponsorTier | string | null): { portal: boolean; directory: boolean } {
  return { portal: tier === "bronze" || DIRECTORY_TIERS.has(tier as SponsorTier), directory: DIRECTORY_TIERS.has(tier as SponsorTier) };
}

export function requirePortal(context: SponsorContext): asserts context is SponsorContext & { organizationId: string } {
  if (!context.portal || !context.organizationId || !context.contactId) throw new SponsorError(403, "Your organization does not currently have portal access.");
}
export function requireDirectory(context: SponsorContext): asserts context is SponsorContext & { organizationId: string } {
  requirePortal(context);
  if (!context.directory) throw new SponsorError(403, "Your agreement does not include Talent Directory.");
}
export function requireAdmin(context: SponsorContext): void {
  if (context.role !== "admin") throw new SponsorError(403, "Administrator access is required.");
}

type AuthRow = { id: string; email: string; email_verified: boolean; banned: boolean };
type GrantRow = { id: string; auth_user_id: string | null; role?: "developer" | "admin"; organization_id?: string; organization_name?: string; tier?: SponsorTier | null };

export function createSponsorAccess(deps: {
  db: SponsorDatabase;
  verifySession?: (token: string) => Promise<{ userId: string }>;
  now?: () => Date;
}): SponsorAccess {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const verifySession = deps.verifySession ?? verifyNeonSession;
  async function currentContact(email: string): Promise<GrantRow | undefined> {
    return (await db.query<GrantRow>(
      `select c.id, c.auth_user_id, c.organization_id, o.name as organization_name, a.tier
       from sponsor.contacts c join sponsor.organizations o on o.id = c.organization_id and o.active
       join sponsor.agreements a on a.organization_id = o.id
       where c.email = $1 and c.active and a.revoked_at is null
         and a.starts_at <= $2 and a.ends_at > $2
         and a.tier in ('bronze', 'silver', 'gold', 'platinum', 'main')`, [email, now()],
    )).rows[0];
  }
  async function claim(table: "contacts" | "staff", grant: GrantRow, userId: string): Promise<void> {
    if (grant.auth_user_id !== null && grant.auth_user_id !== userId) throw new SponsorError(403, "This invitation belongs to another account.");
    const result = await db.query<{ id: string }>(
      `update sponsor.${table} set auth_user_id = $1 where id = $2 and active
       and (auth_user_id is null or auth_user_id = $1) returning id`, [userId, grant.id],
    );
    if (!result.rows.length) throw new SponsorError(403, "Your invitation is no longer active.");
  }
  return {
    async mayRequestLogin(input) {
      const email = normalizeSponsorEmail(input);
      try {
        const staff = (await db.query<GrantRow>("select id, auth_user_id, role from sponsor.staff where email = $1 and active", [email])).rows[0];
        return Boolean(staff || await currentContact(email));
      } catch (error) {
        if (error instanceof SponsorError) throw error;
        throw new SponsorError(503, "Sponsor sign-in is temporarily unavailable.");
      }
    },
    async authenticate(token) {
      let userId: string;
      try { userId = (await verifySession(token)).userId; }
      catch (error) {
        const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 401;
        throw new SponsorError(status === 503 ? 503 : 401, status === 503 ? "Sponsor sign-in is temporarily unavailable." : "Your session has ended. Sign in again.");
      }
      try {
        const auth = (await db.query<AuthRow>(
          `select id, lower(email) as email, "emailVerified" as email_verified, coalesce(banned, false) as banned
           from neon_auth."user" where id = $1`, [userId],
        )).rows[0];
        if (!auth || !auth.email_verified || auth.banned) throw new SponsorError(403, "An active verified invitation is required.");
        const staff = (await db.query<GrantRow>("select id, auth_user_id, role from sponsor.staff where email = $1 and active", [auth.email])).rows[0];
        const contact = await currentContact(auth.email);
        if (!staff && !contact) throw new SponsorError(403, "An active sponsor invitation and agreement are required.");
        if (staff) await claim("staff", staff, userId);
        if (contact) await claim("contacts", contact, userId);
        const entitlements = sponsorEntitlements(contact?.tier ?? null);
        return {
          authUserId: userId, email: auth.email, contactId: contact?.id ?? null,
          organizationId: contact?.organization_id ?? null, organizationName: contact?.organization_name ?? null,
          role: staff?.role ?? "sponsor", ...entitlements,
        };
      } catch (error) {
        if (error instanceof SponsorError) throw error;
        throw new SponsorError(503, "Could not verify sponsor access.");
      }
    },
  };
}

export function neonSponsorAccess(): SponsorAccess { return createSponsorAccess({ db: sponsorDatabase() }); }
