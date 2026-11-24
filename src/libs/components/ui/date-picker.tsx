import { useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "@ui-sdk/react/calendar";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "@libs/lib/utils";

export function DatePicker({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = "Set date",
  className,
  onOpen,
  onError,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void | Promise<boolean | void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(value);
  const savingRef = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  async function choose(next: string | null) {
    if (disabled || savingRef.current) return;
    setSelected(next);
    setSaving(true);
    savingRef.current = true;
    try {
      if ((await onChange(next)) !== false) setOpen(false);
      else setSelected(value);
    } catch (error) {
      setSelected(value);
      onError?.(error);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next) {
          setSelected(value);
          onOpen?.();
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || saving}
          aria-label={label}
          className={cn(
            "h-auto min-h-6 justify-start px-1 py-0.5 text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {value
            ? new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(new Date(`${value}T12:00:00`))
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        align="start"
        className="w-72 p-3"
        aria-label={`${label} calendar`}
        onOpenAutoFocus={(event) => {
          const day = content.current?.querySelector<HTMLElement>(
            '[role="gridcell"][tabindex="0"]',
          );
          if (day) {
            event.preventDefault();
            day.focus();
          }
        }}
      >
        <Calendar
          aria-label={`${label} calendar`}
          value={selected}
          onValueChange={(next) => {
            if (typeof next === "string") void choose(next);
          }}
          locale="en-GB"
          weekStartsOn={1}
          fixedWeeks
          disabled={disabled || saving}
        >
          <div className="mb-2 flex items-center justify-between">
            <CalendarPrevious
              render={<Button type="button" variant="ghost" size="icon-xs" />}
              aria-label="Previous month"
            >
              <IconChevronLeft aria-hidden="true" />
            </CalendarPrevious>
            <CalendarHeading className="text-sm font-medium" />
            <CalendarNext
              render={<Button type="button" variant="ghost" size="icon-xs" />}
              aria-label="Next month"
            >
              <IconChevronRight aria-hidden="true" />
            </CalendarNext>
          </div>
          <CalendarGrid className="w-full table-fixed border-separate border-spacing-0.5 text-sm">
            <CalendarWeekdays>
              {(index) => (
                <CalendarWeekday
                  index={index}
                  className="h-8 text-xs font-normal text-muted-foreground"
                />
              )}
            </CalendarWeekdays>
            <CalendarWeeks>
              {(cell) => (
                <CalendarDay
                  value={cell.date}
                  className="h-8 cursor-pointer rounded-md p-0 text-center outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[today]:font-semibold data-[outside]:text-muted-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                />
              )}
            </CalendarWeeks>
          </CalendarGrid>
        </Calendar>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            disabled={disabled || saving}
            onClick={() => void choose(null)}
          >
            Clear date
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
