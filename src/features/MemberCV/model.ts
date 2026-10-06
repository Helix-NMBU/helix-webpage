import type { CvData, CvSharing } from "./types";

export function emptyCv(fullName = "", contactEmail = ""): CvData {
  return { fullName, contactEmail, phone: "", city: "", headline: "", summary: "", fieldOfStudy: "", graduationYear: "", education: [], experience: [], projects: [], skills: [], languages: [], links: [] };
}

export const privateSharing: CvSharing = { cv: false, email: false, phone: false };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CV data must be an object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, key: string, limit = 500): string {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Invalid ${key}.`);
  return value.trim();
}

function url(value: unknown): string {
  const result = text(value, "link", 2000);
  if (!result) return "";
  try {
    const parsed = new URL(result);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch { throw new Error("Links must be valid http or https URLs."); }
  return result;
}

function list<T>(value: unknown, key: string, parse: (item: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error(`Invalid ${key}. Use at most 30 entries.`);
  const ids = new Set<string>();
  return value.map((item) => {
    const row = object(item);
    const id = text(row.id, "entry ID", 100);
    if (!id || ids.has(id)) throw new Error(`Invalid ${key} entry ID.`);
    ids.add(id);
    return parse({ ...row, id });
  });
}

export function validateCvData(value: unknown, forPublication = false): CvData {
  const row = object(value);
  if (JSON.stringify(row).length > 100000) throw new Error("The CV is too large.");
  const result: CvData = {
    fullName: text(row.fullName, "name"), contactEmail: text(row.contactEmail, "email"),
    phone: text(row.phone, "phone", 100), city: text(row.city, "city"), headline: text(row.headline, "headline"),
    summary: text(row.summary, "summary", 8000), fieldOfStudy: text(row.fieldOfStudy, "field of study"), graduationYear: text(row.graduationYear, "graduation year", 4),
    education: list(row.education, "education", (e) => ({ id: String(e.id), institution: text(e.institution, "institution"), degree: text(e.degree, "degree"), startDate: text(e.startDate, "start date", 30), endDate: text(e.endDate, "end date", 30), description: text(e.description, "education description", 8000) })),
    experience: list(row.experience, "experience", (e) => ({ id: String(e.id), organization: text(e.organization, "organization"), title: text(e.title, "title"), startDate: text(e.startDate, "start date", 30), endDate: text(e.endDate, "end date", 30), description: text(e.description, "experience description", 8000) })),
    projects: list(row.projects, "projects", (e) => ({ id: String(e.id), name: text(e.name, "project name"), role: text(e.role, "role"), season: text(e.season, "season", 30), description: text(e.description, "project description", 8000), url: url(e.url) })),
    languages: list(row.languages, "languages", (e) => ({ id: String(e.id), name: text(e.name, "language", 100), level: text(e.level, "language level", 100) })),
    links: list(row.links, "links", (e) => ({ id: String(e.id), label: text(e.label, "link label", 100), url: url(e.url) })),
    skills: [],
  };
  if (!Array.isArray(row.skills) || row.skills.length > 50) throw new Error("Use at most 50 skills.");
  result.skills = row.skills.map((skill) => text(skill, "skill", 100)).filter(Boolean);
  if (result.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contactEmail)) throw new Error("Enter a valid contact email.");
  if (result.graduationYear && !/^(19|20|21)\d{2}$/.test(result.graduationYear)) throw new Error("Enter a four-digit graduation year.");
  if (forPublication && (!result.fullName || !result.education.some((e) => e.institution && e.degree))) throw new Error("Add your name and an education entry with institution and degree before publishing.");
  return result;
}

export function validateSharing(value: unknown): CvSharing {
  const row = object(value);
  if ([row.cv, row.email, row.phone].some((flag) => typeof flag !== "boolean")) throw new Error("Invalid sharing choices.");
  return { cv: row.cv as boolean, email: row.email as boolean, phone: row.phone as boolean };
}

export function sharedCvData(data: CvData, sharing: CvSharing): CvData {
  return { ...structuredClone(data), contactEmail: sharing.email ? data.contactEmail : "", phone: sharing.phone ? data.phone : "" };
}
