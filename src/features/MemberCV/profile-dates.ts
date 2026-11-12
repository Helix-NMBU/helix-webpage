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

/** One editing field; keep the stored ISO format and older date precision. */
export function profileDateInputValue(value: string) {
  const { year, month, day, legacy } = profileDateParts(value);
  if (legacy || !value || year.length !== 4) return value;
  if (!month && !day && year.length === 4) return year;
  if (month && !day && year.length === 4) return `${month}/${year}`;
  return `${day}/${month}/${year}`;
}

export function profileDateFromInput(value: string) {
  if (!value) return "";
  const full = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (full) return composeProfileDate(full[3], full[2].padStart(2, "0"), full[1].padStart(2, "0"));
  // Preserve in-progress typing verbatim; validation prevents saving it.
  return value;
}

/** Format completed input only when its day and month have one valid interpretation. */
export function formatProfileDateInput(value: string): string {
  const compact = /^(\d{2,4})(\d{4})$/.exec(value);
  if (!compact) return profileDateInputValue(profileDateFromInput(value));

  const [, dayAndMonth, year] = compact;
  const candidates = [1, 2].flatMap(dayLength => {
    const day = dayAndMonth.slice(0, dayLength);
    const month = dayAndMonth.slice(dayLength);
    if (month.length < 1 || month.length > 2) return [];
    const date = composeProfileDate(year, month.padStart(2, "0"), day.padStart(2, "0"));
    return profileDateValidation(date) === "valid" ? [date] : [];
  });
  return candidates.length === 1 ? profileDateInputValue(candidates[0]) : value;
}

/** Free-text legacy values are valid. Numeric partial input must not be autosaved. */
export function profileDateValidation(value: string): ProfileDateValidation {
  if (!value) return "valid";
  if (value.includes("/")) {
    if (/^\d{2}\/\d{4}$/.test(value)) {
      const [month, year] = value.split("/");
      return profileDateValidation(`${year}-${month}`);
    }
    const parsed = profileDateFromInput(value);
    if (parsed !== value) return profileDateValidation(parsed);
    if (/^[\d/]+$/.test(value) && !/^\d{4}\/\d{4}$/.test(value)) return "partial";
  }
  if (/^\d{5,}$/.test(value)) return "partial";
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
