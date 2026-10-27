import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { addDays, formatDate, osloDate } from "./model";

const dayDate = (value: string) => new Date(`${value}T12:00:00Z`);
const monthLabel = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function shiftMonth(date: string, offset: number) {
  const value = dayDate(date),
    day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + offset);
  value.setUTCDate(
    Math.min(
      day,
      new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate(),
    ),
  );
  return value.toISOString().slice(0, 10);
}

/** Shared date field for the project composer and its initial milestone drafts. */
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
}) {
  const [open, setOpen] = useState(false);
  const today = osloDate();
  const clamp = (date: string) => (date < minimum ? minimum : date > maximum ? maximum : date);
  const initial = clamp(value ?? today);
  const [month, setMonth] = useState(`${initial.slice(0, 7)}-01`);
  const [focusedDay, setFocusedDay] = useState(initial);
  const grid = useRef<HTMLTableElement>(null);
  const focusCalendar = useRef(false);
  useEffect(() => {
    if (focusCalendar.current) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusedDay}"]`)?.focus();
      focusCalendar.current = false;
    }
  }, [focusedDay]);
  function navigate(date: string, focus = false) {
    const next = clamp(date);
    focusCalendar.current = focus;
    setFocusedDay(next);
    setMonth(`${next.slice(0, 7)}-01`);
  }
  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    let next: string;
    if (offset !== undefined) next = addDays(date, offset);
    else if (event.key === "Home") next = addDays(date, -dayDate(date).getUTCDay());
    else if (event.key === "End") next = addDays(date, 6 - dayDate(date).getUTCDay());
    else if (["PageUp", "PageDown"].includes(event.key))
      next = shiftMonth(date, event.key === "PageUp" ? -1 : 1);
    else return;
    event.preventDefault();
    navigate(next, true);
  }
  const start = addDays(month, -dayDate(month).getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled) {
          setOpen(next);
          if (next) navigate(initial);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={inline ? "ghost" : "outline"}
          disabled={disabled}
          aria-label={label}
          className={inline ? "-mx-2 h-8 gap-2 px-2 font-normal" : "h-8 gap-2 rounded-full bg-muted/40 px-3 font-normal shadow-none"}
        >
          <IconCalendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {value ? shortDate.format(dayDate(value)) : label}
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
            if (next) navigate(next);
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-sm" aria-live="polite">
            {monthLabel.format(dayDate(month))}
          </span>
          <div className="flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              disabled={disabled || month.slice(0, 7) <= minimum.slice(0, 7)}
              onClick={() => navigate(shiftMonth(month, -1))}
            >
              <IconChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              disabled={disabled || month.slice(0, 7) >= maximum.slice(0, 7)}
              onClick={() => navigate(shiftMonth(month, 1))}
            >
              <IconChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        <table
          ref={grid}
          role="grid"
          aria-label={monthLabel.format(dayDate(month))}
          className="w-full table-fixed text-center text-xs"
        >
          <thead>
            <tr>
              {weekdays.map((day) => (
                <th
                  key={day}
                  scope="col"
                  abbr={day}
                  className="pb-2 font-normal text-muted-foreground"
                >
                  {day.slice(0, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, week) => (
              <tr key={week}>
                {days.slice(week * 7, week * 7 + 7).map((date) => (
                  <td key={date} role="gridcell" aria-selected={value === date} className="p-0.5">
                    <Button
                      type="button"
                      variant={value === date ? "default" : "ghost"}
                      size="icon-sm"
                      data-day={date}
                      className={`size-8 rounded-full text-xs ${date.slice(0, 7) !== month.slice(0, 7) ? "text-muted-foreground" : ""} ${date === today && value !== date ? "ring-1 ring-border" : ""}`}
                      aria-label={formatDate(date)}
                      aria-current={date === today ? "date" : undefined}
                      disabled={disabled || date < minimum || date > maximum}
                      tabIndex={date === focusedDay ? 0 : -1}
                      onKeyDown={(event) => dayKey(event, date)}
                      onClick={() => {
                        onChange(date);
                        setOpen(false);
                      }}
                    >
                      {dayDate(date).getUTCDate()}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
              Clear date
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" disabled={disabled} onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
