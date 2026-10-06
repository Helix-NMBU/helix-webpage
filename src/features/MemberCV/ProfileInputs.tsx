import { useId, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
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
  months,
  profileDateParts,
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
  const validYear = /^\d{4}$/.test(parts.year);
  return (
    <div className="mcv-date-field">
      <Label htmlFor={`${id}-year`}>{label}</Label>
      {textMode ? (
        <Input
          id={`${id}-year`}
          disabled={disabled}
          maxLength={30}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <>
          <div className="mcv-date-controls">
            <Input
              id={`${id}-year`}
              disabled={disabled}
              inputMode="numeric"
              maxLength={4}
              placeholder={t("Year")}
              aria-label={`${label} · ${t("Year")}`}
              value={parts.year}
              onChange={(event) => {
                const year = event.target.value;
                if (/^\d{0,4}$/.test(year))
                  onChange(composeProfileDate(year, parts.month));
              }}
            />
            <Select
              value={parts.month || "__none"}
              disabled={disabled || !validYear}
              onValueChange={(next) => {
                const selected = next === "__none" ? "" : next;
                onChange(composeProfileDate(parts.year, selected));
              }}
            >
              <SelectTrigger
                className="mcv-profile-select"
                aria-label={`${label} · ${t("Month")}`}
              >
                <SelectValue placeholder={t("Month")} />
              </SelectTrigger>
              <SelectContent
                className="portal-root mcv-profile-menu"
                lang={locale}
              >
                <SelectItem value="__none">{t("Year only")}</SelectItem>
                {months.map((name, index) => (
                  <SelectItem
                    key={name}
                    value={String(index + 1).padStart(2, "0")}
                  >
                    {t(name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {parts.legacy && (
            <p className="mcv-date-note">
              {memberText(
                locale,
                "Current date: {date}. Enter a year to replace it.",
                { date: value },
              )}
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
        {textMode ? t("Use month and year") : t("Edit date as text")}
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
