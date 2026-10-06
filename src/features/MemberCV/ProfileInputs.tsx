import { useId, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import {
  memberText,
  type MemberLocale,
  type StaticMemberCopyKey,
} from "./locale";
import {
  composeProfileDate,
  currentPeriod,
  profileDateParts,
  profileDateValidation,
  toggleCurrentPeriod,
  profileChoiceSelection,
} from "./profile-inputs";

export function ChoiceInput({
  label,
  value,
  onChange,
  options,
  locale,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly StaticMemberCopyKey[];
  locale: MemberLocale;
  disabled: boolean;
}) {
  const id = useId();
  const [customMode, setCustomMode] = useState(false);
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
  const custom = Boolean(
    value && !options.includes(value as StaticMemberCopyKey),
  );
  return (
    <div className="mcv-field">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={profileChoiceSelection(value, options, customMode)}
        disabled={disabled}
        onValueChange={(next) => {
          if (next === "custom-edit") setCustomMode(true);
          else {
            setCustomMode(false);
            if (next !== "custom-current")
              onChange(
                next === "not-specified" ? "" : next.slice("option:".length),
              );
          }
        }}
      >
        <SelectTrigger
          id={id}
          className="mcv-profile-select"
          aria-label={label}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="portal-root mcv-profile-menu" lang={locale}>
          <SelectItem value="not-specified">{t("Not specified")}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={`option:${option}`}>
              {t(option)}
            </SelectItem>
          ))}
          {custom && <SelectItem value="custom-current">{value}</SelectItem>}
          <SelectItem value="custom-edit">{t("Use my own wording")}</SelectItem>
        </SelectContent>
      </Select>
      {(custom || customMode) && (
        <Input
          disabled={disabled}
          maxLength={100}
          value={value}
          aria-label={`${label} · ${t("Your own wording")}`}
          placeholder={t("Your own wording")}
          onChange={(event) => {
            setCustomMode(true);
            onChange(event.target.value);
          }}
        />
      )}
    </div>
  );
}

export function OptionalGradeInput({
  value,
  onChange,
  locale,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: MemberLocale;
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(Boolean(value));
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
  return (
    <Collapsible className="mcv-optional-grade" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" type="button" disabled={disabled}>
          {t("Grade (optional)")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent forceMount className="mcv-optional-grade-content">
        <Label htmlFor={id}>{t("Grade")}</Label>
        <Input
          id={id}
          value={value}
          maxLength={100}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function DateInput({
  label,
  value,
  onChange,
  locale,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale: MemberLocale;
  disabled: boolean;
}) {
  const id = useId();
  const parts = profileDateParts(value);
  const [textMode, setTextMode] = useState(parts.legacy);
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
  const validation = profileDateValidation(value);
  const invalid =
    !parts.legacy && validation !== "valid" && validation !== "partial";
  const error =
    validation === "month"
      ? t("Enter a month from 01 to 12.")
      : validation === "day"
        ? t("Enter a valid calendar day.")
        : validation === "year"
          ? t("Enter a four-digit year.")
          : "";
  function changePart(key: "year" | "month" | "day", next: string) {
    const nextParts = { ...parts, [key]: next };
    onChange(composeProfileDate(nextParts.year, nextParts.month, nextParts.day));
  }
  return (
    <div className="mcv-date-field">
      <Label htmlFor={`${id}-${textMode ? "text" : "day"}`}>{label}</Label>
      {textMode ? (
        <Input
          id={`${id}-text`}
          disabled={disabled}
          maxLength={30}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <>
          <div className="mcv-date-controls">
            {(["day", "month", "year"] as const).map((key) => (
              <Input
                key={key}
                id={`${id}-${key}`}
                disabled={disabled}
                inputMode="numeric"
                maxLength={key === "year" ? 4 : 2}
                placeholder={key === "day" ? "DD" : key === "month" ? "MM" : "YYYY"}
                aria-label={`${label} · ${t(key === "day" ? "Day (optional)" : key === "month" ? "Month" : "Year")}`}
                aria-invalid={invalid && validation === key ? true : undefined}
                aria-describedby={`${id}-note${invalid ? ` ${id}-error` : ""}`}
                value={parts[key]}
                onChange={(event) => {
                  const next = event.target.value;
                  if ((key === "year" ? /^\d{0,4}$/ : /^\d{0,2}$/).test(next))
                    changePart(key, next);
                }}
                onBlur={() => {
                  if (
                    key !== "year" &&
                    /^\d$/.test(parts[key]) &&
                    parts[key] !== "0"
                  )
                    changePart(key, parts[key].padStart(2, "0"));
                }}
              />
            ))}
          </div>
          <p id={`${id}-note`} className="mcv-date-note">
            {parts.legacy
              ? memberText(locale, "Current date: {date}. Enter a year to replace it.", { date: value })
              : t("Day is optional. Use day, month, year.")}
          </p>
          {invalid && (
            <p id={`${id}-error`} className="mcv-date-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
      <Button
        className="mcv-date-mode"
        variant="ghost"
        type="button"
        disabled={disabled}
        onClick={() => setTextMode((current) => !current)}
      >
        {textMode ? t("Use numeric date") : t("Edit date as text")}
      </Button>
    </div>
  );
}

export function PeriodInputs({
  startDate,
  endDate,
  onChange,
  ongoingLabel,
  locale,
  disabled,
}: {
  startDate: string;
  endDate: string;
  onChange: (key: "startDate" | "endDate", value: string) => void;
  ongoingLabel?: string;
  locale: MemberLocale;
  disabled: boolean;
}) {
  const id = useId();
  const previous = useRef(currentPeriod(endDate) ? "" : endDate);
  const t = (key: StaticMemberCopyKey) => memberText(locale, key);
  const ongoing = currentPeriod(endDate, Boolean(ongoingLabel));
  return (
    <div className="mcv-period mcv-full">
      {ongoingLabel && (
        <div className="mcv-checkbox mcv-current-choice">
          <Checkbox
            id={id}
            checked={ongoing}
            disabled={disabled}
            onCheckedChange={(checked) => {
              const next = toggleCurrentPeriod(
                checked === true,
                endDate,
                previous.current,
              );
              previous.current = next.previous;
              onChange("endDate", next.value);
            }}
          />
          <Label htmlFor={id}>{ongoingLabel}</Label>
        </div>
      )}
      <div className="mcv-grid">
        <DateInput
          label={t("Start date")}
          value={startDate}
          onChange={(value) => onChange("startDate", value)}
          locale={locale}
          disabled={disabled}
        />
        {!ongoing && (
          <DateInput
            label={ongoingLabel ? t("End date") : t("End or expected end")}
            value={endDate}
            onChange={(value) => onChange("endDate", value)}
            locale={locale}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
