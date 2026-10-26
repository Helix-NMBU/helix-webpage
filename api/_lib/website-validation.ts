import { MemberCvError } from "./member-cv-error.js";
import { isValidEmail } from "./email.js";

export const MAX_CV_BYTES = 500 * 1024;
// 500 KiB PDF becomes 683 KiB base64, leaving ample room for bounded fields.
export const MAX_BODY_BYTES = 768 * 1024;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type WebsitePosition = {
  id: string; title: string; department: string; applyUrl: string;
  contact: { name: string; email: string; linkedin?: string };
  about: string; tasks: string[]; achieve: string[]; visible: boolean;
};
export function positionId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) throw new MemberCvError(400, "A valid position ID is required.");
  return value;
}
export function parsePosition(value: unknown, id: string): WebsitePosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberCvError(400, "Check the position fields.");
  const body = value as Record<string, unknown>;
  const contact = body.contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) throw new MemberCvError(400, "Check the contact fields.");
  const details = contact as Record<string, unknown>;
  const email = text(details, "email", 254).toLowerCase();
  if (!isValidEmail(email)) throw new MemberCvError(400, "Enter a valid contact email.");
  function url(input: unknown, relative = false): string {
    if (input === undefined || input === "") return "";
    if (typeof input !== "string" || input.length > 2048 || /[\\\u0000-\u0020]/.test(input)) throw new MemberCvError(400, "Enter a valid position URL.");
    if (relative && input.startsWith("/") && !input.startsWith("//")) return input;
    try { const parsed = new URL(input); if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) return input; } catch { /* handled below */ }
    throw new MemberCvError(400, "Enter an HTTP or HTTPS URL.");
  }
  function lines(key: string): string[] {
    const values = body[key];
    if (!Array.isArray(values) || values.length > 50 || values.some(item => typeof item !== "string" || !item.trim() || item.length > 1000 || /[\u0000]/.test(item))) throw new MemberCvError(400, `Check the ${key} field.`);
    return values.map(item => (item as string).trim());
  }
  if (body.visible !== undefined && typeof body.visible !== "boolean") throw new MemberCvError(400, "Check the public visibility field.");
  const linkedin = url(details.linkedin);
  return { id: positionId(id), title: text(body, "title", 200), department: text(body, "department", 100),
    applyUrl: url(body.applyUrl, true), contact: { name: text(details, "name", 200), email, ...(linkedin ? { linkedin } : {}) },
    about: text(body, "about", 10000), tasks: lines("tasks"), achieve: lines("achieve"), visible: body.visible === true };
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
