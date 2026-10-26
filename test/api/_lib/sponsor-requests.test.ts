import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSponsorAccess, type SponsorDatabase } from "../../../api/_lib/sponsor-access.js";
import { createSponsorRequestsHandler } from "../../../api/_lib/sponsor-requests.js";
import { createPartnerServices } from "../../../api/_lib/partner-service.js";
import type { RequestDetail, RequestList } from "../../../src/features/SponsorWorkspace/request-types.js";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ADMIN = "00000000-0000-4000-8000-000000000003";
const ADMIN2 = "00000000-0000-4000-8000-000000000004";
const ORG = "00000000-0000-4000-8000-000000000005";
const OTHER_ORG = "00000000-0000-4000-8000-000000000006";
const STAFF = "00000000-0000-4000-8000-000000000007";
const STAFF2 = "00000000-0000-4000-8000-000000000008";
const PARTNER_USER = "00000000-0000-4000-8000-000000000009";
const PARTNER_ORG = "00000000-0000-4000-8000-00000000000a";
const OTHER_PARTNER_USER = "00000000-0000-4000-8000-00000000000b";
const OTHER_PARTNER_ORG = "00000000-0000-4000-8000-00000000000c";
const databases: PGlite[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())); });

async function fixture() {
  const db = new PGlite(); databases.push(db);
  await db.exec(`create schema neon_auth;
    create table neon_auth."user" (id uuid primary key, email text, name text, "emailVerified" boolean, banned boolean);
    insert into neon_auth."user" values ('${USER}','contact@example.com','Contact',true,false),('${OTHER}','other@example.com','Other',true,false),
    ('${ADMIN}','admin@helixnmbu.no','Admin',true,false),('${ADMIN2}','other-admin@helixnmbu.no','Admin 2',true,false),
    ('${PARTNER_USER}','partner@example.com','Partner',true,false),('${OTHER_PARTNER_USER}','other-partner@example.com','Other partner',true,false);`);
  for (const name of ["003_sponsor_portal", "004_partner_portal", "004_sponsor_requests", "008_partner_agreement_terms", "009_partner_engagement_requests"]) {
    await db.exec(await readFile(new URL(`../../../db/migrations/${name}.sql`, import.meta.url), "utf8"));
  }
  await db.exec(`insert into sponsor.organizations(id,name) values ('${ORG}','Example Racing'),('${OTHER_ORG}','Other Racing');
    insert into sponsor.contacts(organization_id,email,auth_user_id) values ('${ORG}','contact@example.com','${USER}'),('${OTHER_ORG}','other@example.com','${OTHER}');
    insert into sponsor.agreements(organization_id,tier,starts_at,ends_at) values
    ('${ORG}','bronze',now()-interval '1 day',now()+interval '1 day'),('${OTHER_ORG}','silver',now()-interval '1 day',now()+interval '1 day');
    insert into partner.organizations(id,name,active,agreement_tier) values ('${PARTNER_ORG}','Partner Example',true,'main'),('${OTHER_PARTNER_ORG}','Other Partner',true,'main');
    insert into partner.memberships(organization_id,auth_user_id,invited_email,status,approved_at,starts_at)
      values ('${PARTNER_ORG}','${PARTNER_USER}','partner@example.com','active',now(),now()),
      ('${OTHER_PARTNER_ORG}','${OTHER_PARTNER_USER}','other-partner@example.com','active',now(),now());
    insert into sponsor.staff(id,email,auth_user_id,role) values ('${STAFF}','admin@helixnmbu.no','${ADMIN}','admin'),('${STAFF2}','other-admin@helixnmbu.no','${ADMIN2}','admin');`);
  const access = createSponsorAccess({ db: db as unknown as SponsorDatabase, verifySession: async token => ({ userId: token }) });
  const handler = createSponsorRequestsHandler({ db: db as unknown as SponsorDatabase, access });
  async function call(user = USER, action = "requests", method = "GET", body?: unknown, id?: string) {
    let status = 0; let result: unknown;
    const headers: Record<string, string> = {};
    const res = { setHeader(name: string, value: string) { headers[name] = value; }, status(code: number) { status = code; return res; }, json(value: unknown) { result = value; return res; } };
    await handler({ method, headers: user ? { authorization: `Bearer ${user}` } : {}, query: { action, ...(id ? { id } : {}) }, body } as unknown as VercelRequest, res as unknown as VercelResponse);
    return { status, result, headers };
  }
  async function create(user = USER) {
    const response = await call(user, "requests", "POST", { type: "general_collaboration", title: "Technical visit", body: "Could we discuss a technical visit?" });
    expect(response.status, JSON.stringify(response.result)).toBe(200);
    return (response.result as { request: RequestDetail }).request;
  }
  async function mutate(request: RequestDetail, operation: string, extra: Record<string, unknown>, user = USER) {
    return call(user, "request", "POST", { id: request.id, expectedRevision: request.revision, operation, ...extra });
  }
  const partner = createPartnerServices({
    db: db as unknown as Parameters<typeof createPartnerServices>[0]["db"],
    verify: async () => ({ userId: PARTNER_USER }),
    storage: () => ({ presign: async () => "https://storage.example.test/signed" }),
  });
  return { db, access, call, create, mutate, partner };
}

describe("sponsor requests with real SQL", () => {
  it("stores partner submissions in the shared administrator queue with separate org isolation", async () => {
    const { partner, call } = await fixture();
    const result = await partner.createRequest(PARTNER_USER, PARTNER_ORG, {
      type: "thesis_project", title: "Joint research", body: "Explore a joint thesis project.",
    });
    expect(result.request).toMatchObject({ organizationId: PARTNER_ORG, organizationName: "Partner Example", authorEmail: "partner@example.com", status: "submitted", revision: 0 });
    expect((await partner.requests(PARTNER_USER, PARTNER_ORG)).requests).toHaveLength(1);
    expect((await call(ADMIN)).result).toMatchObject({ requests: [{ id: result.request.id, organizationId: PARTNER_ORG, organizationName: "Partner Example" }] });
    await expect(partner.request(OTHER_PARTNER_USER, OTHER_PARTNER_ORG, result.request.id)).rejects.toMatchObject({ status: 404 });
    await expect(partner.requests(OTHER_PARTNER_USER, OTHER_PARTNER_ORG)).resolves.toMatchObject({ requests: [] });
  });
  it("rechecks partner request entitlement and expiry in the SQL functions", async () => {
    const { db, partner } = await fixture();
    expect((await db.query("select partner.can_manage_requests($1,$2) as allowed", [PARTNER_USER, PARTNER_ORG])).rows[0]).toEqual({ allowed: true });
    expect((await db.query("select partner.can_access_directory($1,$2) as allowed", [PARTNER_USER, PARTNER_ORG])).rows[0]).toEqual({ allowed: true });
    const request = await partner.createRequest(PARTNER_USER, PARTNER_ORG, { type: "recruitment", title: "New roles", body: "Discuss recruitment." });
    await db.exec(`update partner.memberships set expires_at = now() - interval '1 minute' where organization_id = '${PARTNER_ORG}'`);
    expect((await db.query("select partner.can_manage_requests($1,$2) as allowed", [PARTNER_USER, PARTNER_ORG])).rows[0]).toEqual({ allowed: false });
    await expect(partner.mutateRequest(PARTNER_USER, PARTNER_ORG, request.request.id, { id: request.request.id, organizationId: PARTNER_ORG, expectedRevision: 0, operation: "reply", body: "Late reply" })).rejects.toMatchObject({ status: 403 });
    const rows = (await db.query("select count(*)::integer as count from sponsor.request_replies where request_id = $1", [request.request.id])).rows;
    expect(rows[0]).toEqual({ count: 0 });
  });
  it("creates a Bronze request scoped to the signed-in organization and records its shared history", async () => {
    const { call, create } = await fixture(); const request = await create();
    expect(request).toMatchObject({ organizationId: ORG, authorEmail: "contact@example.com", status: "submitted", revision: 0, assignedAdminId: null, replies: [] });
    expect(request.history).toMatchObject([{ revision: 0, kind: "created", actorEmail: "contact@example.com", toStatus: "submitted" }]);
    const list = await call(); expect(list.headers["Cache-Control"]).toBe("no-store");
    expect((list.result as RequestList).requests).toHaveLength(1);
    expect((list.result as RequestList).administrators).toEqual([]);
  });
  it("isolates list, detail and guessed-ID mutations across organizations", async () => {
    const { call, create, mutate } = await fixture(); const request = await create();
    expect((await call(OTHER)).result).toMatchObject({ requests: [] });
    expect((await call(OTHER, "request", "GET", undefined, request.id)).status).toBe(404);
    expect((await mutate(request, "reply", { body: "Another organization" }, OTHER)).status).toBe(404);
    expect((await mutate(request, "status", { status: "cancelled" }, OTHER)).status).toBe(404);
  });
  it("requires an assigned active administrator and supports shared replies and progress", async () => {
    const { call, create, mutate } = await fixture(); let request = await create();
    expect((await mutate(request, "reply", { body: "I have it" }, ADMIN)).status).toBe(403);
    expect((await mutate(request, "status", { status: "under_review" }, ADMIN)).status).toBe(403);
    const list = (await call(ADMIN)).result as RequestList;
    expect(list.administrators.map(admin => admin.id)).toContain(STAFF);
    request = ((await mutate(request, "assign", { assigneeId: STAFF }, ADMIN)).result as { request: RequestDetail }).request;
    expect((await mutate(request, "reply", { body: "Wrong administrator" }, ADMIN2)).status).toBe(403);
    request = ((await mutate(request, "status", { status: "input_needed" }, ADMIN)).result as { request: RequestDetail }).request;
    request = ((await mutate(request, "reply", { body: "Here are the details." })).result as { request: RequestDetail }).request;
    expect(request.status).toBe("under_review");
    request = ((await mutate(request, "reply", { body: "Thanks, Helix can help." }, ADMIN)).result as { request: RequestDetail }).request;
    expect(request.replies.map(reply => reply.actor)).toEqual(["sponsor", "admin"]);
    expect(request.history.map(event => event.kind)).toEqual(["created", "assigned", "status", "reply", "reply"]);
  });
  it("rejects stale simultaneous writes and leaves one atomic reply/history event", async () => {
    const { create, mutate, call } = await fixture(); const request = await create();
    const results = await Promise.all([mutate(request, "reply", { body: "First" }), mutate(request, "reply", { body: "Second" })]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const saved = (await call(USER, "request", "GET", undefined, request.id)).result as { request: RequestDetail };
    expect(saved.request).toMatchObject({ revision: 1 }); expect(saved.request.replies).toHaveLength(1); expect(saved.request.history).toHaveLength(2);
  });
  it("rejects sponsor status escalation, assignment and identity overposting", async () => {
    const { create, mutate, call } = await fixture(); const request = await create();
    expect((await mutate(request, "status", { status: "completed" })).status).toBe(403);
    expect((await mutate(request, "assign", { assigneeId: STAFF })).status).toBe(403);
    expect((await call(USER, "requests", "POST", { type: "recruitment", title: "Hello", body: "Hello", organizationId: OTHER_ORG })).status).toBe(400);
    expect((await mutate(request, "reply", { body: "Hello", authorEmail: "admin@example.com" })).status).toBe(400);
  });
  it("keeps terminal requests immutable, including assignment and replies", async () => {
    const { create, mutate, call } = await fixture(); let request = await create();
    request = ((await mutate(request, "status", { status: "cancelled" })).result as { request: RequestDetail }).request;
    expect((await mutate(request, "reply", { body: "Reopen" })).status).toBe(409);
    expect((await mutate(request, "assign", { assigneeId: STAFF }, ADMIN)).status).toBe(409);
    expect((await mutate(request, "status", { status: "under_review" }, ADMIN)).status).toBe(409);
    const saved = ((await call(USER, "request", "GET", undefined, request.id)).result as { request: RequestDetail }).request;
    expect(saved.revision).toBe(1); expect(saved.replies).toEqual([]); expect(saved.history).toHaveLength(2);
  });
  it.each([
    "update sponsor.contacts set active = false", "update sponsor.agreements set revoked_at = now()",
    "update sponsor.agreements set ends_at = now()", "update sponsor.agreements set tier = 'partner'",
    "update sponsor.organizations set active = false", 'update neon_auth."user" set banned = true',
  ])("rechecks revocation inside the SQL mutation after context was read: %s", async sql => {
    const { db, create } = await fixture(); const request = await create();
    await db.exec(sql);
    await expect(db.query("select sponsor.mutate_request($1,$2,0,'reply',$3::jsonb)", [USER, request.id, JSON.stringify({ body: "Late reply" })])).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select count(*)::integer as count from sponsor.request_replies")).rows[0]).toEqual({ count: 0 });
  });
  it("refuses inactive, developer and unverified administrator assignees", async () => {
    const { db, create, mutate } = await fixture(); const request = await create();
    await db.exec(`update sponsor.staff set active = false where id = '${STAFF2}'`);
    expect((await mutate(request, "assign", { assigneeId: STAFF2 }, ADMIN)).status).toBe(400);
    await db.exec(`update sponsor.staff set active = true, role = 'developer' where id = '${STAFF2}'`);
    expect((await mutate(request, "assign", { assigneeId: STAFF2 }, ADMIN)).status).toBe(400);
    await db.exec(`update sponsor.staff set role = 'admin' where id = '${STAFF2}'; update neon_auth."user" set "emailVerified" = false where id = '${ADMIN2}'`);
    expect((await mutate(request, "assign", { assigneeId: STAFF2 }, ADMIN)).status).toBe(400);
  });
  it("denies developers without sponsor agreement and anonymous requests", async () => {
    const { db, call } = await fixture();
    await db.exec(`update sponsor.staff set role = 'developer' where id = '${STAFF}'`);
    expect((await call(ADMIN)).status).toBe(403); expect((await call("")).status).toBe(401);
  });
  it("rolls back reply, revision and status together if history cannot be recorded", async () => {
    const { db, create, mutate, call } = await fixture(); const request = await create();
    await db.query("insert into sponsor.request_history(request_id,revision,actor_email,kind) values($1,1,'existing@example.com','reply')", [request.id]);
    expect((await mutate(request, "reply", { body: "Must not partially save" })).status).toBe(503);
    const saved = ((await call(USER, "request", "GET", undefined, request.id)).result as { request: RequestDetail }).request;
    expect(saved.revision).toBe(0); expect(saved.replies).toEqual([]); expect(saved.status).toBe("submitted");
  });
  it("ends a revoked administrator's mutation access even after assignment", async () => {
    const { db, create, mutate } = await fixture(); const request = await create();
    await mutate(request, "assign", { assigneeId: STAFF }, ADMIN);
    await db.exec(`update sponsor.staff set active = false where id = '${STAFF}'`);
    await expect(db.query("select sponsor.mutate_request($1,$2,1,'reply',$3::jsonb)", [ADMIN, request.id, JSON.stringify({ body: "Revoked admin" })])).rejects.toMatchObject({ code: "42501" });
  });
});
