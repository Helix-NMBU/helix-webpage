import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createCvServices } from "../api/_lib/member-cv-service.js";
import { emptyCv, withoutCv, privateSharing } from "../src/features/MemberCV/model.js";
import type { CvData } from "../src/features/MemberCV/types.js";

const authUser = "10000000-0000-4000-8000-000000000001";
const otherAuth = "10000000-0000-4000-8000-000000000002";
const sharing = { cv: true, email: false, phone: false };
const cv: CvData = {
  ...emptyCv("Åse Ødegård", "private@example.no"),
  phone: "12345678",
  fieldOfStudy: "Robotics",
  graduationYear: "2027",
  education: [{ id: "nmbu", institution: "NMBU", degree: "Master", startDate: "2024", endDate: "2027", description: "" }],
};
let db: PGlite;
let member = "";
let other = "";

async function onboard(authId: string, sub: string, email: string, name: string, data: CvData = cv) {
  const saved = await db.query<{ onboard_member: string }>(
    "select identity.onboard_member($1,$2,$3,$4,$5::jsonb,$6::jsonb) as onboard_member",
    [authId, sub, email, name, JSON.stringify(data), JSON.stringify(sharing)],
  );
  return saved.rows[0].onboard_member;
}
async function commit(action: string, revision: number, data: CvData | null = cv, flags = sharing, path: string | null = null) {
  if (action === "publish" && path) await db.query("select cv.prepare_upload($1,$2,$3)", [member, path, revision]);
  return db.query("select cv.commit_member_cv($1,$2,$3,$4::jsonb,$5::jsonb,$6) as saved", [member, action, revision, data === null ? null : JSON.stringify(data), JSON.stringify(flags), path]);
}

describe("member CV schema", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema neon_auth;
      create table neon_auth."user" (
        id uuid primary key, name text not null, email text not null, "emailVerified" boolean not null, banned boolean,
        "createdAt" timestamptz default now(), "updatedAt" timestamptz default now()
      );
      create table neon_auth.account (
        id uuid primary key default gen_random_uuid(), "accountId" text not null, "providerId" text not null,
        "userId" uuid not null references neon_auth."user"(id) on delete cascade, "idToken" text,
        "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
      );
      insert into neon_auth."user"(id, name, email, "emailVerified", banned) values
        ('${authUser}', 'Åse', 'ase@helixnmbu.no', true, false),
        ('${otherAuth}', 'Other', 'other@helixnmbu.no', true, false);
      insert into neon_auth.account("accountId", "providerId", "userId") values
        ('google-member', 'google', '${authUser}'),
        ('google-other', 'google', '${otherAuth}');
    `);
    await db.exec(readFileSync(new URL("../db/migrations/001_member_cv.sql", import.meta.url), "utf8"));
    member = await onboard(authUser, "google-member", "ase@helixnmbu.no", "Åse");
    other = await onboard(otherAuth, "google-other", "other@helixnmbu.no", "Other", emptyCv("Other"));
    // Sign-in stays compatible until the additive role migration is applied.
    expect((await db.query("select to_jsonb(m)->>'helix_role' as helix_role from identity.members m where id = $1", [member])).rows[0]).toEqual({ helix_role: null });
    await db.exec(readFileSync(new URL("../db/migrations/002_member_helix_role.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/002_member_helix_role.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/003_admin_managed_member_names.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../db/migrations/003_admin_managed_member_names.sql", import.meta.url), "utf8"));
  });
  afterAll(async () => { await db?.close(); });

  it("links a private profile to neon_auth.user and does not publish it", async () => {
    const row = (await db.query("select auth_user_id, google_sub from identity.members where id = $1", [member])).rows[0];
    expect(row).toEqual({ auth_user_id: authUser, google_sub: "google-member" });
    expect((await db.query("select * from cv.directory_entries where member_id = $1", [member])).rows).toEqual([]);
    expect((await db.query("select has_function_privilege('public', 'identity.onboard_member(uuid,text,text,text,jsonb,jsonb)', 'EXECUTE') as allowed")).rows[0]).toEqual({ allowed: false });
  });

  it("refuses an account that is not the linked Google identity", async () => {
    await expect(onboard(authUser, "made-up", "ase@helixnmbu.no", "Åse")).rejects.toThrow("Identity mismatch");
    await expect(onboard(otherAuth, "google-other", "person@gmail.com", "Other")).rejects.toThrow("Identity mismatch");
  });

  it("keeps an administrator's Helix role assignment through member onboarding", async () => {
    await db.query("update identity.members set helix_role = $1 where id = $2", ["Mechanical lead", member]);
    await onboard(authUser, "google-member", "ase@helixnmbu.no", "Åse");
    expect((await db.query("select to_jsonb(m)->>'helix_role' as helix_role from identity.members m where id = $1", [member])).rows[0]).toEqual({ helix_role: "Mechanical lead" });
    await expect(db.query("update identity.members set helix_role = '' where id = $1", [member])).rejects.toThrow("members_helix_role_check");
    await expect(db.query("update identity.members set helix_role = $1 where id = $2", ["x".repeat(151), member])).rejects.toThrow("members_helix_role_check");
    await db.query("update identity.members set helix_role = null where id = $1", [member]);
  });

  it("preserves an administrator's member name when Google onboarding runs again", async () => {
    await db.query("update identity.members set full_name = $1 where id = $2", ["Admin-assigned name", member]);
    try {
      await onboard(authUser, "google-member", "ase@helixnmbu.no", "Changed Google name");
      expect((await db.query("select full_name from identity.members where id = $1", [member])).rows[0]).toEqual({ full_name: "Admin-assigned name" });
    } finally {
      await db.query("update identity.members set full_name = 'Åse' where id = $1", [member]);
    }
  });

  it("publishes a redacted snapshot and keeps a later draft private", async () => {
    const path = `${member}/30000000-0000-4000-8000-000000000001.pdf`;
    await commit("publish", 0, cv, sharing, path);
    const directory = (await db.query("select full_name, contact_email, phone, cv_path, visible from cv.directory_entries where member_id = $1", [member])).rows[0];
    expect(directory).toEqual({ full_name: "Åse Ødegård", contact_email: null, phone: null, cv_path: path, visible: true });
    await commit("save", 1, { ...cv, fullName: "Unpublished edit" });
    expect((await db.query("select full_name from cv.directory_entries where member_id = $1", [member])).rows[0]).toEqual({ full_name: "Åse Ødegård" });
    expect((await db.query("select draft->>'fullName' as name from cv.documents where member_id = $1", [other])).rows[0]).toEqual({ name: "Other" });
    await expect(commit("save", 1)).rejects.toThrow("Revision conflict");
  });

  it("replaces the shared file, records Helix roles, and withdrawal hides the directory", async () => {
    const path = `${member}/30000000-0000-4000-8000-000000000002.pdf`;
    const data = {
      ...cv,
      experience: [
        { id: "lead", organization: "\u00a0Helix NMBU", title: "Team lead", startDate: "2026-09", endDate: "Present", description: "Led testing", season: "S27" },
        { id: "other", organization: "Helix Consulting", title: "Consultant", startDate: "2024", endDate: "2025", description: "Separate employer", season: "S25" },
      ],
    };
    await commit("publish", 2, data, { cv: true, email: true, phone: true }, path);
    const published = (await db.query<{ helix_roles: { season: string; title: string }[]; contact_email: string; phone: string; cv_path: string }>("select contact_email, phone, cv_path, helix_roles from cv.directory_entries where member_id = $1", [member])).rows[0];
    expect(published.contact_email).toBe("private@example.no");
    expect(published.phone).toBe("12345678");
    expect(published.cv_path).toBe(path);
    expect(published.helix_roles).toEqual([{ season: "S27", title: "Team lead" }]);
    expect((await db.query<{ path: string }>("select path from cv.file_cleanup")).rows.map((row) => row.path)).toContain(`${member}/30000000-0000-4000-8000-000000000001.pdf`);
    await commit("withdraw", 3, null);
    expect((await db.query("select visible, cv_path, contact_email from cv.directory_entries where member_id = $1", [member])).rows[0]).toEqual({ visible: false, cv_path: null, contact_email: null });
    expect((await db.query("select draft->>'fullName' as name, published_revision from cv.documents where member_id = $1", [member])).rows[0]).toEqual({ name: "Åse Ødegård", published_revision: null });
  });

  it("clears publication content and directory personal fields on withdraw", async () => {
    const revision = Number((await db.query<{ revision: number }>("select revision from cv.documents where member_id = $1", [member])).rows[0].revision);
    const path = `${member}/30000000-0000-4000-8000-000000000004.pdf`;
    const data = {
      ...cv,
      links: [{ id: "li", label: "LinkedIn", url: "https://www.linkedin.com/in/ase" }],
      experience: [
        { id: "lead", organization: "Helix", title: "Team lead", startDate: "2026", endDate: "Present", description: "Led testing", season: "S27" },
      ],
    };
    await commit("publish", revision, data, { cv: true, email: true, phone: true }, path);
    const published = (await db.query<{ name: string; path: string; linkedin: string; career_entries: unknown[] }>(
      "select snapshot->>'fullName' as name, path, (select linkedin from cv.directory_entries where member_id = p.member_id) as linkedin, (select career_entries from cv.directory_entries where member_id = p.member_id) as career_entries from cv.publications p where member_id = $1 and revision = $2",
      [member, revision + 1],
    )).rows[0];
    expect(published.name).toBe("Åse Ødegård");
    expect(published.path).toBe(path);
    expect(published.linkedin).toBe("https://www.linkedin.com/in/ase");
    expect(published.career_entries).toEqual([expect.objectContaining({ title: "Team lead" })]);
    await commit("withdraw", revision + 1, null);
    const publications = (await db.query<{ snapshot: unknown; path: string | null }>("select snapshot, path from cv.publications where member_id = $1", [member])).rows;
    expect(publications.length).toBeGreaterThan(0);
    for (const row of publications) expect(row).toEqual({ snapshot: null, path: null });
    expect((await db.query(
      "select visible, full_name, contact_email, phone, linkedin, field_of_study, graduation_year, cv_path, career_entries, helix_roles from cv.directory_entries where member_id = $1",
      [member],
    )).rows[0]).toEqual({
      visible: false,
      full_name: null,
      contact_email: null,
      phone: null,
      linkedin: null,
      field_of_study: null,
      graduation_year: null,
      cv_path: null,
      career_entries: [],
      helix_roles: [],
    });
    expect((await db.query("select draft->>'fullName' as name from cv.documents where member_id = $1", [member])).rows[0]).toEqual({ name: "Åse Ødegård" });
  });

  it("cancels an uncertain upload and refuses to publish its retired path", async () => {
    const path = `${member}/30000000-0000-4000-8000-000000000003.pdf`;
    const revision = Number((await db.query<{ revision: number }>("select revision from cv.documents where member_id = $1", [member])).rows[0].revision);
    await db.query("select cv.prepare_upload($1,$2,$3)", [member, path, revision]);
    await db.query("select cv.settle_upload($1,$2,true)", [member, path]);
    expect((await db.query("select status from cv.upload_candidates where path = $1", [path])).rows).toEqual([{ status: "retired" }]);
    expect((await db.query("select not_before > clock_timestamp() + interval '14 minutes' as deferred from cv.file_cleanup where path = $1", [path])).rows).toEqual([{ deferred: true }]);
    await expect(db.query("select cv.commit_member_cv($1,'publish',$2,$3::jsonb,$4::jsonb,$5)", [member, revision, JSON.stringify(cv), JSON.stringify(sharing), path])).rejects.toThrow("Upload candidate cancelled or expired");
  });
  it("atomically deletes a published CV and rolls withdrawal back if resetting its draft fails", async () => {
    const services = createCvServices({ db, storage: { putPdf: async () => undefined, remove: async () => undefined, presign: async () => "unused" } });
    let revision = Number((await db.query<{ revision: number }>("select revision from cv.documents where member_id = $1", [member])).rows[0].revision);
    const path = `${member}/40000000-0000-4000-8000-000000000001.pdf`;
    await commit("publish", revision, cv, sharing, path);
    const deleted = await services.commit(member, { action: "delete", expectedRevision: revision + 1, draft: withoutCv(cv), sharing: privateSharing });
    expect(deleted.draft).toEqual(withoutCv(cv));
    expect(deleted.revision).toBe(revision + 3);
    expect(deleted.publishedPath).toBeNull();
    expect(deleted.publishedRevision).toBeNull();
    expect((await db.query("select visible, cv_path from cv.directory_entries where member_id = $1", [member])).rows[0]).toEqual({ visible: false, cv_path: null });
    expect((await db.query<{ snapshot: unknown; path: string | null }>("select snapshot, path from cv.publications where member_id = $1", [member])).rows.every((item) => item.snapshot === null && item.path === null)).toBe(true);
    expect((await db.query("select path from cv.file_cleanup where path = $1", [path])).rows).toEqual([{ path }]);

    revision = deleted.revision;
    const secondPath = `${member}/40000000-0000-4000-8000-000000000002.pdf`;
    await commit("publish", revision, cv, sharing, secondPath);
    await expect(services.commit(member, { action: "delete", expectedRevision: revision })).rejects.toMatchObject({ status: 409 });
    // Missing reset data fails after withdrawal has run, so this checks transaction rollback.
    await expect(services.commit(member, { action: "delete", expectedRevision: revision + 1, sharing: privateSharing })).rejects.toMatchObject({ status: 503 });
    const retained = await services.read(member);
    expect(retained.revision).toBe(revision + 1);
    expect(retained.draft).toEqual(cv);
    expect(retained.publishedPath).toBe(secondPath);
    expect((await db.query("select visible, cv_path from cv.directory_entries where member_id = $1", [member])).rows[0]).toEqual({ visible: true, cv_path: secondPath });
    expect((await db.query("select path from cv.file_cleanup where path = $1", [secondPath])).rows).toEqual([]);
  });

});
