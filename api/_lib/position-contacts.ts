import type { CvDatabase } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { UUID_RE } from "./website-validation.js";
import type { PositionContactMember } from "../../src/features/Recruitment/position-contact.js";

type ContactRow = PositionContactMember & { links: unknown; avatarUrl?: string };
const contactsSql = `select m.id, m.full_name as name, m.email, to_jsonb(u)->>'image' as "avatarUrl",
  coalesce(c.draft->'links', '[]'::jsonb) as links
  from identity.members m
  join project_management.department_members dm on dm.member_id=m.id and dm.access_level in ('member','lead')
  join project_management.departments d on d.id=dm.department_id and d.name='Management' and d.season=project_management.current_season()
  left join neon_auth."user" u on u.id=m.auth_user_id
  left join cv.documents c on c.member_id=m.id
  where ($1::uuid[] is null or m.id=any($1::uuid[]))
    and ((m.auth_user_id is null and m.google_sub is null) or
      (u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
       and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)))
  order by lower(m.full_name), m.id`;

function httpsUrl(value: unknown, linkedin = false): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (linkedin && url.hostname !== "linkedin.com" && !url.hostname.endsWith(".linkedin.com")) return;
    return url.href;
  } catch { return; }
}

export async function positionContactMembers(db: CvDatabase, ids?: string[]): Promise<PositionContactMember[]> {
  if (ids?.length === 0) return [];
  const { rows } = await db.query<ContactRow>(contactsSql, [ids ?? null]);
  return rows.map(row => {
    const links = Array.isArray(row.links) ? row.links : [];
    const linkedin = links.map(link => httpsUrl(link?.url, true)).find(Boolean);
    const avatarUrl = httpsUrl(row.avatarUrl);
    return { id: row.id, name: row.name, email: row.email, ...(avatarUrl ? { avatarUrl } : {}), ...(linkedin ? { linkedin } : {}) };
  });
}

export async function selectedPositionContact(db: CvDatabase, id: unknown) {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new MemberCvError(400, "Choose a Management member as the contact.");
  const member = (await positionContactMembers(db, [id]))[0];
  if (!member) throw new MemberCvError(400, "This contact is no longer in Management. Choose another member.");
  return member;
}
