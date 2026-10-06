import { profileDateValidation } from "./profile-dates";
import { validateMutation } from "./repository";
import type { CvData, CvMutation } from "./types";

const dateErrors = {
  partial: "Complete the date before saving.",
  month: "Enter a month from 01 to 12.",
  day: "Enter a valid calendar day.",
  year: "Enter a four-digit year.",
} as const;

/** Old date text can remain unchanged; newly edited numeric dates must be complete. */
export function validateProfileMutation(mutation: CvMutation, saved?: CvData): CvMutation {
  if (mutation.draft) {
    for (const section of ["education", "experience", "projects"] as const) {
      for (const row of mutation.draft[section]) {
        const previous = saved?.[section].find((entry) => entry.id === row.id);
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
