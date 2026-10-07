import { profileDateValidation } from "./profile-dates";
import { validateMutation } from "./repository";
import { projectRoleSourceId, projectRoleToExperience } from "./experience";
import type { CvData, CvExperience, CvMutation } from "./types";

const dateErrors = {
  partial: "Complete the date before saving.",
  month: "Enter a month from 01 to 12.",
  day: "Enter a valid calendar day.",
  year: "Enter a four-digit year.",
} as const;

// Only an explicitly selected, removed source can supply a new role's date
// baseline. Non-date edits do not remove that baseline before the first save.
function transferredProjectBaseline(row: CvExperience, draft: CvData, saved?: CvData): CvExperience | undefined {
  const sourceId = projectRoleSourceId(row);
  if (!sourceId || draft.projects.some((entry) => entry.id === sourceId)) return undefined;
  if (draft.experience.filter((entry) => projectRoleSourceId(entry) === sourceId).length !== 1) return undefined;
  const source = saved?.projects.find((project) => project.id === sourceId);
  return source ? projectRoleToExperience(source, row.id) : undefined;
}

/** Old date text can remain unchanged; newly edited numeric dates must be complete. */
export function validateProfileMutation(mutation: CvMutation, saved?: CvData): CvMutation {
  if (mutation.draft) {
    for (const section of ["education", "experience", "projects"] as const) {
      for (const row of mutation.draft[section]) {
        const previous = saved?.[section].find((entry) => entry.id === row.id)
          ?? (section === "experience" ? transferredProjectBaseline(row as CvExperience, mutation.draft, saved) : undefined);
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
