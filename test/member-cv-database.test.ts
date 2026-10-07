import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { emptyCv } from "../src/features/MemberCV/model";
import type { CvData } from "../src/features/MemberCV/types";
import { asOwner, asUser, portalDatabase } from "./support/portal-database";

const member = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const forged = "10000000-0000-4000-8000-000000000003";
const sponsor = "10000000-0000-4000-8000-000000000004";
const organization = "20000000-0000-4000-8000-000000000001";
const path1 = `${member}/30000000-0000-4000-8000-000000000001.pdf`;
const path2 = `${member}/30000000-0000-4000-8000-000000000002.pdf`;
const sharing = { cv: true, email: false, phone: false };
const cv: CvData = { ...emptyCv("Åse Ødegård", "private@example.no"), phone: "12345678", fieldOfStudy: "Robotics", graduationYear: "2027", education: [{ id: "nmbu", institution: "NMBU", degree: "Master", startDate: "2024", endDate: "2027", description: "" }] };
let db: PGlite;

async function commit(action: string, revision: number, data: CvData | null = cv, flags = sharing, path: string | null = null) {
  await asUser(db, member, "ase@helixnmbu.no", "service_role");
  if (action === "publish" && path) await db.query("select public.prepare_member_cv_upload($1,$2,$3)", [member, path, revision]);
  return rawCommit(action, revision, data, flags, path);
}
async function rawCommit(action: string, revision: number, data: CvData | null = cv, flags = sharing, path: string | null = null) {
  return db.query("select public.commit_member_cv($1,$2,$3,$4::jsonb,$5::jsonb,$6) as saved", [member, action, revision, data === null ? null : JSON.stringify(data), JSON.stringify(flags), path]);
}
async function prepare(path: string, revision = 0) {
  await asUser(db, member, "ase@helixnmbu.no", "service_role");
  await db.query("select public.prepare_member_cv_upload($1,$2,$3)", [member, path, revision]);
}
async function settle(path: string | null = null) {
  await asUser(db, member, "ase@helixnmbu.no", "service_role");
  return db.query<{ settled: { published_path: string | null } }>("select public.settle_member_cv_upload($1,$2) as settled", [member, path]);
}
async function directory() { return (await db.query("select * from public.list_sponsor_members()")).rows; }
async function files() { return (await db.query("select name from storage.objects where bucket_id='member-cvs'")).rows; }

describe("member CV SQL authorization and publication", () => {
  beforeAll(async () => {
    db = await portalDatabase();
    await db.exec(`
      insert into auth.users(id,email) values
      ('${member}','ase@helixnmbu.no'),('${other}','other@helixnmbu.no'),('${forged}','forged@helixnmbu.no'),('${sponsor}','sponsor@example.no');
      insert into auth.identities(id,user_id,provider,identity_data) values
      ('member','${member}','google','{"sub":"google-member"}'),('other','${other}','google','{"sub":"google-other"}');
      insert into public.sponsor_organizations(id,name,slug) values('${organization}','Fictional sponsor','fictional');
      insert into public.sponsor_contacts(organization_id,user_id,email,full_name) values('${organization}','${sponsor}','sponsor@example.no','Sponsor');
      insert into public.sponsorship_agreements(organization_id,tier,starts_at,ends_at,talent_directory)
      values('${organization}','Silver',current_date-1,current_date+1,true);
      insert into storage.objects(bucket_id,name) values('member-cvs','${path1}'),('member-cvs','${path2}');
    `);
    await asUser(db, member, "ase@helixnmbu.no", "service_role");
    await db.query("select public.onboard_member_cv($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [member, "google-member", "ase@helixnmbu.no", "Åse", JSON.stringify(cv), JSON.stringify(sharing)]);
    await db.query("select public.onboard_member_cv($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [other, "google-other", "other@helixnmbu.no", "Other", JSON.stringify(emptyCv("Other")), JSON.stringify(sharing)]);
    await asOwner(db);
  }, 30000);
  beforeEach(async () => { await asOwner(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback"); await asOwner(db); });
  afterAll(async () => { await db?.close(); });

  it("self-onboards without an active members row and grants no admin rights", async () => {
    await asUser(db, member, "ase@helixnmbu.no");
    expect((await db.query("select * from public.member_cv_documents")).rows).toHaveLength(1);
    expect((await db.query("select public.has_verified_member_workspace() as verified, public.current_member_id() as member, public.is_portal_admin() as admin")).rows[0]).toEqual({ verified: true, member: null, admin: false });
  });
  it("prevents another member, sponsor and forged client from accessing or writing the draft", async () => {
    await asUser(db, other, "other@helixnmbu.no");
    expect((await db.query("select * from public.member_cv_documents where user_id=$1", [member])).rows).toEqual([]);
    await asUser(db, sponsor, "sponsor@example.no");
    expect((await db.query("select * from public.member_cv_documents")).rows).toEqual([]);
    await asUser(db, forged, "forged@helixnmbu.no");
    expect((await db.query("select public.has_verified_member_workspace() as verified")).rows[0]).toEqual({ verified: false });
    await expect(db.query("select public.onboard_member_cv($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [forged, "made-up", "forged@helixnmbu.no", "Forged", JSON.stringify(cv), JSON.stringify(sharing)])).rejects.toThrow("permission denied");
  });
  it("publishes redacted directory data while later saves stay private and stale saves fail", async () => {
    await commit("publish", 0, cv, sharing, path1);
    await asUser(db, sponsor, "sponsor@example.no");
    const published = await directory();
    expect(published[0]).toMatchObject({ full_name: "Åse Ødegård", email: null, personal_phone: null, cv_url: path1 });
    expect(await files()).toEqual([{ name: path1 }]);
    await commit("save", 1, { ...cv, fullName: "Unpublished edit" });
    await asUser(db, sponsor, "sponsor@example.no");
    expect((await directory())[0]).toMatchObject({ full_name: "Åse Ødegård", cv_url: path1 });
    await expect(commit("save", 1)).rejects.toThrow("Revision conflict");
  });
  it("republish retires the old file and withdrawal blocks directory and file access", async () => {
    await commit("publish", 0, cv, sharing, path1);
    await asOwner(db); await db.query("update public.students set profile_image_url='existing-avatar' where id=$1", [member]);
    await commit("publish", 1, { ...cv, fullName: "Published update" }, { cv: true, email: true, phone: true }, path2);
    await asUser(db, sponsor, "sponsor@example.no");
    expect((await directory())[0]).toMatchObject({ full_name: "Published update", email: "private@example.no", personal_phone: "12345678", cv_url: path2, profile_image_url: "existing-avatar" });
    expect(await files()).toEqual([{ name: path2 }]);
    await commit("withdraw", 2, null);
    await asUser(db, sponsor, "sponsor@example.no");
    expect(await directory()).toEqual([]);
    expect(await files()).toEqual([]);
    await asUser(db, member, "ase@helixnmbu.no");
    expect((await db.query("select draft,published_revision from public.member_cv_documents")).rows[0]).toMatchObject({ draft: { fullName: "Published update" }, published_revision: null });
  });
  it("publishes Helix experience roles and metadata without treating other employers as Helix", async () => {
    const helixRoles = [
      { id: "lead", organization: "\ufeff Helix\t\n\u000b\u000c\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000NMBU\u00a0", title: "Team lead", startDate: "2026-09", endDate: "Present", description: "Led testing", department: "Suspension", season: "S27", url: "https://example.com/team" },
      { id: "member", organization: "HELIX", title: "Team member", startDate: "2025", endDate: "2026", description: "Built prototypes", season: "S26" },
      { id: "other", organization: "Helix Consulting", title: "Consultant", startDate: "2024", endDate: "2025", description: "Separate employer", season: "S25" },
    ];
    const data = { ...cv, experience: helixRoles, projects: [
      { id: "legacy", name: "Suspension", role: "Team lead", season: "S27", description: "Legacy project", url: "" },
    ] };
    await commit("publish", 0, data, sharing, path1);
    await asUser(db, sponsor, "sponsor@example.no");
    expect((await directory())[0]).toMatchObject({ email: null, personal_phone: null });
    await asOwner(db);
    expect((await db.query("select career_entries from public.students where id=$1", [member])).rows[0]).toEqual({ career_entries: helixRoles });
    const publishedRoles = (await db.query("select season,title from public.positions where student_id=$1 order by season", [member])).rows;
    expect(publishedRoles).toEqual([{ season: "S26", title: "Team member" }, { season: "S27", title: "Team lead" }]);
    await commit("save", 1, { ...data, experience: [] });
    await asOwner(db);
    expect((await db.query("select season,title from public.positions where student_id=$1 order by season", [member])).rows).toEqual(publishedRoles);
    expect((await db.query("select career_entries from public.students where id=$1", [member])).rows[0]).toEqual({ career_entries: helixRoles });
  });
  it("blocks Bronze, Service and expired agreements even if talent_directory is set", async () => {
    await commit("publish", 0, cv, sharing, path1);
    for (const tier of ["Bronze", "Service"]) {
      await asOwner(db); await db.query("update public.sponsorship_agreements set tier=$1 where organization_id=$2", [tier, organization]);
      await asUser(db, sponsor, "sponsor@example.no");
      expect(await directory()).toEqual([]); expect(await files()).toEqual([]);
    }
    await asOwner(db); await db.exec("update public.sponsorship_agreements set tier='Gold',starts_at=current_date-10,ends_at=current_date-1");
    await asUser(db, sponsor, "sponsor@example.no");
    expect(await directory()).toEqual([]); expect(await files()).toEqual([]);
  });
  it("rejects direct legacy projection writes so active members cannot bypass publishing", async () => {
    await commit("publish", 0, cv, sharing, path1);
    await asOwner(db); await db.query("insert into public.members(user_id,email,full_name) values($1,$2,$3)", [member, "ase@helixnmbu.no", "Åse"]);
    await asUser(db, member, "ase@helixnmbu.no");
    await expect(db.query("update public.students set full_name='Bypass' where id=$1", [member])).rejects.toThrow("permission denied");
  });
  it("requires the linked Google identity and current email even for a stored Workspace account", async () => {
    await asOwner(db); await db.query("update auth.identities set identity_data='{}'::jsonb where user_id=$1", [member]);
    await asUser(db, member, "ase@helixnmbu.no");
    expect((await db.query("select * from public.member_cv_documents")).rows).toEqual([]);
  });
  it("settles before a delayed commit and rejects publication of its retired candidate", async () => {
    await prepare(path1);
    expect((await settle(path1)).rows[0].settled.published_path).toBeNull();
    expect((await db.query("select status from public.member_cv_upload_candidates where path=$1", [path1])).rows).toEqual([{ status: "retired" }]);
    expect((await db.query("select path from public.member_cv_file_cleanup")).rows).toEqual([{ path: path1 }]);
    await db.exec("savepoint delayed_commit");
    await expect(rawCommit("publish", 0, cv, sharing, path1)).rejects.toThrow("Upload candidate cancelled or expired");
    await db.exec("rollback to savepoint delayed_commit");
    expect((await db.query("select revision,published_path from public.member_cv_documents where user_id=$1", [member])).rows).toEqual([{ revision: 0, published_path: null }]);
  });
  it("settles after a finished commit and preserves its current PDF without queuing deletion", async () => {
    await prepare(path1);
    await rawCommit("publish", 0, cv, sharing, path1);
    expect((await settle(path1)).rows[0].settled.published_path).toBe(path1);
    expect((await db.query("select status from public.member_cv_upload_candidates where path=$1", [path1])).rows).toEqual([{ status: "current" }]);
    expect((await db.query("select path from public.member_cv_file_cleanup")).rows).toEqual([]);
    await asUser(db, sponsor, "sponsor@example.no");
    expect(await files()).toEqual([{ name: path1 }]);
  });
  it("keeps active candidates private and leased, then durably retires abandoned uploads after expiry", async () => {
    await prepare(path1);
    await settle();
    expect((await db.query("select status from public.member_cv_upload_candidates where path=$1", [path1])).rows).toEqual([{ status: "pending" }]);
    expect((await db.query("select path from public.member_cv_file_cleanup")).rows).toEqual([]);
    await asUser(db, sponsor, "sponsor@example.no");
    expect(await files()).toEqual([]);
    await asOwner(db);
    await db.query("update public.member_cv_upload_candidates set expires_at=clock_timestamp()-interval '1 second' where path=$1", [path1]);
    await settle();
    expect((await db.query("select status from public.member_cv_upload_candidates where path=$1", [path1])).rows).toEqual([{ status: "retired" }]);
    expect((await db.query("select path from public.member_cv_file_cleanup")).rows).toEqual([{ path: path1 }]);
    await expect(rawCommit("publish", 0, cv, sharing, path1)).rejects.toThrow("Upload candidate cancelled or expired");
  });
  it("withdraws visibility while retired objects still exist and later draft saves remain available", async () => {
    await commit("publish", 0, cv, sharing, path1);
    await commit("withdraw", 1, null);
    await settle();
    // Storage deletion can fail independently; its object and durable queue remain.
    expect((await db.query("select path from public.member_cv_file_cleanup")).rows).toEqual([{ path: path1 }]);
    await asUser(db, sponsor, "sponsor@example.no");
    expect(await directory()).toEqual([]);
    expect(await files()).toEqual([]);
    await commit("save", 2, { ...cv, fullName: "Private edit during storage outage" });
    await asUser(db, member, "ase@helixnmbu.no");
    expect((await db.query("select revision,draft from public.member_cv_documents")).rows[0]).toMatchObject({ revision: 3, draft: { fullName: "Private edit during storage outage" } });
  });
  it("restricts durable upload tracking and settlement RPCs to the service role", async () => {
    await asUser(db, member, "ase@helixnmbu.no");
    expect((await db.query("select has_table_privilege('authenticated','public.member_cv_upload_candidates','SELECT') as can_read, has_function_privilege('authenticated','public.prepare_member_cv_upload(uuid,text,integer)','EXECUTE') as can_prepare, has_function_privilege('authenticated','public.settle_member_cv_upload(uuid,text,boolean)','EXECUTE') as can_settle")).rows[0]).toEqual({ can_read: false, can_prepare: false, can_settle: false });
  });

  it("cancels uncertain uploads immediately but defers their durable deletion until late Storage writes settle", async () => {
    await prepare(path1);
    await db.query("select public.settle_member_cv_upload($1,$2,true)", [member, path1]);
    expect((await db.query("select status from public.member_cv_upload_candidates where path=$1", [path1])).rows).toEqual([{ status: "retired" }]);
    expect((await db.query("select not_before > clock_timestamp()+interval '14 minutes' as deferred from public.member_cv_file_cleanup where path=$1", [path1])).rows).toEqual([{ deferred: true }]);
    // A later normal cleanup pass must not shorten the settlement window.
    await settle();
    expect((await db.query("select not_before > clock_timestamp()+interval '14 minutes' as deferred from public.member_cv_file_cleanup where path=$1", [path1])).rows).toEqual([{ deferred: true }]);
    await expect(rawCommit("publish", 0, cv, sharing, path1)).rejects.toThrow("Upload candidate cancelled or expired");
  });

});
