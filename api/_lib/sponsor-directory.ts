import type { VercelRequest, VercelResponse } from "@vercel/node";
import { validateCvData } from "../../src/features/MemberCV/model.js";
import type { CvData, CvSharing } from "../../src/features/MemberCV/types.js";
import {
  distinctDirectoryValues, normalizeDirectoryValue, publishedDepartments,
  type PublishedCvProfile, type SponsorDirectoryMember,
} from "../../src/features/SponsorWorkspace/directory-types.js";
import { MemberCvError } from "./member-cv-error.js";
import { isOwnedPdfPath, PRESIGN_SECONDS, type CvObjectStorage } from "./member-cv-storage.js";
import { requireDirectory, SponsorError, sponsorBearer, type SponsorAccess, type SponsorDatabase } from "./sponsor-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PublishedRow = {
  member_id: string; snapshot: unknown; publication_sharing: CvSharing;
  path: string | null; cv_path: string | null; share_cv: boolean; share_email: boolean; share_phone: boolean;
};
type Publication = { member: SponsorDirectoryMember; profile: PublishedCvProfile; path: string | null };
const publishedQuery = `select d.member_id, p.snapshot, p.sharing as publication_sharing, p.path,
  d.cv_path, d.share_cv, d.share_email, d.share_phone
  from cv.directory_entries d
  join cv.publications p on p.member_id = d.member_id and p.revision = d.published_revision
  where d.visible and p.snapshot is not null`;

function publication(row: PublishedRow): Publication {
  const cv: CvData = validateCvData(row.snapshot, true);
  const profile: PublishedCvProfile = {
    fullName: cv.fullName, headline: cv.headline, summary: cv.summary, city: cv.city,
    fieldOfStudy: cv.fieldOfStudy, graduationYear: cv.graduationYear,
    education: cv.education, experience: cv.experience, projects: cv.projects,
    skills: cv.skills, languages: cv.languages, links: cv.links,
    ...(cv.references ? { references: cv.references } : {}),
    ...(row.share_email && row.publication_sharing.email && cv.contactEmail ? { contactEmail: cv.contactEmail } : {}),
    ...(row.share_phone && row.publication_sharing.phone && cv.phone ? { phone: cv.phone } : {}),
  };
  const path = row.share_cv && row.publication_sharing.cv && row.path && row.cv_path === row.path
    && isOwnedPdfPath(row.member_id, row.path) ? row.path : null;
  const member: SponsorDirectoryMember = {
    id: row.member_id, fullName: cv.fullName, headline: cv.headline,
    programme: cv.fieldOfStudy || null, graduationYear: cv.graduationYear || null,
    departments: publishedDepartments(cv), skills: distinctDirectoryValues(cv.skills),
    canViewCv: Boolean(path),
    ...(profile.contactEmail ? { contactEmail: profile.contactEmail } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
  };
  return { member, profile, path };
}

function queryText(value: unknown, label: string, max = 160): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new SponsorError(400, `Invalid ${label}.`);
  }
  return value.trim();
}

export function createSponsorDirectoryHandler(deps: {
  db: SponsorDatabase; access: SponsorAccess; storage: CvObjectStorage;
}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const context = await deps.access.authenticate(sponsorBearer(req.headers.authorization));
      requireDirectory(context);
      const action = queryText(req.query.action, "directory action");
      if (!["directory", "profile", "cv"].includes(action)) throw new SponsorError(400, "Invalid directory action.");
      if (req.query.path !== undefined || req.query.cvPath !== undefined) throw new SponsorError(400, "Request a member's current publication, not a file path.");
      if (action === "directory") {
        const search = normalizeDirectoryValue(queryText(req.query.q, "name search", 200));
        const programme = normalizeDirectoryValue(queryText(req.query.programme, "study programme"));
        const year = queryText(req.query.year, "graduation year", 4);
        if (year && !/^[0-9]{4}$/.test(year)) throw new SponsorError(400, "Invalid graduation year.");
        const department = normalizeDirectoryValue(queryText(req.query.department, "Helix department"));
        const skill = normalizeDirectoryValue(queryText(req.query.skill, "skill"));
        const rows = await deps.db.query<PublishedRow>(`${publishedQuery} order by lower(p.snapshot->>'fullName'), d.member_id`);
        const all = rows.rows.map((row) => publication(row).member);
        const members = all.filter((member) =>
          (!search || normalizeDirectoryValue(member.fullName).includes(search))
          && (!programme || normalizeDirectoryValue(member.programme ?? "") === programme)
          && (!year || member.graduationYear === year)
          && (!department || member.departments.some((value) => normalizeDirectoryValue(value) === department))
          && (!skill || member.skills.some((value) => normalizeDirectoryValue(value) === skill)),
        );
        return res.status(200).json({ members, total: all.length, filters: {
          programmes: distinctDirectoryValues(all.flatMap((member) => member.programme ? [member.programme] : [])),
          years: distinctDirectoryValues(all.flatMap((member) => member.graduationYear ? [member.graduationYear] : [])),
          departments: distinctDirectoryValues(all.flatMap((member) => member.departments)),
          skills: distinctDirectoryValues(all.flatMap((member) => member.skills)),
        } });
      }
      const id = queryText(req.query.id, "member identifier", 36);
      if (!UUID.test(id)) throw new SponsorError(400, "Invalid member identifier.");
      const row = (await deps.db.query<PublishedRow>(`${publishedQuery} and d.member_id = $1`, [id])).rows[0];
      if (!row) throw new SponsorError(404, "This published member profile is no longer available.");
      const published = publication(row);
      if (action === "profile") return res.status(200).json({ member: published.member, profile: published.profile });
      const disposition = queryText(req.query.disposition, "CV action") || "attachment";
      if (disposition !== "inline" && disposition !== "attachment") throw new SponsorError(400, "Invalid CV action.");
      if (!published.path) throw new SponsorError(404, "This member is not sharing a current CV.");
      const signed = await deps.storage.presign(published.path, disposition);
      // A withdrawal or replacement during signing must not issue a fresh grant.
      const current = (await deps.db.query<PublishedRow>(`${publishedQuery} and d.member_id = $1`, [id])).rows[0];
      if (!current || publication(current).path !== published.path) throw new SponsorError(404, "The shared CV changed. Open the current profile again.");
      requireDirectory(await deps.access.authenticate(sponsorBearer(req.headers.authorization)));
      return res.status(200).json({ url: signed, expiresIn: PRESIGN_SECONDS });
    } catch (error) {
      const known = error instanceof SponsorError || error instanceof MemberCvError;
      return res.status(known ? error.status : 503).json({ error: known ? error.message : "Could not load Talent Directory. Please try again." });
    }
  };
}
