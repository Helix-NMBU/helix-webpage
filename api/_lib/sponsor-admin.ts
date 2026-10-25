import type { VercelRequest, VercelResponse } from "@vercel/node";
import { normalizeSponsorEmail, requireAdmin, sponsorBearer, SponsorError, type SponsorAccess, type SponsorDatabase } from "./sponsor-access.js";
import type { SponsorAdministration } from "../../src/features/SponsorWorkspace/admin-types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIERS = ["partner", "service", "bronze", "silver", "gold", "platinum", "main"];
function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new SponsorError(400, "Choose a valid record.");
  return value;
}
function name(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || value.trim().length > 160 || (!allowEmpty && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value)) throw new SponsorError(400, "Enter a name of up to 160 characters.");
  return value.trim();
}
function active(value: unknown): boolean {
  if (typeof value !== "boolean") throw new SponsorError(400, "Choose whether the record is active.");
  return value;
}
function instant(value: unknown): string {
  // HTML date fields mean midnight UTC; ISO instants must carry an explicit zone.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new SponsorError(400, "Enter valid agreement dates.");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.slice(0, 10) && value.length === 10) throw new SponsorError(400, "Enter valid agreement dates.");
  return parsed.toISOString();
}
function input(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SponsorError(400, "Send an administration change.");
  return value as Record<string, unknown>;
}
function fields(body: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new SponsorError(400, "The change contains unsupported fields.");
}
export function createSponsorAdminHandler({ db, access }: { db: SponsorDatabase; access: SponsorAccess }) {
  async function overview(): Promise<SponsorAdministration> {
    const organizations = await db.query<SponsorAdministration["organizations"][number]>("select id, name, active from sponsor.organizations order by name, id");
    const contacts = await db.query<SponsorAdministration["contacts"][number]>("select id, organization_id, name, email, active from sponsor.contacts order by email, id");
    const agreements = await db.query<SponsorAdministration["agreements"][number]>("select id, organization_id, tier, starts_at, ends_at, revoked_at from sponsor.agreements order by organization_id");
    return { organizations: organizations.rows, contacts: contacts.rows, agreements: agreements.rows };
  }
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      requireAdmin(await access.authenticate(sponsorBearer(req.headers.authorization)));
      if (req.method === "GET") return res.status(200).json(await overview());
      const body = input(req.body);
      if (body.operation === "organization") {
        fields(body, ["operation", "id", "name", "active"]);
        const values = [name(body.name), active(body.active)];
        const result = body.id === undefined
          ? await db.query("insert into sponsor.organizations(name, active) values ($1,$2) returning id", values)
          : await db.query("update sponsor.organizations set name=$1, active=$2 where id=$3 returning id", [...values, id(body.id)]);
        if (!result.rows.length) throw new SponsorError(404, "Organization not found.");
      } else if (body.operation === "contact") {
        fields(body, ["operation", "id", "organizationId", "name", "email", "active"]);
        const values = [id(body.organizationId), name(body.name, true), normalizeSponsorEmail(body.email), active(body.active)];
        const result = body.id === undefined
          ? await db.query("insert into sponsor.contacts(organization_id,name,email,active) values($1,$2,$3,$4) returning id", values)
          : await db.query("update sponsor.contacts set organization_id=$1,name=$2,auth_user_id=case when email=$3 then auth_user_id else null end,email=$3,active=$4 where id=$5 returning id", [...values, id(body.id)]);
        if (!result.rows.length) throw new SponsorError(404, "Contact not found.");
      } else if (body.operation === "agreement") {
        fields(body, ["operation", "organizationId", "tier", "startsAt", "endsAt", "revoked"]);
        if (typeof body.tier !== "string" || !TIERS.includes(body.tier)) throw new SponsorError(400, "Choose a sponsor tier.");
        const starts = instant(body.startsAt), ends = instant(body.endsAt);
        if (new Date(ends) <= new Date(starts)) throw new SponsorError(400, "The agreement must end after it starts.");
        const revoked = active(body.revoked);
        await db.query(`insert into sponsor.agreements(organization_id,tier,starts_at,ends_at,revoked_at)
          values($1,$2,$3,$4,case when $5 then now() else null end)
          on conflict(organization_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
          revoked_at=case when $5 then coalesce(sponsor.agreements.revoked_at,now()) else null end`, [id(body.organizationId), body.tier, starts, ends, revoked]);
      } else throw new SponsorError(400, "Choose a supported administration operation.");
      return res.status(200).json(await overview());
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "23505") return res.status(409).json({ error: "This email already has an invitation. Edit the existing contact." });
      if (code === "23503") return res.status(400).json({ error: "Choose an existing organization." });
      return res.status(error instanceof SponsorError ? error.status : 503).json({ error: error instanceof SponsorError ? error.message : "Could not save sponsor records. Try again." });
    }
  };
}
