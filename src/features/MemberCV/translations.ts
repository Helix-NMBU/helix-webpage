import { englishCopy, memberText, type StaticMemberCopyKey } from "./locale.js";
import type { CvData, CvOutputLanguage, CvTranslations } from "./types.js";

const rootFields = ["city", "headline", "summary", "fieldOfStudy", "references"] as const;
const rowFields = {
  education: ["institution", "degree", "fieldOfStudy", "grade", "activities", "description"],
  experience: ["organization", "title", "description", "employmentType", "location", "locationType", "department", "season"],
  projects: ["name", "role", "season", "description"],
  languages: ["name", "level"],
  links: ["label"],
} as const;

export function translationFields(data: CvData): Map<string, { value: string; limit: number }> {
  const paths = new Map<string, { value: string; limit: number }>();
  for (const field of rootFields) paths.set(field, { value: data[field] ?? "", limit: field === "summary" ? 8000 : field === "references" ? 2000 : 500 });
  for (const [section, fields] of Object.entries(rowFields)) {
    for (const row of data[section as keyof typeof rowFields]) {
      for (const field of fields) paths.set(`${section}:${row.id}:${field}`, {
        value: (row as Record<string, string>)[field] ?? "",
        limit: field === "description" || field === "activities" ? 8000 : field === "season" ? 30 : ["grade", "employmentType", "locationType", "level"].includes(field) || section === "languages" || section === "links" ? 100 : 500,
      });
    }
  }
  data.skills.forEach((value, index) => paths.set(`skills:${index}`, { value, limit: 100 }));
  return paths;
}

export function validateTranslations(value: unknown, data: CvData): CvTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid CV data.");
  const allowed = translationFields(data);
  const result: CvTranslations = {};
  for (const [language, entries] of Object.entries(value)) {
    if (!["en", "nb"].includes(language) || !entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Invalid CV data.");
    const translated: Record<string, string> = {};
    for (const [path, text] of Object.entries(entries)) {
      // Only authored, translatable fields are allowed. Never contact/sharing/role fields.
      const field = allowed.get(path);
      if (!field) continue; // Removed rows may still have old translation keys.
      if (typeof text !== "string" || text.length > field.limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("Invalid CV data.");
      if (text.trim()) translated[path] = text.trim();
    }
    result[language as CvOutputLanguage] = translated;
  }
  return result;
}

export function standardCvText(value: string | undefined, language: CvOutputLanguage): string {
  if (!value) return "";
  if (Object.prototype.hasOwnProperty.call(englishCopy, value)) return memberText(language, value as StaticMemberCopyKey);
  return value;
}

export function localizedCv(data: CvData, language: CvOutputLanguage): CvData {
  const result = structuredClone(data);
  const translations = language === (data.cvLanguage ?? "en") ? {} : data.translations?.[language] ?? {};
  const allowed = translationFields(data);
  for (const field of rootFields) if (allowed.has(field) && translations[field]?.trim()) result[field] = translations[field];
  for (const [section, fields] of Object.entries(rowFields)) {
    const rows = result[section as keyof typeof rowFields];
    for (const row of rows) for (const field of fields) {
      const key = `${section}:${row.id}:${field}`;
      if (translations[key]?.trim()) (row as Record<string, string>)[field] = translations[key];
    }
  }
  result.skills = result.skills.map((value, index) => translations[`skills:${index}`]?.trim() || value);
  for (const row of result.experience) {
    row.employmentType = standardCvText(row.employmentType, language);
    row.locationType = standardCvText(row.locationType, language);
  }
  for (const row of result.languages) row.level = standardCvText(row.level, language);
  return result;
}

export function changeCvLanguage(data: CvData, language: CvOutputLanguage): CvData {
  const previous = data.cvLanguage ?? "en";
  if (previous === language) return { ...data, cvLanguage: language };
  const result = localizedCv(data, language);
  result.cvLanguage = language;
  result.translations = { ...data.translations, [previous]: Object.fromEntries([...translationFields(data)].map(([key, item]) => [key, item.value])) };
  delete result.translations[language];
  return result;
}

export function hasRegisteredCv(data: CvData): boolean {
  if (data.cvRegistered !== undefined) return data.cvRegistered;
  return Boolean(data.headline.trim() || data.summary.trim() || data.references?.trim() || data.education.length || data.experience.length || data.projects.length || data.skills.length || data.languages.length || data.links.length);
}
