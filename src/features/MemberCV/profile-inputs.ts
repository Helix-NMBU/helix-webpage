export const employmentTypes = [
  "Full-time",
  "Part-time",
  "Self-employed",
  "Freelance",
  "Contract",
  "Internship",
  "Apprenticeship",
  "Seasonal",
] as const;
export const locationTypes = ["On-site", "Hybrid", "Remote"] as const;
export const languageLevels = [
  "Elementary proficiency",
  "Limited working proficiency",
  "Professional working proficiency",
  "Full professional proficiency",
  "Native or bilingual proficiency",
] as const;
export const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export {
  composeProfileDate,
  profileDateParts,
  profileDateValidation,
  readableProfileDate,
} from "./profile-dates.js";

export function currentPeriod(value: string, hasCurrentChoice = true) {
  return hasCurrentChoice && value === "Present";
}

/** Keeps the prior end date solely for an explicit reversal of the current-role choice. */
export function toggleCurrentPeriod(
  current: boolean,
  value: string,
  previous: string,
) {
  return current
    ? { value: "Present", previous: currentPeriod(value) ? previous : value }
    : { value: previous, previous };
}

/** UI option tokens never collide with saved custom values or become profile content. */
export function profileChoiceSelection(
  value: string,
  options: readonly string[],
  customMode: boolean,
) {
  if (customMode) return "custom-edit";
  if (!value) return "not-specified";
  return options.includes(value) ? `option:${value}` : "custom-current";
}
