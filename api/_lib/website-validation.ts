import { MemberCvError } from "./member-cv-error.js";
import { isValidEmail } from "./email.js";

export const MAX_CV_BYTES = 500 * 1024;
// 500 KiB PDF becomes 683 KiB base64, leaving ample room for bounded fields.
export const MAX_BODY_BYTES = 768 * 1024;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type WebsitePosition = {
  id: string; title: string; department: string; applyUrl: string;
  contact: { name: string; email: string; linkedin?: string };
  about: string; tasks: string[]; achieve: string[];
};
export type ManagedWebsitePosition = WebsitePosition & { visible: boolean };
const POSITION_DEPARTMENTS = new Set(["Open", "Finance", "Mechanical & Production", "Electrical", "Software & Autonomous", "Business & Marketing", "Logistics"]);
export function parseWebsitePosition(value: unknown): WebsitePosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberCvError(400, "Check the position details.");
  const raw = value as Record<string, unknown>;
  const field = (key: string, max: number, required = true, multiline = false) => {
    const v = raw[key];
    if (v === undefined && !required) return undefined;
    if (typeof v !== "string" || (required && !v.trim()) || v.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u001f]/).test(v)) throw new MemberCvError(400, `Check the ${key} field.`);
    return v.trim();
  };
  const title = field("title", 160)!;
  const department = field("department", 100)!;
  if (!POSITION_DEPARTMENTS.has(department)) throw new MemberCvError(400, "Choose a valid department.");
  const about = field("about", 5000, true, true)!;
  function safeUrl(value: unknown, relative = false): string {
    if (value === undefined || value === "") return "";
    if (typeof value !== "string" || value.length > 2048 || /[\\\u0000-\u0020]/.test(value)) throw new MemberCvError(400, "Use a valid HTTPS application link.");
    if (relative && value.startsWith("/") && !value.startsWith("//")) return value;
    try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password) return value; } catch { /* handled below */ }
    throw new MemberCvError(400, "Use a valid HTTPS application link.");
  }
  const applyUrl = safeUrl(raw.applyUrl, true);
  const contactRaw = raw.contact;
  if (!contactRaw || typeof contactRaw !== "object" || Array.isArray(contactRaw)) throw new MemberCvError(400, "Check the contact details.");
  const contact = contactRaw as Record<string, unknown>;
  const contactName = typeof contact.name === "string" && contact.name.trim().length <= 160 ? contact.name.trim() : "";
  const contactEmail = typeof contact.email === "string" && contact.email.trim().length <= 254 ? contact.email.trim().toLowerCase() : "";
  if (!contactName || !isValidEmail(contactEmail)) throw new MemberCvError(400, "Check the contact details.");
  const linkedin = safeUrl(contact.linkedin);
  const list = (key: "tasks" | "achieve") => {
    const v = raw[key];
    if (!Array.isArray(v) || v.length > 20 || v.some(item => typeof item !== "string" || !item.trim() || item.length > 500)) throw new MemberCvError(400, `Check the ${key} list.`);
    return v.map(item => (item as string).trim());
  };
  const slug = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80).replace(/-$/, "");
  const id = typeof raw.id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id) ? raw.id : slug;
  if (!id) throw new MemberCvError(400, "Enter a valid position title.");
  return { id, title, department, about, applyUrl, contact: { name: contactName, email: contactEmail, ...(linkedin ? { linkedin: (linkedin as string).trim() } : {}) }, tasks: list("tasks"), achieve: list("achieve") };
}
export type ApplicationInput = {
  full_name: string; email: string; phone: string; study_program: string;
  study_program_other: string | null; year_of_study: number; motivation: string;
  position_id: string; position_title: string; interested_departments: string[]; consent: true;
};
export type ApplicationRow = Omit<ApplicationInput, "consent"> & {
  id: string; created_at: string; season: string; cv_path: string; photo_path: string | null; consent: boolean;
};

export function websiteBody(value: unknown): Record<string, unknown> {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new MemberCvError(413, "The application is too large. Use a PDF smaller than 500 KB.");
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new MemberCvError(400, "Invalid JSON request."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new MemberCvError(400, "Invalid request.");
  return body as Record<string, unknown>;
}
export function applicationId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new MemberCvError(400, "A valid application ID is required.");
  return value;
}
function text(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000]/.test(value)) {
    throw new MemberCvError(400, `Check the ${key.replace(/_/g, " ")} field.`);
  }
  return value.trim();
}
export function parseApplication(body: Record<string, unknown>, positions: WebsitePosition[]): ApplicationInput {
  if (body.consent !== true) throw new MemberCvError(400, "Consent is required to submit your application.");
  if (body.website) throw new MemberCvError(400, "Could not accept this application.");
  const position = positions.find(p => p.id === body.position_id);
  if (!position) throw new MemberCvError(400, "Choose an available position.");
  const email = text(body, "email", 254).toLowerCase();
  if (!isValidEmail(email)) throw new MemberCvError(400, "Enter a valid email address.");
  const phone = text(body, "phone", 40);
  if (!/^\+?[\d\s()-]{8,}$/.test(phone)) throw new MemberCvError(400, "Enter a valid phone number.");
  if (!Number.isInteger(body.year_of_study) || Number(body.year_of_study) < 1 || Number(body.year_of_study) > 5) {
    throw new MemberCvError(400, "Choose a study year between 1 and 5.");
  }
  const departments = body.interested_departments ?? [];
  const allowed = new Set(positions.map(p => p.department).filter(d => d !== "Open" && d !== position.department));
  if (!Array.isArray(departments) || departments.length > allowed.size || departments.some(d => typeof d !== "string" || !allowed.has(d))) {
    throw new MemberCvError(400, "Choose valid departments.");
  }
  const study = text(body, "study_program", 200);
  return {
    full_name: text(body, "full_name", 200), email, phone, study_program: study,
    study_program_other: study === "Not listed / other" ? text(body, "study_program_other", 200) : null,
    year_of_study: Number(body.year_of_study), motivation: text(body, "motivation", 250),
    position_id: position.id, position_title: position.title,
    interested_departments: [...new Set(departments)] as string[], consent: true,
  };
}
export function parseCv(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length > 4 * Math.ceil(MAX_CV_BYTES / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new MemberCvError(400, "Upload a PDF smaller than 500 KB.");
  }
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > MAX_CV_BYTES || bytes.toString("base64") !== value || bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw new MemberCvError(400, "Upload a PDF smaller than 500 KB.");
  }
  return bytes;
}
// Do not expose member CVs, other buckets or arbitrary keys, even if an
// application row is malformed.
export function isApplicationPath(row: Pick<ApplicationRow, "season" | "id">, path: string): boolean {
  return /^S\d{2}$/.test(row.season) && UUID_RE.test(row.id) && path.startsWith(`${row.season}/${row.id}/`)
    && !path.includes("..") && !/[\\\u0000-\u001f]/.test(path)
    && /^[A-Za-z0-9_./-]+$/.test(path);
}
