import type { CvData } from "../MemberCV/types.js";

export type SponsorDirectoryMember = {
  id: string;
  fullName: string;
  headline: string;
  programme: string | null;
  graduationYear: string | null;
  departments: string[];
  skills: string[];
  canViewCv: boolean;
  contactEmail?: string;
  phone?: string;
};

export type PublishedCvProfile = Pick<CvData,
  "fullName" | "headline" | "summary" | "city" | "fieldOfStudy" | "graduationYear"
  | "education" | "experience" | "projects" | "skills" | "languages" | "links" | "references"
> & { contactEmail?: string; phone?: string };

export type SponsorDirectoryResponse = {
  members: SponsorDirectoryMember[];
  filters: { programmes: string[]; years: string[]; departments: string[]; skills: string[] };
  total: number;
};
export type SponsorProfileResponse = { member: SponsorDirectoryMember; profile: PublishedCvProfile };
export type SponsorCvResponse = { url: string; expiresIn: number };
export type SponsorDirectoryRequest = <T>(action: string, options?: RequestInit & { query?: Record<string, string> }) => Promise<T>;

export function normalizeDirectoryValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** A department is published structured data, never inferred from a role title. */
export function publishedDepartments(profile: Pick<CvData, "experience">): string[] {
  return distinctDirectoryValues(profile.experience.flatMap((entry) =>
    ["helix", "helix nmbu"].includes(normalizeDirectoryValue(entry.organization)) && entry.department?.trim()
      ? [entry.department.trim()] : [],
  ));
}

export function distinctDirectoryValues(values: string[]): string[] {
  const normalized = new Map<string, string>();
  for (const value of values) {
    const clean = value.trim();
    if (clean) normalized.set(normalizeDirectoryValue(clean), normalized.get(normalizeDirectoryValue(clean)) ?? clean);
  }
  return [...normalized.values()].sort((a, b) => a.localeCompare(b, "en"));
}
