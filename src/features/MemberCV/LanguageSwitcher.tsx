import { memberText, type MemberLocale } from "./locale";

export function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: MemberLocale;
  onChange: (locale: MemberLocale) => void;
}) {
  return (
    <label className="mcv-language">
      <span className="sr-only">{memberText(locale, "Language")}</span>
      <select
        aria-label={memberText(locale, "Choose Norwegian Bokmål or English")}
        value={locale}
        onChange={(event) =>
          onChange(event.target.value === "nb" ? "nb" : "en")
        }
      >
        <option value="nb" lang="nb" title="Norsk bokmål">
          Norsk
        </option>
        <option value="en" lang="en" title="English">
          English
        </option>
      </select>
    </label>
  );
}
