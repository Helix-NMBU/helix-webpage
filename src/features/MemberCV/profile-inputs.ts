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

export function profileDateParts(value: string) {
  const match = /^(\d{0,4})(?:-(0[1-9]|1[0-2]))?$/.exec(value);
  if (!match) return { year: "", month: "", legacy: true };
  return { year: match[1], month: match[2] ?? "", legacy: false };
}

/** Partial year input is retained verbatim; months never fabricate a missing year. */
export function composeProfileDate(year: string, month: string) {
  return month ? `${year}-${month}` : year;
}

export function readableProfileDate(
  value: string,
  monthName: (index: number) => string,
) {
  const parts = profileDateParts(value);
  return !parts.legacy && parts.year.length === 4 && parts.month
    ? `${monthName(Number(parts.month) - 1)} ${parts.year}`
    : value;
}

export function currentPeriod(value: string) {
  return value === "Present";
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
