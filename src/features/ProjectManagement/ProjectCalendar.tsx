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
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { cn } from "@libs/lib/utils";
import { formatDate, osloDate } from "./model";

export function projectCalendarMonth(date: string, minimum: string, maximum: string) {
  return (date < minimum ? minimum : date > maximum ? maximum : date).slice(0, 7);
}

export function ProjectCalendar({ value, onSelect, month, onMonthChange, minimum, maximum, disabled, variant = "project" }: {
  value: string | null;
  onSelect: (date: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
  minimum: string;
  maximum: string;
  disabled: boolean;
  variant?: "project" | "milestone";
}) {
  const milestone = variant === "milestone";
  const navigationButton = <Button type="button" variant="ghost" size={milestone ? "icon" : "icon-sm"} className={milestone ? "size-7" : undefined} />;

  return (
    <Calendar
      className={cn("flex flex-col", milestone ? "gap-3" : "gap-2")}
      locale="en-GB"
      weekStartsOn={0}
      fixedWeeks
      today={osloDate()}
      min={minimum}
      max={maximum}
      disabled={disabled}
      value={value}
      month={month}
      onMonthChange={onMonthChange}
      // A click on the current date is still a selection for the project popover.
      deselectable
      onValueChange={(next) => {
        const date = next ?? value;
        if (typeof date === "string") onSelect(date);
      }}
    >
      <div className="flex items-center justify-between">
        <CalendarHeading render={<span />} className="text-sm" />
        <div className="flex">
          <CalendarPrevious render={navigationButton} aria-label="Previous month">
            <IconChevronLeft className="size-4" aria-hidden="true" />
          </CalendarPrevious>
          <CalendarNext render={navigationButton} aria-label="Next month">
            <IconChevronRight className="size-4" aria-hidden="true" />
          </CalendarNext>
        </div>
      </div>
      <CalendarGrid className="w-full table-fixed text-center text-xs">
        <CalendarWeekdays>
          {(index) => (
            <CalendarWeekday index={index} className="pb-2 font-normal text-muted-foreground">
              {({ name }) => name.slice(0, 2)}
            </CalendarWeekday>
          )}
        </CalendarWeekdays>
        <CalendarWeeks>
          {({ date }) => (
            <CalendarDay
              value={date}
              render={(props, { selected, outside, today, disabled: dayDisabled }) => (
                <td role="presentation" className="p-0.5">
                  <Button
                    {...props}
                    type="button"
                    variant={selected ? "default" : "ghost"}
                    size={milestone ? "icon" : "icon-sm"}
                    className={cn("size-8 rounded-full text-xs", outside && "text-muted-foreground", today && !selected && "ring-1 ring-border")}
                    data-day={date}
                    aria-label={formatDate(date)}
                    disabled={dayDisabled}
                  />
                </td>
              )}
            />
          )}
        </CalendarWeeks>
      </CalendarGrid>
    </Calendar>
  );
}
