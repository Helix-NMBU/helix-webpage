/** Numeric editing keeps missing components empty; other dates remain untouched. */
export function profileDateParts(value: string) {
  const match = /^(\d{0,4})(?:-(\d{0,2})(?:-(\d{0,2}))?)?$/.exec(value);
  if (!match) return { year: "", month: "", day: "", legacy: true };
  return {
    year: match[1],
    month: match[2] ?? "",
    day: match[3] ?? "",
    legacy: false,
  };
}

/** The persisted format stays YYYY, YYYY-MM or YYYY-MM-DD, with editing gaps retained. */
export function composeProfileDate(year: string, month: string, day = "") {
  if (day) return `${year}-${month}-${day}`;
  return month ? `${year}-${month}` : year;
}

export type ProfileDateValidation = "valid" | "partial" | "month" | "day" | "year";

/** Free-text legacy values are valid. Numeric partial input must not be autosaved. */
export function profileDateValidation(value: string): ProfileDateValidation {
  if (!value) return "valid";
  const { year, month, day, legacy } = profileDateParts(value);
  if (legacy) return "valid";
  if (month.length === 2 && (Number(month) < 1 || Number(month) > 12)) return "month";
  if (day.length === 2) {
    const leap = !year || year.length < 4 ||
      (Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0));
    const limit = month && Number(month) >= 1 && Number(month) <= 12
      ? [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1]
      : 31;
    if (Number(day) < 1 || Number(day) > limit) return "day";
  }
  if (year.length === 4 && Number(year) === 0) return "year";
  if (value !== composeProfileDate(year, month, day)) return "partial";
  if (year.length !== 4 || (month && month.length !== 2) ||
      (day && (day.length !== 2 || !month))) return "partial";
  return "valid";
}

/** Only complete numeric dates are displayed in European order; legacy text is unchanged. */
export function readableProfileDate(value: string) {
  const { year, month, day, legacy } = profileDateParts(value);
  if (legacy || profileDateValidation(value) !== "valid") return value;
  return [day, month, year].filter(Boolean).join(".");
}
