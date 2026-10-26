import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createWebsiteServices, applicationSeason } from "./website-service.js";
import { MemberCvError } from "./member-cv-error.js";
import type { CvDatabase } from "./member-cv-service.js";
import type { ApplicationRow } from "./website-validation.js";
import { MAX_CV_BYTES, parseCv, websiteBody, isApplicationPath } from "./website-validation.js";
import type { WebsiteStorage } from "./website-storage.js";
import { createWebsiteMailer, websiteEmailMessage, type WebsiteEmailMessage } from "./website-email.js";

const member = "10000000-0000-4000-8000-000000000001";
const recruiterId = "20000000-0000-4000-8000-000000000001";
const positions = [{ id: "software", title: "Software Engineer", department: "Software" }, { id: "other", title: "Engineer", department: "Mechanical" }];
const pdf = Buffer.from("%PDF-1.7\nexample");
const input = { full_name: "Test Applicant", email: "applicant@example.test", phone: "+47 12345678", study_program: "Robotics", year_of_study: 3,
  motivation: "I want to build the car.", position_id: "software", interested_departments: ["Mechanical"], consent: true, cv_base64: pdf.toString("base64") };
let pg: PGlite;
let db: CvDatabase;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("create schema identity; create table identity.members (id uuid primary key, google_sub text, email text);");
  const migration = readFileSync(new URL("../../db/migrations/005_website_applications.sql", import.meta.url), "utf8");
  await pg.exec(migration);
  await pg.exec(migration); // idempotent without broadening permissions
  await pg.exec(readFileSync(new URL("../../db/migrations/007_application_submission_limits.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../db/migrations/009_platform_access_and_managed_positions.sql", import.meta.url), "utf8"));
  db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) };
}, 30000);
beforeEach(async () => {
  await pg.exec("truncate website.applications, website.recruiters, website.application_uploads, website.email_events, website.file_cleanup, website.application_submission_limits, website.positions, identity.members cascade");
  await db.query("insert into identity.members values ($1, 'google-member', 'recruiter@helixnmbu.no')", [member]);
  for (const position of positions) await db.query("insert into website.positions (id, document, visible) values ($1, $2::jsonb, true)", [position.id, JSON.stringify(position)]);
});
afterAll(async () => { await pg.close(); });
function fixture(options: { uncertain?: boolean; uploadFails?: boolean; deleteFails?: boolean; mailFails?: boolean } = {}) {
  const calls: string[] = [];
  const traced: CvDatabase = { query: async <T>(sql: string, params?: unknown[]) => {
    calls.push(sql);
    if (sql.includes("with saved as") && options.uncertain) throw new Error("connection lost after possible commit");
    return db.query<T>(sql, params);
  } };
  const storage: WebsiteStorage = {
    put: vi.fn(async () => { if (options.uploadFails) throw new Error("timeout"); }),
    remove: vi.fn(async () => { if (options.deleteFails) throw new Error("unavailable"); }),
    download: vi.fn(async () => "https://storage.example.test/signed"),
  };
  const authenticate = vi.fn(async (token: string) => {
    if (token !== "member") throw new MemberCvError(401, "Invalid member session.");
    return { userId: member, googleSub: "google-member", email: "recruiter@helixnmbu.no", name: "Test Recruiter" };
  });
  const mail = vi.fn(async () => { if (options.mailFails) throw new Error("unavailable"); return "skipped" as const; });
  const service = createWebsiteServices({ db: traced, authenticate, storage: () => storage, positions: async () => positions,
    mail, now: () => new Date("2026-10-26T12:00:00Z") });
  return { service, storage, mail, calls, authenticate };
}
async function allow() { await db.query("insert into identity.member_roles (member_id, role_key) values ($1, 'project_manager')", [member]); }
const rateLimitKey = "a".repeat(64);
function submit(f: ReturnType<typeof fixture>, body: Record<string, unknown> = input, key = rateLimitKey) {
  return f.service.submit(body, key);
}

describe("website access and submission against PostgreSQL", () => {
  it("denies every protected operation to a member without recruitment access", async () => {
    const f = fixture();
    const id = "30000000-0000-4000-8000-000000000001";
    const operations = [() => f.service.session("member"), () => f.service.list("member", 0), () => f.service.read("member", id),
      () => f.service.file("member", id, "cv"), () => f.service.remove("member", id, false), () => f.service.remove("member", id, true), () => f.service.confirmation("member", id)];
    for (const run of operations) await expect(run()).rejects.toMatchObject({ status: 403 });
    expect(f.calls.every(sql => sql.includes("member_has_feature"))).toBe(true);
    expect(f.storage.download).not.toHaveBeenCalled();
    expect(f.storage.remove).not.toHaveBeenCalled(); expect(f.mail).not.toHaveBeenCalled();
  });
  it("does not grant recruitment access based on an email address alone", async () => {
    const f = fixture();
    f.authenticate.mockResolvedValueOnce({ userId: member, googleSub: "admin-google", email: "henrik.engdal@helixnmbu.no", name: "Admin" });
    await expect(f.service.session("member")).rejects.toMatchObject({ status: 403 });
    expect((await db.query("select * from website.recruiters")).rows).toEqual([]);
  });
  it("requires member authentication even when the recruiter allowlist is populated", async () => {
    await allow(); const f = fixture();
    await expect(f.service.list("forged", 0)).rejects.toMatchObject({ status: 401 });
    expect(f.calls).toEqual([]);
  });
  it("saves all application fields, uses server IDs/title/season and keeps files private", async () => {
    const f = fixture();
    const saved = await submit(f, { ...input, id: recruiterId, season: "S99", position_title: "Forged", cv_path: "another-member/cv.pdf" });
    const row = (await db.query<ApplicationRow>("select * from website.applications")).rows[0];
    expect(row).toMatchObject({ id: saved.id, season: "S27", full_name: input.full_name, email: input.email, phone: input.phone,
      study_program: "Robotics", study_program_other: null, year_of_study: 3, motivation: input.motivation, position_id: "software",
      position_title: "Software Engineer", interested_departments: ["Mechanical"], consent: true, photo_path: null });
    expect(row.id).not.toBe(recruiterId); expect(row.cv_path).toBe(`S27/${row.id}/cv.pdf`);
    expect(f.storage.put).toHaveBeenCalledWith(row.cv_path, pdf);
    expect((await db.query("select * from website.application_uploads")).rows).toEqual([]);
    expect(saved.emailStatus).toBe("skipped");
  });
  it("rejects direct malformed submissions before writing database or storage", async () => {
    const f = fixture();
    for (const change of [{ consent: false }, { position_id: "missing" }, { motivation: "a".repeat(251) }, { year_of_study: 6 },
      { year_of_study: "3" }, { interested_departments: ["Invented"] }, { cv_base64: Buffer.from("fake PDF").toString("base64") },
      { cv_base64: "a".repeat(4 * Math.ceil(MAX_CV_BYTES / 3) + 4) }, { email: "invalid" }, { website: "bot" }]) {
      await expect(submit(f, { ...input, ...change })).rejects.toMatchObject({ status: 400 });
    }
    expect(f.calls).toEqual([]); expect(f.storage.put).not.toHaveBeenCalled();
  });
  it("enforces case-insensitive email/season uniqueness and only removes the new conflicting file", async () => {
    const f = fixture(); await submit(f);
    const first = (await db.query<ApplicationRow>("select * from website.applications")).rows[0];
    await expect(submit(f, { ...input, email: input.email.toUpperCase() })).rejects.toMatchObject({ status: 409 });
    expect((await db.query("select * from website.applications")).rows).toHaveLength(1);
    expect(f.storage.remove).toHaveBeenCalledOnce();
    expect(f.storage.remove).not.toHaveBeenCalledWith(first.cv_path);
  });
  it("tracks uncertain uploads and database outcomes without deleting potentially committed files", async () => {
    for (const option of [{ uncertain: true }, { uploadFails: true }]) {
      const f = fixture(option);
      await expect(submit(f)).rejects.toMatchObject({ status: 503 });
      expect(f.storage.remove).not.toHaveBeenCalled();
    }
    expect((await db.query("select * from website.application_uploads")).rows).toHaveLength(2);
  });
  it("keeps a successful submission when optional email fails", async () => {
    const f = fixture({ mailFails: true });
    await expect(submit(f)).resolves.toMatchObject({ emailStatus: "pending" });
    expect((await db.query("select * from website.applications")).rows).toHaveLength(1);
  });
  it("limits valid public submissions to ten per source network each hour before storing extra files", async () => {
    const f = fixture();
    for (let index = 0; index < 10; index += 1) {
      await submit(f, { ...input, email: `applicant${index}@example.test` });
    }
    await expect(submit(f, { ...input, email: "eleventh@example.test" })).rejects.toMatchObject({ status: 429 });
    expect(f.storage.put).toHaveBeenCalledTimes(10);
    expect((await db.query("select * from website.applications")).rows).toHaveLength(10);
  });
  it("rechecks platform role revocation for listing, file access and rejection", async () => {
    await allow(); const f = fixture(); const { id } = await submit(f);
    await expect(f.service.file("member", id, "cv")).resolves.toMatchObject({ expiresIn: 120 });
    await db.query("delete from identity.member_roles where member_id = $1 and role_key = 'project_manager'", [member]);
    await expect(f.service.list("member", 0)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.file("member", id, "cv")).rejects.toMatchObject({ status: 403 });
    await expect(f.service.remove("member", id, true)).rejects.toMatchObject({ status: 403 });
    expect(f.storage.download).toHaveBeenCalledOnce(); expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it("refuses a row pointing at another application's files", async () => {
    await allow(); const f = fixture(); const { id } = await submit(f);
    await db.query("update website.applications set cv_path = $1", [`S27/${recruiterId}/cv.pdf`]);
    await expect(f.service.file("member", id, "cv")).rejects.toMatchObject({ status: 403 });
    await expect(f.service.remove("member", id, true)).rejects.toMatchObject({ status: 409 });
    expect(f.storage.download).not.toHaveBeenCalled(); expect(f.storage.remove).not.toHaveBeenCalled();
    expect(f.mail).toHaveBeenCalledOnce(); // confirmation only
  });
  it("atomically queues deletion and retains retryable cleanup on S3 failure", async () => {
    await allow(); const f = fixture({ deleteFails: true }); const { id } = await submit(f);
    await expect(f.service.remove("member", id, true)).resolves.toEqual({ emailStatus: "skipped", cleanupPending: true });
    expect((await db.query("select * from website.applications")).rows).toEqual([]);
    expect((await db.query("select * from website.file_cleanup")).rows).toHaveLength(1);
    await expect(f.service.file("member", id, "cv")).rejects.toMatchObject({ status: 404 });
  });
  it("preserves the application and file if rejection email cannot be confirmed", async () => {
    await allow(); const f = fixture({ mailFails: true }); const { id } = await submit(f);
    await expect(f.service.remove("member", id, true)).rejects.toThrow("unavailable");
    expect((await db.query("select * from website.applications")).rows).toHaveLength(1);
    expect(f.storage.remove).not.toHaveBeenCalled();
  });
  it("denies Data API/browser roles, including roles with an inherited table grant", async () => {
    await pg.exec("create role authenticated; grant usage on schema website to authenticated; grant select on website.applications to authenticated; set role authenticated");
    expect((await db.query("select * from website.applications")).rows).toEqual([]);
    await expect(db.query("select * from website.recruiters")).rejects.toMatchObject({ code: "42501" });
    await pg.exec("reset role");
  });
});

describe("bounded uploads and date rules", () => {
  it("accepts exactly 500 KiB and rejects the next byte or malformed encoding", () => {
    const bytes = Buffer.alloc(MAX_CV_BYTES, 65); bytes.set(Buffer.from("%PDF-"));
    expect(parseCv(bytes.toString("base64"))).toHaveLength(MAX_CV_BYTES);
    expect(() => parseCv(Buffer.concat([bytes, Buffer.from("x")]).toString("base64"))).toThrow();
    expect(() => parseCv("%%%not-base64")).toThrow();
    expect(() => websiteBody("x".repeat(768 * 1024 + 1))).toThrow();
    expect(() => websiteBody("{" )).toThrow();
  });
  it("rolls the season at July midnight in Oslo regardless of server timezone", () => {
    expect(applicationSeason(new Date("2026-06-30T21:59:59Z"))).toBe("S26");
    expect(applicationSeason(new Date("2026-06-30T22:00:00Z"))).toBe("S27");
    expect(isApplicationPath({ season: "S27", id: recruiterId }, `S27/${recruiterId}/../cv.pdf`)).toBe(false);
  });
});

describe("optional email", () => {
  it("records skipped email without any provider key or local allowlist match", async () => {
    const f = fixture(); const { id } = await submit(f);
    const row = (await db.query<ApplicationRow>("select * from website.applications where id = $1", [id])).rows[0];
    const send = vi.fn();
    for (const env of [{},
      { HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_ENABLED: "true", RESEND_API_KEY: "test-key", WEBSITE_EMAIL_TEST_RECIPIENTS: "someone-else@example.test" },
      { HELIX_ENVIRONMENT: "production", RESEND_API_KEY: "test-key" },
      { HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_ENABLED: "true", RESEND_API_KEY: "test-key", WEBSITE_EMAIL_TEST_RECIPIENTS: input.email },
    ]) {
      await expect(createWebsiteMailer(db, env, send)(row, "confirmation")).resolves.toBe("skipped");
    }
    expect(send).not.toHaveBeenCalled();
    expect((await db.query("select status from website.email_events")).rows).toEqual([{ status: "skipped" }]);
  });
  it("sends to the stored local test recipient at most once and never to caller-supplied recipients", async () => {
    const f = fixture(); const { id } = await submit(f);
    const row = (await db.query<ApplicationRow>("select * from website.applications where id = $1", [id])).rows[0];
    const send = vi.fn(async (_message: WebsiteEmailMessage, _key: string) => undefined);
    const mail = createWebsiteMailer(db, { HELIX_ENVIRONMENT: "local", WEBSITE_EMAIL_ENABLED: "true", RESEND_API_KEY: "test-key", WEBSITE_EMAIL_TEST_RECIPIENTS: input.email }, send);
    await expect(mail(row, "rejection")).resolves.toBe("sent");
    await expect(mail(row, "rejection")).resolves.toBe("sent");
    expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0]?.[0]).toMatchObject({ to: input.email });
    expect(websiteEmailMessage(row, "confirmation", "no-reply@helixnmbu.no")).toEqual({
      from: "Helix NMBU <no-reply@helixnmbu.no>", to: input.email,
      template: { id: "takk-for-din-sknad", variables: { POSITION: "Software Engineer" } },
    });
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      from: "Helix NMBU Recruitment <no-reply@helixnmbu.no>",
      subject: "Your application to Helix NMBU — Software Engineer",
      text: expect.stringContaining("After careful consideration, we've decided to move forward with other candidates this time."),
      html: expect.stringContaining("<strong>Software Engineer</strong>"),
    });
  });
});
