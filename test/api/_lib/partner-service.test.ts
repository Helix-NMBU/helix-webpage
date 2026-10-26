import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCv } from "../../../src/features/MemberCV/model.js";
import { createPartnerServices } from "../../../api/_lib/partner-service.js";
import { createPartnerHandler } from "../../../api/_lib/partner-handler.js";

const partnerUser = "10000000-0000-4000-8000-000000000001";
const otherUser = "10000000-0000-4000-8000-000000000002";
const unverifiedUser = "10000000-0000-4000-8000-000000000003";
const bannedUser = "10000000-0000-4000-8000-000000000004";
const memberAuth = "10000000-0000-4000-8000-000000000005";
const org = "20000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
let db: PGlite;
let member: string;
let path: string;
const sharing = { cv: true, email: false, phone: false };
const profile = { ...emptyCv("Published member", "private@example.test"), phone: "12345678", fieldOfStudy: "Robotics", graduationYear: "2027",
  education: [{ id: "one", institution: "NMBU", degree: "MSc", startDate: "2024", endDate: "2027", description: "" }] };
const presign = vi.fn(async () => "https://storage.example.test/current-signed-cv");
const sendOtp = vi.fn(async (_email: string, _origin: string) => undefined);
const services = () => createPartnerServices({
  // Each API request is an autocommit query in production. Recover the test's
  // rollback transaction after expected SQL denials so later requests can run.
  db: { async query<T>(sql: string, params?: unknown[]) {
    await db.exec("savepoint partner_request");
    try {
      const result = await db.query<T>(sql, params);
      await db.exec("release savepoint partner_request");
      return result;
    } catch (error) {
      await db.exec("rollback to savepoint partner_request; release savepoint partner_request");
      throw error;
    }
  } },
  storage: () => ({ presign }),
  sendOtp,
});

async function publish(revision = 0, flags = sharing, newPath: string | null = path) {
  if (newPath) await db.query("select cv.prepare_upload($1, $2, $3)", [member, newPath, revision]);
  await db.query("select cv.commit_member_cv($1, 'publish', $2, $3::jsonb, $4::jsonb, $5)",
    [member, revision, JSON.stringify(profile), JSON.stringify(flags), newPath]);
}

describe("partner membership and publication authorization against SQL", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, name text not null, email text not null, "emailVerified" boolean not null, banned boolean);
      create table neon_auth.account (id uuid primary key default gen_random_uuid(), "accountId" text not null,
        "providerId" text not null, "userId" uuid not null references neon_auth."user"(id), "idToken" text);
      insert into neon_auth."user" values
        ('${partnerUser}', 'Partner', 'partner@example.test', true, false),
        ('${otherUser}', 'Other', 'other@example.test', true, false),
        ('${unverifiedUser}', 'Unverified', 'unverified@example.test', false, false),
        ('${bannedUser}', 'Banned', 'banned@example.test', true, true),
        ('${memberAuth}', 'Member', 'member@helixnmbu.no', true, false);
      insert into neon_auth.account ("accountId", "providerId", "userId") values ('google-member', 'google', '${memberAuth}');
    `);
    await db.exec(readFileSync(new URL("../../../db/migrations/001_member_cv.sql", import.meta.url), "utf8"));
    const migration = readFileSync(new URL("../../../db/migrations/004_partner_portal.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    member = (await db.query<{ id: string }>("select identity.onboard_member($1, 'google-member', 'member@helixnmbu.no', 'Member', $2::jsonb, $3::jsonb) as id",
      [memberAuth, JSON.stringify(profile), JSON.stringify(sharing)])).rows[0].id;
    path = `${member}/30000000-0000-4000-8000-000000000001.pdf`;
    await db.exec(`
      insert into partner.organizations(id, name, active) values ('${org}', 'First partner', true), ('${otherOrg}', 'Other partner', true);
      insert into partner.memberships (organization_id, auth_user_id, invited_email, status, approved_at) values
        ('${org}', '${partnerUser}', 'partner@example.test', 'active', now()),
        ('${otherOrg}', '${otherUser}', 'other@example.test', 'active', now()),
        ('${org}', '${unverifiedUser}', 'unverified@example.test', 'active', now()),
        ('${org}', '${bannedUser}', 'banned@example.test', 'active', now());
    `);
  });
  beforeEach(async () => { presign.mockClear(); sendOtp.mockReset(); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback"); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(async () => { await db?.close(); });

  it("resolves an explicit active organization without creating or updating access rows", async () => {
    const before = (await db.query("select * from partner.memberships order by id")).rows;
    expect(await services().session(partnerUser)).toEqual({ user: { email: "partner@example.test", name: "Partner" }, organizations: [{ id: org, name: "First partner" }] });
    expect((await db.query("select * from partner.memberships order by id")).rows).toEqual(before);
    await expect(services().session(memberAuth)).rejects.toMatchObject({ status: 403 });
    await expect(services().directory(memberAuth, org)).rejects.toMatchObject({ status: 403 });
  });

  it("gates OTP delivery on a preapproved invitation, including new and unverified users, without granting access", async () => {
    const before = (await db.query("select * from partner.memberships order by id")).rows;
    await services().requestOtp("unverified@example.test", "http://localhost:5190");
    expect(sendOtp).toHaveBeenCalledExactlyOnceWith("unverified@example.test", "http://localhost:5190");
    await expect(services().session(unverifiedUser)).rejects.toMatchObject({ status: 403 });
    await services().requestOtp("unknown@example.test", "http://localhost:5190");
    expect(sendOtp).toHaveBeenCalledTimes(1);
    expect((await db.query("select * from partner.memberships order by id")).rows).toEqual(before);
    await db.query("insert into partner.memberships (organization_id, invited_email, status, approved_at) values ($1, 'new@example.test', 'active', now())", [org]);
    await services().requestOtp("new@example.test", "http://localhost:5190");
    expect(sendOtp).toHaveBeenLastCalledWith("new@example.test", "http://localhost:5190");
    expect((await db.query("select auth_user_id from partner.memberships where invited_email = 'new@example.test'")).rows[0]).toEqual({ auth_user_id: null });
  });

  it("returns no delivery or invitation information for successful, rejected, or failed sends", async () => {
    expect(await services().requestOtp("partner@example.test", "http://localhost:5190")).toBeUndefined();
    sendOtp.mockRejectedValueOnce(new Error("private invited email, quota, provider details"));
    expect(await services().requestOtp("partner@example.test", "http://localhost:5190")).toBeUndefined();
    expect(await services().requestOtp("banned@example.test", "http://localhost:5190")).toBeUndefined();
    expect(sendOtp).toHaveBeenCalledTimes(2);
  });

  it("integrates signed bearer verification, HTTP routing, SQL authorization, and immediate revocation", async () => {
    const issuer = "https://partner-integration.example.test";
    const keys = await generateKeyPair("EdDSA");
    vi.stubEnv("NEON_AUTH_BASE_URL", `${issuer}/neondb/auth`);
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      expect(String(url)).toBe(`${issuer}/neondb/auth/.well-known/jwks.json`);
      return Response.json({ keys: [{ ...await exportJWK(keys.publicKey), kid: "integration", alg: "EdDSA" }] });
    }));
    const token = async (id: string) => new SignJWT({ email: "partner@example.test", emailVerified: true })
      .setProtectedHeader({ alg: "EdDSA", kid: "integration" }).setSubject(id).setIssuer(issuer).setAudience(issuer)
      .setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    const handler = createPartnerHandler(services);
    async function call(jwt: string, action: string) {
      let status = 0;
      let body: unknown;
      const res = { setHeader: () => undefined, status: (value: number) => { status = value; return res; },
        json: (value: unknown) => { body = value; return res; } };
      await handler({ method: "GET", headers: { authorization: `Bearer ${jwt}` },
        query: { action, organizationId: org, memberId: member } } as unknown as VercelRequest, res as unknown as VercelResponse);
      return { status, body };
    }
    await publish();
    for (const id of [memberAuth, unverifiedUser, bannedUser]) {
      const jwt = await token(id);
      for (const action of ["session", "directory", "download"]) expect((await call(jwt, action)).status).toBe(403);
    }
    expect(presign).not.toHaveBeenCalled();
    const jwt = await token(partnerUser);
    expect((await call(jwt, "session")).status).toBe(200);
    expect((await call(jwt, "directory")).status).toBe(200);
    expect((await call(jwt, "download")).status).toBe(200);
    presign.mockClear();
    await db.exec("update partner.memberships set status = 'revoked', revoked_at = now() where invited_email = 'partner@example.test'");
    for (const action of ["session", "directory", "download"]) expect((await call(jwt, action)).status).toBe(403);
    expect(presign).not.toHaveBeenCalled();
  });

  it("returns identical HTTP OTP responses for invited, uninvited, banned, and delivery-failed emails", async () => {
    const handler = createPartnerHandler(services);
    const responses = [];
    for (const email of ["partner@example.test", "unknown@example.test", "banned@example.test", "unverified@example.test"]) {
      sendOtp.mockRejectedValueOnce(new Error("provider private details"));
      let status = 0;
      let body: unknown;
      const res = { setHeader: () => undefined, status: (value: number) => { status = value; return res; },
        json: (value: unknown) => { body = value; return res; } };
      await handler({ method: "POST", headers: { origin: "http://localhost:5190", host: "localhost:5190" },
        query: { action: "request-otp" }, body: { email } } as unknown as VercelRequest, res as unknown as VercelResponse);
      responses.push({ status, body });
    }
    expect(responses).toEqual(Array.from({ length: 4 }, () => ({ status: 202, body: { message: "If your email can sign in, a code will arrive shortly." } })));
    expect(sendOtp).toHaveBeenCalledTimes(2);
  });

  it("never sends a code for a revoked, expired, pending, inactive, mismatched, or banned invitation", async () => {
    for (const sql of [
      "update partner.memberships set status = 'invited' where invited_email = 'partner@example.test'",
      "update partner.memberships set revoked_at = now() where invited_email = 'partner@example.test'",
      "update partner.memberships set expires_at = now() where invited_email = 'partner@example.test'",
      "update partner.memberships set approved_at = now() + interval '1 day' where invited_email = 'partner@example.test'",
      "update partner.organizations set active = false",
      "update partner.organizations set revoked_at = now()",
      `update partner.memberships set auth_user_id = '${otherUser}' where invited_email = 'partner@example.test'`,
      `update neon_auth."user" set banned = true where id = '${partnerUser}'`,
    ]) {
      await db.exec("savepoint otp_gate");
      await db.exec(sql);
      expect(await services().requestOtp("partner@example.test", "http://localhost:5190")).toBeUndefined();
      expect(sendOtp).not.toHaveBeenCalled();
      await db.exec("rollback to savepoint otp_gate; release savepoint otp_gate");
    }
  });

  it("authorizes a preapproved email invitation without mutating it or accepting a different bound user", async () => {
    await db.query("update partner.memberships set auth_user_id = null where organization_id = $1 and auth_user_id = $2", [org, partnerUser]);
    expect((await services().session(partnerUser)).organizations[0].id).toBe(org);
    expect((await db.query("select auth_user_id from partner.memberships where invited_email = 'partner@example.test'")).rows[0]).toEqual({ auth_user_id: null });
    await db.query("update partner.memberships set auth_user_id = $1 where invited_email = 'partner@example.test'", [otherUser]);
    await expect(services().session(partnerUser)).rejects.toMatchObject({ status: 403 });
  });

  it.each([unverifiedUser, bannedUser])("refuses an unverified or banned auth user %s, even with an active membership", async (id) => {
    await expect(services().session(id)).rejects.toMatchObject({ status: 403 });
    await expect(services().directory(id, org)).rejects.toMatchObject({ status: 403 });
    await expect(services().download(id, org, member)).rejects.toMatchObject({ status: 403 });
    expect(presign).not.toHaveBeenCalled();
  });

  it("denies another organization's directory and PDF even when the caller is an active partner elsewhere", async () => {
    await publish();
    await expect(services().directory(partnerUser, otherOrg)).rejects.toMatchObject({ status: 403 });
    await expect(services().download(partnerUser, otherOrg, member)).rejects.toMatchObject({ status: 403 });
    expect(presign).not.toHaveBeenCalled();
  });

  it.each([
    "update partner.memberships set status = 'invited', approved_at = null where invited_email = 'partner@example.test'",
    "update partner.memberships set status = 'revoked', revoked_at = now() where invited_email = 'partner@example.test'",
    "update partner.memberships set revoked_at = now() where invited_email = 'partner@example.test'",
    "update partner.memberships set expires_at = now() - interval '1 second' where invited_email = 'partner@example.test'",
    "update partner.memberships set approved_at = now() + interval '1 day' where invited_email = 'partner@example.test'",
    "update partner.organizations set active = false",
    "update partner.organizations set revoked_at = now()",
    `update neon_auth."user" set "emailVerified" = false where id = '${partnerUser}'`,
    `update neon_auth."user" set banned = true where id = '${partnerUser}'`,
    `update neon_auth."user" set email = 'changed@example.test' where id = '${partnerUser}'`,
  ])("rechecks all eligibility after a successful session: %s", async (sql) => {
    await services().session(partnerUser);
    await publish();
    await db.exec(sql);
    await expect(services().session(partnerUser)).rejects.toMatchObject({ status: 403 });
    await expect(services().directory(partnerUser, org)).rejects.toMatchObject({ status: 403 });
    await expect(services().download(partnerUser, org, member)).rejects.toMatchObject({ status: 403 });
    expect(presign).not.toHaveBeenCalled();
  });

  it("hides private drafts and later unpublished edits, and returns no storage paths", async () => {
    expect(await services().directory(partnerUser, org)).toEqual({ members: [] });
    await expect(services().download(partnerUser, org, member)).rejects.toMatchObject({ status: 404 });
    await publish();
    await db.query("select cv.commit_member_cv($1, 'save', 1, $2::jsonb, $3::jsonb, null)",
      [member, JSON.stringify({ ...profile, fullName: "Private edit", contactEmail: "secret@example.test" }), JSON.stringify(sharing)]);
    const directory = await services().directory(partnerUser, org);
    expect(directory).toEqual({ members: [{ memberId: member, fullName: "Published member", fieldOfStudy: "Robotics", graduationYear: 2027,
      contactEmail: null, phone: null, hasPdf: true }] });
    expect(JSON.stringify(directory)).not.toMatch(/Private edit|secret@|private@|pdf_path|draft|30000000/);
    expect(await services().download(partnerUser, org, member)).toEqual({ url: "https://storage.example.test/current-signed-cv", expiresIn: 120 });
    expect(presign).toHaveBeenCalledWith(path);
  });

  it("respects contact sharing and profile publication without PDF sharing", async () => {
    await publish(0, { cv: false, email: true, phone: false }, null);
    expect((await services().directory(partnerUser, org)).members[0]).toMatchObject({ contactEmail: "private@example.test", phone: null, hasPdf: false });
    await expect(services().download(partnerUser, org, member)).rejects.toMatchObject({ status: 404 });
    expect(presign).not.toHaveBeenCalled();
  });

  it("hides withdrawn profiles and refuses a stale or forged publication path", async () => {
    await publish();
    await db.query("select cv.commit_member_cv($1, 'withdraw', 1, null, null, null)", [member]);
    expect(await services().directory(partnerUser, org)).toEqual({ members: [] });
    await expect(services().download(partnerUser, org, member)).rejects.toMatchObject({ status: 404 });
    const newPath = `${member}/30000000-0000-4000-8000-000000000002.pdf`;
    await publish(2, sharing, newPath);
    await db.query("update cv.directory_entries set cv_path = $1 where member_id = $2", [path, member]);
    expect(await services().directory(partnerUser, org)).toEqual({ members: [] });
    await expect(services().download(partnerUser, org, member)).rejects.toMatchObject({ status: 404 });
    expect(presign).not.toHaveBeenCalled();
  });

  it("signs only the current publication after republishing", async () => {
    await publish();
    const currentPath = `${member}/30000000-0000-4000-8000-000000000003.pdf`;
    await publish(1, sharing, currentPath);
    await services().download(partnerUser, org, member);
    expect(presign).toHaveBeenCalledExactlyOnceWith(currentPath);
  });

  it("does not grant browser roles table access, function execution, or self-provisioning", async () => {
    for (const role of ["public", "anon", "authenticated"]) {
      const privileges = await db.query<{ table_access: boolean; function_access: boolean }>(`
        select has_table_privilege($1, 'partner.memberships', 'SELECT,INSERT,UPDATE,DELETE') as table_access,
          has_function_privilege($1, 'partner.authorized_memberships(uuid)', 'EXECUTE') as function_access`, [role]);
      expect(privileges.rows[0]).toEqual({ table_access: false, function_access: false });
    }
    await db.exec("set local role authenticated");
    await expect(db.query("select * from partner.memberships")).rejects.toThrow(/permission denied/);
  });
});
