import { useState } from "react";
import { IconCalendar } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { formatDate, osloDate, shortDate } from "./model";
import { ProjectCalendar, projectCalendarMonth } from "./ProjectCalendar";

/** Shared date field for project and season planning. */
export function ProjectDatePicker({
  id,
  label,
  value,
  onChange,
  minimum = "2000-01-01",
  maximum = "2100-12-31",
  disabled = false,
  required = false,
  inline = false,
  showYear = false,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  minimum?: string;
  maximum?: string;
  disabled?: boolean;
  required?: boolean;
  inline?: boolean;
  showYear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initialMonth = projectCalendarMonth(value ?? osloDate(), minimum, maximum);
  const [month, setMonth] = useState(initialMonth);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled) {
          setOpen(next);
          if (next) setMonth(initialMonth);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={inline ? "ghost" : "outline"}
          disabled={disabled}
          aria-label={label}
          aria-description={value ? formatDate(value) : undefined}
          className={inline ? "-mx-2 h-8 gap-2 px-2 font-normal" : "h-8 gap-2 rounded-full bg-muted/40 px-3 font-normal shadow-none"}
        >
          <IconCalendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {value ? (showYear ? formatDate(value) : shortDate(value)) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-80 gap-2 overflow-y-auto overscroll-contain p-3"
        aria-label={`${label} calendar`}
      >
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          type="date"
          min={minimum}
          max={maximum}
          value={value ?? ""}
          disabled={disabled}
          required={required}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next || null);
            if (next) setMonth(projectCalendarMonth(next, minimum, maximum));
          }}
        />
        <ProjectCalendar
          value={value}
          onSelect={(date) => {
            onChange(date);
            setOpen(false);
          }}
          month={month}
          onMonthChange={setMonth}
          minimum={minimum}
          maximum={maximum}
          disabled={disabled}
        />
        <div className="flex justify-between border-t pt-2">
          {!required ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || !value}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              {"Clear date"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" disabled={disabled} onClick={() => setOpen(false)}>
            {"Done"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
