import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from "libphonenumber-js/min";

const names = new Intl.DisplayNames(["en"], { type: "region" });
export const phoneCountries = getCountries().map((country) => ({
  value: country,
  label: names.of(country) ?? country,
  detail: `+${getCountryCallingCode(country)}`,
  keywords: [country],
})).sort((a, b) => a.label.localeCompare(b.label, "en"));

export type ProfilePhone = { country: CountryCode; national: string; changed: boolean };

function countryForPhone(phone: PhoneNumber): CountryCode | undefined {
  return phone.country ?? (phone.countryCallingCode === getCountryCallingCode("NO") ? "NO"
    : getCountries().find((country) => getCountryCallingCode(country) === phone.countryCallingCode));
}

export function splitProfilePhone(value: string): ProfilePhone {
  const normalized = value.trim().replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(normalized, "NO");
  const country = parsed ? countryForPhone(parsed) : undefined;
  return {
    country: country ?? "NO",
    national: country && parsed ? String(parsed.nationalNumber) : value,
    changed: false,
  };
}

export function editProfilePhone(value: string, current: ProfilePhone): ProfilePhone {
  if (/^(\+|00)/.test(value.trim())) {
    const parsed = parsePhoneNumberFromString(value.trim().replace(/^00/, "+"));
    const country = parsed ? countryForPhone(parsed) : undefined;
    if (country && parsed?.isPossible()) return { country, national: String(parsed.nationalNumber), changed: true };
  }
  return { ...current, national: value, changed: true };
}

export function saveProfilePhone(phone: ProfilePhone, original: string): string {
  // Do not rewrite an existing number when only another profile field changed.
  if (!phone.changed) return original;
  if (!phone.national.trim()) return "";
  const parsed = parsePhoneNumberFromString(phone.national.trim().replace(/^00/, "+"), phone.country);
  if (!parsed?.isPossible()) throw new Error("Enter a valid phone number for the selected country.");
  return parsed.formatInternational();
}
