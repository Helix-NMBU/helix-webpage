import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createSponsorAccess, requireAdmin, requireDirectory, requirePortal, sponsorEntitlements, type SponsorDatabase } from "./sponsor-access.js";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ORG = "00000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-10-25T12:00:00Z");
const databases: PGlite[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())); });

async function fixture() {
  const db = new PGlite(); databases.push(db);
  await db.exec(`create schema neon_auth; create table neon_auth."user" (id uuid primary key, email text, "emailVerified" boolean, banned boolean);
    insert into neon_auth."user" values ('${USER}', 'contact@example.com', true, false), ('${OTHER}', 'member@helixnmbu.no', true, false);`);
  const migration = await readFile(new URL("../../db/migrations/003_sponsor_portal.sql", import.meta.url), "utf8");
  await db.exec(migration); await db.exec(migration);
  await db.query("insert into sponsor.organizations(id,name) values ($1,'Example Racing')", [ORG]);
  await db.query("insert into sponsor.contacts(organization_id,email) values ($1,'contact@example.com')", [ORG]);
  await db.query("insert into sponsor.agreements(organization_id,tier,starts_at,ends_at) values ($1,'silver','2026-01-01','2027-01-01')", [ORG]);
  const access = createSponsorAccess({ db: db as unknown as SponsorDatabase, now: () => NOW, verifySession: async token => ({ userId: token }) });
  return { db, access };
}

describe("current sponsor invitation and agreement authorization", () => {
  it("runs the real migration twice and binds a verified invitation to one organization", async () => {
    const { db, access } = await fixture();
    const principal = await access.authenticate(USER);
    expect(principal).toMatchObject({ authUserId: USER, organizationId: ORG, organizationName: "Example Racing", role: "sponsor", portal: true, directory: true });
    expect((await db.query("select auth_user_id from sponsor.contacts")).rows).toEqual([{ auth_user_id: USER }]);
    expect(() => requireDirectory(principal)).not.toThrow();
    expect(() => requireAdmin(principal)).toThrow("Administrator");
    await expect(access.authenticate(OTHER)).rejects.toMatchObject({ status: 403 });
  });

  it.each(["partner", "service", "bronze", "silver", "gold", "platinum", "main", "invented"])("uses the current tier matrix for %s", tier => {
    expect(sponsorEntitlements(tier)).toEqual({ portal: ["bronze", "silver", "gold", "platinum", "main"].includes(tier), directory: ["silver", "gold", "platinum", "main"].includes(tier) });
  });

  it.each([
    "update sponsor.contacts set active = false",
    "update sponsor.organizations set active = false",
    "update sponsor.agreements set revoked_at = now()",
    "update sponsor.agreements set ends_at = '2026-10-25T12:00:00Z'",
    "update sponsor.agreements set starts_at = '2026-10-25T12:00:01Z'",
    "update sponsor.agreements set tier = 'service'",
    'update neon_auth."user" set banned = true',
    'update neon_auth."user" set "emailVerified" = false',
  ])("rechecks current access after %s", async sql => {
    const { db, access } = await fixture();
    await access.authenticate(USER);
    await db.exec(sql);
    await expect(access.authenticate(USER)).rejects.toMatchObject({ status: 403 });
  });

  it("includes the exact start instant but excludes the end and denies Bronze directory access", async () => {
    const { db, access } = await fixture();
    await db.exec("update sponsor.agreements set starts_at = '2026-10-25T12:00:00Z', tier = 'bronze'");
    const principal = await access.authenticate(USER);
    expect(() => requirePortal(principal)).not.toThrow();
    expect(() => requireDirectory(principal)).toThrow("Talent Directory");
  });

  it("refuses a changed stable identity even with the invited email", async () => {
    const { db, access } = await fixture();
    await access.authenticate(USER);
    await db.query('update neon_auth."user" set email = $1 where id = $2', ["different@example.com", USER]);
    await db.query('update neon_auth."user" set email = $1 where id = $2', ["contact@example.com", OTHER]);
    await expect(access.authenticate(OTHER)).rejects.toMatchObject({ status: 403 });
  });

  it("keeps developer, administrator and entitled sponsor roles separate", async () => {
    const { db, access } = await fixture();
    await db.exec("insert into sponsor.staff(email,role) values ('member@helixnmbu.no','developer')");
    const developer = await access.authenticate(OTHER);
    expect(developer).toMatchObject({ role: "developer", organizationId: null, portal: false, directory: false });
    expect(() => requireAdmin(developer)).toThrow();
    expect(() => requireDirectory(developer)).toThrow();
    await db.exec("update sponsor.staff set role = 'admin'");
    const admin = await access.authenticate(OTHER);
    expect(() => requireAdmin(admin)).not.toThrow();
    expect(() => requirePortal(admin)).toThrow();
    await db.exec("update sponsor.staff set active = false");
    await expect(access.authenticate(OTHER)).rejects.toMatchObject({ status: 403 });
  });

  it("permits login requests only for active invitations and current portal agreements", async () => {
    const { db, access } = await fixture();
    expect(await access.mayRequestLogin(" Contact@Example.com ")).toBe(true);
    expect(await access.mayRequestLogin("member@helixnmbu.no")).toBe(false);
    await db.exec("update sponsor.agreements set tier = 'partner'");
    expect(await access.mayRequestLogin("contact@example.com")).toBe(false);
    await db.exec("insert into sponsor.staff(email,role) values ('developer@example.com','developer')");
    expect(await access.mayRequestLogin("developer@example.com")).toBe(true);
  });
});
