import { profileDateValidation } from "./profile-dates";
import { validateMutation } from "./repository";
import type { CvData, CvExperience, CvMutation } from "./types";

const dateErrors = {
  partial: "Complete the date before saving.",
  month: "Enter a month from 01 to 12.",
  day: "Enter a valid calendar day.",
  year: "Enter a four-digit year.",
} as const;

// An explicit transfer may carry unchanged legacy numeric dates into a new row.
// Match every mapped field and require removal of its source, so editing a date
// or any metadata cannot borrow this compatibility exception.
function isUnchangedProjectTransfer(row: CvExperience, draft: CvData, saved?: CvData): boolean {
  return saved?.projects.some((project) => {
    if (draft.projects.some((entry) => entry.id === project.id)) return false;
    const expected: CvExperience = {
      id: row.id, organization: "Helix NMBU", title: project.role,
      department: project.name, season: project.season, url: project.url,
      description: project.description, startDate: project.startDate ?? "", endDate: project.endDate ?? "",
    };
    const keys = Object.keys(expected) as (keyof CvExperience)[];
    return Object.keys(row).length === keys.length && keys.every((key) => row[key] === expected[key]);
  }) ?? false;
}

/** Old date text can remain unchanged; newly edited numeric dates must be complete. */
export function validateProfileMutation(mutation: CvMutation, saved?: CvData): CvMutation {
  if (mutation.draft) {
    for (const section of ["education", "experience", "projects"] as const) {
      for (const row of mutation.draft[section]) {
        const previous = saved?.[section].find((entry) => entry.id === row.id);
        if (section === "experience" && !previous && isUnchangedProjectTransfer(row as CvExperience, mutation.draft, saved)) continue;
        for (const key of ["startDate", "endDate"] as const) {
          const value = row[key] ?? "";
          if (previous && value === (previous[key] ?? "")) continue;
          const validation = profileDateValidation(value);
          if (validation !== "valid") throw new Error(dateErrors[validation]);
        }
      }
    }
  }
  return validateMutation(mutation);
}
