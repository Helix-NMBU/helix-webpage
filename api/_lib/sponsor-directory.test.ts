import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { emptyCv } from "../../src/features/MemberCV/model.js";
import type { CvData, CvSharing } from "../../src/features/MemberCV/types.js";
import type { SponsorDirectoryResponse, SponsorProfileResponse } from "../../src/features/SponsorWorkspace/directory-types.js";
import { createSponsorAccess, type SponsorDatabase } from "./sponsor-access.js";
import { createSponsorDirectoryHandler } from "./sponsor-directory.js";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const MEMBER = "00000000-0000-4000-8000-000000000003";
const ORG = "00000000-0000-4000-8000-000000000004";
const OTHER_ORG = "00000000-0000-4000-8000-000000000005";
const NOW = new Date("2026-10-25T12:00:00Z");
const SHARING: CvSharing = { cv: true, email: false, phone: false };
const CV: CvData = {
  ...emptyCv("Åse Ødegård", "hidden@example.invalid"), phone: "+4712345678", fieldOfStudy: "Robotics", graduationYear: "2027", headline: "Controls engineer", summary: "Control systems and testing.",
  education: [{ id: "ed", institution: "NMBU", degree: "Master", startDate: "2024", endDate: "2027", description: "" }],
  experience: [
    { id: "helix", organization: " Helix NMBU ", title: "Control lead", startDate: "2026", endDate: "Present", description: "Testing", department: "Electronics", season: "S27" },
    { id: "other", organization: "Other Company", title: "Mechanical lead", startDate: "2025", endDate: "2026", description: "Work", department: "Mechanical" },
  ], skills: ["Python", "Control systems"],
};
let db: PGlite;
let member: string;
let revision: number;
let fileNumber: number;
let presign: ReturnType<typeof vi.fn<(path: string, disposition?: "inline" | "attachment") => Promise<string>>>;

async function change(action: "save" | "publish" | "withdraw", cv: CvData = CV, sharing = SHARING) {
  let path: string | null = null;
  if (action === "publish" && sharing.cv) {
    path = `${member}/10000000-0000-4000-8000-${String(++fileNumber).padStart(12, "0")}.pdf`;
    await db.query("select cv.prepare_upload($1,$2,$3)", [member, path, revision]);
  }
  await db.query("select cv.commit_member_cv($1,$2,$3,$4::jsonb,$5::jsonb,$6)", [member, action, revision, JSON.stringify(cv), JSON.stringify(sharing), path]);
  revision += 1;
  return path;
}

async function call(action: string, query: Record<string, unknown> = {}, token: string | null = USER, method = "GET") {
  let status = 0;
  let body: unknown;
  const headers: Record<string, unknown> = {};
  const access = createSponsorAccess({ db: db as unknown as SponsorDatabase, verifySession: async (value) => ({ userId: value }), now: () => NOW });
  const handler = createSponsorDirectoryHandler({ db: db as unknown as SponsorDatabase, access, storage: { putPdf: vi.fn(), remove: vi.fn(), presign } });
  const req = { method, query: { action, ...query }, headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as VercelRequest;
  const res = { setHeader: (key: string, value: unknown) => { headers[key] = value; }, status: (code: number) => { status = code; return res; }, json: (value: unknown) => { body = value; return res; } };
  await handler(req, res as unknown as VercelResponse);
  return { status, body, headers };
}

describe("published sponsor directory and current CV authorization", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create schema neon_auth;
      create table neon_auth."user" (id uuid primary key, name text, email text, "emailVerified" boolean, banned boolean);
      create table neon_auth.account (id uuid primary key default gen_random_uuid(), "accountId" text, "providerId" text, "userId" uuid references neon_auth."user"(id), "createdAt" timestamptz default now());
      insert into neon_auth."user" values ('${USER}','Contact','contact@example.invalid',true,false), ('${OTHER}','Other','other@example.invalid',true,false), ('${MEMBER}','Åse','ase@helixnmbu.no',true,false);
      insert into neon_auth.account("accountId","providerId","userId") values ('google-ase','google','${MEMBER}');`);
    for (const name of ["001_member_cv.sql", "003_sponsor_portal.sql"]) {
      await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8"));
    }
    await db.query("insert into sponsor.organizations(id,name) values ($1,'First company'),($2,'Other company')", [ORG, OTHER_ORG]);
    await db.query("insert into sponsor.contacts(organization_id,email) values ($1,'contact@example.invalid'),($2,'other@example.invalid')", [ORG, OTHER_ORG]);
    await db.query("insert into sponsor.agreements(organization_id,tier,starts_at,ends_at) values ($1,'silver','2026-01-01','2027-01-01'),($2,'silver','2026-01-01','2027-01-01')", [ORG, OTHER_ORG]);
    member = (await db.query<{ onboard_member: string }>("select identity.onboard_member($1,'google-ase','ase@helixnmbu.no','Åse',$2::jsonb,$3::jsonb)", [MEMBER, JSON.stringify(CV), JSON.stringify(SHARING)])).rows[0].onboard_member;
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("truncate cv.documents, cv.publications, cv.directory_entries, cv.file_cleanup, cv.upload_candidates; update sponsor.contacts set active=true; update sponsor.organizations set active=true; update sponsor.agreements set tier='silver', starts_at='2026-01-01', ends_at='2027-01-01', revoked_at=null;");
    await db.query("insert into cv.documents(member_id,draft,sharing) values ($1,$2::jsonb,$3::jsonb)", [member, JSON.stringify(CV), JSON.stringify(SHARING)]);
    revision = 0; fileNumber = 0;
    presign = vi.fn(async () => "https://storage.example.invalid/current-grant");
  });

  it("keeps private drafts absent and exposes only the published version after private edits", async () => {
    expect((await call("directory")).body).toMatchObject({ members: [], total: 0 });
    await change("publish");
    await change("save", { ...CV, fullName: "Private name", skills: ["Private skill"], experience: [] });
    const result = await call("directory");
    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(result.body).toMatchObject({ members: [{ fullName: "Åse Ødegård", skills: ["Control systems", "Python"], departments: ["Electronics"] }], total: 1 });
    expect(JSON.stringify(result.body)).not.toMatch(/Private name|Private skill|hidden@example|12345678/);
    const profile = (await call("profile", { id: member })).body as SponsorProfileResponse;
    expect(profile.profile).not.toHaveProperty("contactEmail");
    expect(profile.profile).not.toHaveProperty("phone");
    expect(profile.profile).not.toHaveProperty("translations");
  });

  it("filters exactly normalized published fields and does not infer departments from titles", async () => {
    await change("publish");
    const matching = await call("directory", { q: "ØDEG", programme: " robotics ", year: "2027", department: "electronics", skill: "PYTHON" });
    expect((matching.body as SponsorDirectoryResponse).members).toHaveLength(1);
    for (const query of [{ programme: "Robo" }, { department: "Mechanical" }, { skill: "Control" }]) {
      expect((await call("directory", query)).body).toMatchObject({ members: [] });
    }
    expect(matching.body).toMatchObject({ filters: { programmes: ["Robotics"], years: ["2027"], departments: ["Electronics"], skills: ["Control systems", "Python"] } });
  });

  it("keeps missing optional programme and year browseable and never reads identity fallbacks", async () => {
    await change("publish", { ...CV, fieldOfStudy: "", graduationYear: "", experience: [], skills: [] });
    const listing = (await call("directory")).body as SponsorDirectoryResponse;
    expect(listing.members).toMatchObject([{ programme: null, graduationYear: null, departments: [], skills: [] }]);
    expect((await call("directory", { year: "2027" })).body).toMatchObject({ members: [] });
  });

  it("accepts filter values up to the publication model's permitted field lengths", async () => {
    const programme = "Programme ".repeat(40).trim();
    const department = "Department ".repeat(35).trim();
    await change("publish", { ...CV, fieldOfStudy: programme, experience: [{ ...CV.experience[0], department }] });
    expect((await call("directory", { programme, department })).body).toMatchObject({ members: [{ id: member }] });
  });

  it("keeps profiles visible without shared CVs and honors current published contact consent", async () => {
    await change("publish", CV, { cv: false, email: true, phone: true });
    const profile = await call("profile", { id: member });
    expect(profile.body).toMatchObject({ member: { canViewCv: false, contactEmail: "hidden@example.invalid", phone: "+4712345678" } });
    expect((await call("cv", { id: member })).status).toBe(404);
    expect(presign).not.toHaveBeenCalled();
    await change("save", CV, { cv: true, email: false, phone: false });
    expect((await call("profile", { id: member })).body).toMatchObject({ profile: { contactEmail: "hidden@example.invalid", phone: "+4712345678" } });
  });

  it("views and downloads only the matching current file and never accepts a file path", async () => {
    const oldPath = await change("publish");
    const current = await change("publish", { ...CV, fullName: "Republished name" });
    expect((await call("cv", { id: member, disposition: "inline" })).body).toMatchObject({ expiresIn: 120 });
    expect(presign).toHaveBeenLastCalledWith(current, "inline");
    expect((await call("cv", { id: member })).status).toBe(200);
    expect(presign).toHaveBeenLastCalledWith(current, "attachment");
    expect((await call("cv", { id: member, path: oldPath })).status).toBe(400);
    expect((await call("cv", { id: oldPath })).status).toBe(400);
    await db.query("update cv.directory_entries set cv_path=$1 where member_id=$2", [oldPath, member]);
    expect((await call("cv", { id: member })).status).toBe(404);
  });

  it("withdraws profiles and files while preserving private drafts", async () => {
    await change("publish");
    await change("withdraw");
    expect((await call("directory")).body).toMatchObject({ members: [] });
    expect((await call("profile", { id: member })).status).toBe(404);
    expect((await call("cv", { id: member })).status).toBe(404);
    expect(presign).not.toHaveBeenCalled();
    expect((await db.query("select draft->>'fullName' as name from cv.documents where member_id=$1", [member])).rows[0]).toEqual({ name: "Åse Ødegård" });
  });

  it.each(["bronze", "partner", "service"])("denies all directory actions for %s even with an explicit member ID", async (tier) => {
    await change("publish");
    await db.query("update sponsor.agreements set tier=$1 where organization_id=$2", [tier, ORG]);
    for (const action of ["directory", "profile", "cv"]) expect((await call(action, { id: member })).status).toBe(403);
    expect(presign).not.toHaveBeenCalled();
  });

  it("rechecks expiry, contact revocation, anonymous and uninvited member access on direct endpoints", async () => {
    await change("publish");
    expect((await call("cv", { id: member }, null)).status).toBe(401);
    expect((await call("profile", { id: member }, MEMBER)).status).toBe(403);
    await db.query("update sponsor.agreements set ends_at=$1 where organization_id=$2", [NOW, ORG]);
    expect((await call("cv", { id: member })).status).toBe(403);
    // A valid different sponsor reads the same shared directory, but cannot borrow the revoked organization's session.
    expect((await call("cv", { id: member }, OTHER)).status).toBe(200);
    await db.query("update sponsor.contacts set active=false where organization_id=$1", [OTHER_ORG]);
    expect((await call("cv", { id: member, organizationId: ORG }, OTHER)).status).toBe(403);
  });

  it("does not return a fresh signed grant if publication or entitlement changes during signing", async () => {
    await change("publish");
    presign.mockImplementationOnce(async () => { await change("withdraw"); return "https://storage.example.invalid/stale"; });
    expect((await call("cv", { id: member })).status).toBe(404);
    await change("publish");
    presign.mockImplementationOnce(async () => { await db.query("update sponsor.agreements set revoked_at=$1 where organization_id=$2", [NOW, ORG]); return "https://storage.example.invalid/stale"; });
    expect((await call("cv", { id: member })).status).toBe(403);
  });

  it("rejects malformed query values, invalid actions and non-GET methods without leaking internals", async () => {
    await change("publish");
    for (const query of [{ q: ["a", "b"] }, { year: "nope" }, { skill: "x".repeat(161) }]) expect((await call("directory", query)).status).toBe(400);
    expect((await call("arbitrary")).status).toBe(400);
    expect((await call("directory", {}, USER, "POST")).status).toBe(405);
    presign.mockRejectedValueOnce(new Error("storage credential secret"));
    const failed = await call("cv", { id: member });
    expect(failed.status).toBe(503);
    expect(JSON.stringify(failed.body)).not.toContain("credential");
  });
});
