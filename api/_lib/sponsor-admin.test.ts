import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSponsorAccess, type SponsorDatabase } from "./sponsor-access.js";
import { createSponsorAdminHandler } from "./sponsor-admin.js";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const ORG = "00000000-0000-4000-8000-000000000003";
let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create schema neon_auth; create table neon_auth."user"(id uuid primary key,email text,"emailVerified" boolean,banned boolean);
    insert into neon_auth."user" values('${ADMIN}','admin@example.invalid',true,false),('${MEMBER}','member@helixnmbu.no',true,false);`);
  await db.exec(readFileSync(new URL("../../db/migrations/003_sponsor_portal.sql", import.meta.url), "utf8"));
  await db.query("insert into sponsor.staff(email,role) values('admin@example.invalid','admin')");
  await db.query("insert into sponsor.organizations(id,name) values($1,'Example Engineering')", [ORG]);
});
afterEach(async () => { await db.close(); });
async function call(body?: unknown, token = ADMIN, method = body ? "POST" : "GET") {
  const database = db as unknown as SponsorDatabase;
  const access = createSponsorAccess({ db: database, verifySession: async (userId) => ({ userId }) });
  let status = 0; let data: unknown;
  const res = { setHeader() {}, status(code: number) { status = code; return this; }, json(value: unknown) { data = value; return this; } };
  await createSponsorAdminHandler({ db: database, access })({ method, headers: { authorization: `Bearer ${token}` }, body } as VercelRequest, res as unknown as VercelResponse);
  return { status, data: data as Record<string, unknown> };
}
describe("sponsor administration", () => {
  it("denies ordinary members, developers and revoked administrators", async () => {
    expect((await call(undefined, MEMBER)).status).toBe(403);
    await db.query("update sponsor.staff set role='developer'");
    expect((await call()).status).toBe(403);
    await db.query("update sponsor.staff set role='admin',active=false");
    expect((await call()).status).toBe(403);
  });
  it("creates and deactivates organizations without exposing auth identity fields", async () => {
    const created = await call({ operation: "organization", name: "New sponsor", active: true });
    expect(created.status).toBe(200);
    const rows = (created.data.organizations as { id: string; name: string }[]);
    const row = rows.find((entry) => entry.name === "New sponsor")!;
    expect((await call({ operation: "organization", id: row.id, name: row.name, active: false })).status).toBe(200);
    expect((await db.query("select active from sponsor.organizations where id=$1", [row.id])).rows[0]).toEqual({ active: false });
    expect(JSON.stringify(created.data)).not.toContain("auth_user_id");
  });
  it("normalizes contacts, preserves stable identity for name edits and clears binding when email changes", async () => {
    expect((await call({ operation: "contact", organizationId: ORG, name: "Alex", email: " Alex@EXAMPLE.invalid ", active: true })).status).toBe(200);
    const contact = (await db.query<{ id: string }>("select id from sponsor.contacts")).rows[0];
    await db.query("update sponsor.contacts set auth_user_id=$1", [MEMBER]);
    await call({ operation: "contact", id: contact.id, organizationId: ORG, name: "Alex Example", email: "alex@example.invalid", active: true });
    expect((await db.query("select auth_user_id from sponsor.contacts")).rows[0]).toEqual({ auth_user_id: MEMBER });
    await call({ operation: "contact", id: contact.id, organizationId: ORG, name: "Alex Example", email: "new@example.invalid", active: true });
    expect((await db.query("select auth_user_id from sponsor.contacts")).rows[0]).toEqual({ auth_user_id: null });
  });
  it("updates tier/date/revocation for the same organization and rejects invalid ranges", async () => {
    const change = { operation: "agreement", organizationId: ORG, tier: "platinum", startsAt: "2026-10-01", endsAt: "2027-10-01", revoked: false };
    expect((await call(change)).status).toBe(200);
    expect((await call({ ...change, tier: "bronze", revoked: true })).status).toBe(200);
    const result = (await db.query<{ tier: string; revoked_at: unknown }>("select tier, revoked_at from sponsor.agreements")).rows[0];
    expect(result.tier).toBe("bronze"); expect(result.revoked_at).not.toBeNull();
    expect((await call({ ...change, endsAt: change.startsAt })).status).toBe(400);
    expect((await call({ ...change, startsAt: "2026-02-31" })).status).toBe(400);
    expect((await db.query<{ count: number }>("select count(*) from sponsor.agreements")).rows[0].count).toBe(1);
  });
  it("rejects privilege injection, duplicate invitations and missing organizations", async () => {
    const change = { operation: "contact", organizationId: ORG, name: "Alex", email: "alex@example.invalid", active: true };
    expect((await call({ ...change, auth_user_id: ADMIN })).status).toBe(400);
    expect((await call({ ...change, role: "admin" })).status).toBe(400);
    expect((await call(change)).status).toBe(200);
    expect((await call(change)).status).toBe(409);
    expect((await call({ ...change, organizationId: MEMBER, email: "other@example.invalid" })).status).toBe(400);
    expect((await call({ operation: "staff", email: "attacker@example.invalid", role: "admin" })).status).toBe(400);
  });
  it("revoking a contact or organization ends the next authenticated request", async () => {
    await db.query("insert into sponsor.contacts(organization_id,email,auth_user_id) values($1,'member@helixnmbu.no',$2)", [ORG, MEMBER]);
    await call({ operation: "agreement", organizationId: ORG, tier: "silver", startsAt: "2020-01-01", endsAt: "2030-01-01", revoked: false });
    const access = createSponsorAccess({ db: db as unknown as SponsorDatabase, verifySession: async () => ({ userId: MEMBER }) });
    expect((await access.authenticate("token")).directory).toBe(true);
    const contactId = (await db.query<{ id: string }>("select id from sponsor.contacts")).rows[0].id;
    await call({ operation: "contact", id: contactId, organizationId: ORG, name: "Member", email: "member@helixnmbu.no", active: false });
    await expect(access.authenticate("token")).rejects.toMatchObject({ status: 403 });
  });
});
