import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { memberText, type MemberLocale } from "./locale";

export function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: MemberLocale;
  onChange: (locale: MemberLocale) => void;
}) {
  return (
    <div className="mcv-language">
      <Select
        value={locale}
        onValueChange={(value) => {
          if (value === "nb" || value === "en") onChange(value);
        }}
      >
        <SelectTrigger
          className="mcv-language-trigger"
          aria-label={memberText(locale, "Choose Norwegian Bokmål or English")}
          lang={locale}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="portal-root mcv-language-menu" lang={locale}>
          <SelectItem value="nb" lang="nb" title="Norsk bokmål">
            Norsk
          </SelectItem>
          <SelectItem value="en" lang="en" title="English">
            English
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
