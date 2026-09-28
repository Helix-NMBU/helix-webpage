import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@libs/components/ui/button";
import { cn } from "@libs/lib/utils";
import type { SponsorEvent } from "./sponsorEvents";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MAX_LISTED_EVENTS = 3;

const parseDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function initialMonth(events: SponsorEvent[]) {
  const today = dayKey(new Date());
  const next = [...events].sort((a, b) => a.date.localeCompare(b.date)).find((event) => event.date >= today);
  const base = next ? parseDate(next.date) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

export function EventsCalendar({ events, className }: { events: SponsorEvent[]; className?: string }) {
  const [month, setMonth] = useState(() => initialMonth(events));
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? selected;
  const today = dayKey(new Date());

  const eventDays = useMemo(() => new Set(events.map((event) => event.date)), [events]);
  const listedEvents = useMemo(() => {
    const monthStart = dayKey(month);
    return events
      .filter((event) => event.date >= monthStart)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, MAX_LISTED_EVENTS);
  }, [events, month]);

  const leadingBlanks = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1));
  // Always six week rows, so the component keeps the same height from month to month.
  const trailingBlanks = 42 - leadingBlanks - daysInMonth;

  const monthLabel = month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthName = month.toLocaleDateString("en-GB", { month: "long" });

  const shiftMonth = (delta: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
    setSelected(null);
  };
  const toggle = (key: string) => setSelected((current) => (current === key ? null : key));
  const selectEvent = (key: string) => {
    const date = parseDate(key);
    if (date.getFullYear() !== month.getFullYear() || date.getMonth() !== month.getMonth()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      setSelected(key);
      return;
    }
    toggle(key);
  };

  return (
    <div className={cn("@container", className)}>
    <div className="h-full overflow-hidden rounded-lg border bg-background @md:grid @md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="border-b p-4 @md:border-r @md:border-b-0">
        <div className="mb-3 flex h-8 items-center justify-between">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <span className="text-sm font-medium">{monthLabel}</span>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((weekday) => <span key={weekday} className="pb-1 text-xs text-muted-foreground">{weekday}</span>)}
          {Array.from({ length: leadingBlanks }, (_, index) => <span key={`blank-${index}`} />)}
          {days.map((date) => {
            const key = dayKey(date);
            const isToday = key === today;
            if (!eventDays.has(key)) {
              return <span key={key} className={cn("mx-auto flex size-8 items-center justify-center rounded-md text-sm", isToday && "ring-1 ring-border font-medium")}>{date.getDate()}</span>;
            }
            const isActive = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(key)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                aria-pressed={selected === key}
                aria-label={date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                className={cn(
                  "relative mx-auto flex size-8 items-center justify-center rounded-md text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20",
                )}
              >
                {date.getDate()}
                <span className={cn("absolute bottom-1 size-1 rounded-full", isActive ? "bg-primary-foreground" : "bg-primary")} />
              </button>
            );
          })}
          {Array.from({ length: trailingBlanks }, (_, index) => <span key={`trailing-${index}`} className="mx-auto size-8" />)}
        </div>
      </div>

      <div className="flex flex-col p-4">
        <div className="mb-3 flex h-8 items-center">
          <span className="text-sm font-medium">Upcoming from {monthName}</span>
        </div>
        {listedEvents.length ? (
          <ul className="grid flex-1 divide-y" style={{ gridTemplateRows: `repeat(${MAX_LISTED_EVENTS}, minmax(0, 1fr))` }}>
            {listedEvents.map((event) => {
              const date = parseDate(event.date);
              const isActive = active === event.date;
              return (
                <li key={event.id} className="flex">
                  <button
                    type="button"
                    onClick={() => selectEvent(event.date)}
                    onMouseEnter={() => setHovered(event.date)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn("flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-muted", isActive && "bg-muted")}
                  >
                    <div className={cn("flex w-14 shrink-0 flex-col items-center gap-1 rounded-lg border py-2 transition-colors", isActive && "border-primary bg-primary text-primary-foreground")}>
                      <span className="text-[11px] uppercase leading-none tracking-wide opacity-70">{date.toLocaleDateString("en-GB", { month: "short" })}</span>
                      <span className="text-2xl font-semibold leading-none">{date.getDate()}</span>
                    </div>
                    <div className="grid min-w-0 gap-1">
                      <p className="truncate text-base font-medium">{event.title}</p>
                      <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="shrink-0">{date.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                        <span aria-hidden>·</span>
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No upcoming events.</p>
        )}
      </div>
    </div>
    </div>
  );
}
