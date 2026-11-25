import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { IconCube, IconDiamonds, IconFilter2 } from "@tabler/icons-react";
import { EmptyIllustration } from "../MemberPlatform/EmptyIllustration";
import { Card, CardContent } from "@libs/components/ui/card";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { formatDate, osloDate, shortDate, summarize } from "./model";
import { isOrganized } from "./hierarchy";
import { progressSeries, progressStepPath } from "./progress";
import { chartDay, progressChartRange, progressLabelAngle, progressLabelLayout, seasonChartRange } from "./progress-chart";
import { ProgressRing } from "./ProgressRing";
import { TaskStatusIndicator } from "./TaskStatus";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { AssigneeAvatars } from "./TaskAssignees";
import { PriorityIndicator, TargetDate } from "./MilestoneTableControls";
import { OverviewColumnMenu, OVERVIEW_PROJECT_COLUMNS } from "./OverviewColumnMenu";
import { SeasonSchedule, SeasonScheduleActions } from "./SeasonSchedule";
import { type ProjectMutation, type ProjectWorkspace } from "./types";

const series = [
  { key: "scope", label: "Scoped", description: "All non-cancelled tasks, excluding milestones", color: "var(--muted-foreground)" },
  { key: "started", label: "Started", description: "In progress, blocked and completed tasks", color: "var(--progress-started)" },
  { key: "completed", label: "Completed", description: "Tasks marked Done", color: "var(--progress-completed)" },
] as const;

const eventLabels = {
  "season-start": "Season start",
  kickoff: "Season kickoff",
  "draft-concept": "Draft Concept Review",
  concept: "Concept Event",
  design: "Design Event",
  "production-start": "Construction start",
  "car-unveiling": "Car Unveiling",
  "competition-start": "Competition start",
  "season-end": "Season End",
} as const;
type SeasonEvent = keyof typeof eventLabels;
type ChartEvent = { value: SeasonEvent; label: string; date: string };
type AxisLabel = { value: SeasonEvent | "today"; label: string; date?: string; position: number };

function ProgressEventAxis({ labels, endEventId, children }: { labels: AxisLabel[]; endEventId?: SeasonEvent; children: ReactNode }) {
  const axisRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof progressLabelLayout>>();

  useLayoutEffect(() => {
    const axis = axisRef.current;
    if (!axis || !labels.length) return;
    const elements = [...axis.querySelectorAll<HTMLElement>("[data-axis-label]")];
    const measure = () => {
      const axisWidth = axis.getBoundingClientRect().width;
      if (axisWidth === 0) return;
      const next = progressLabelLayout(axisWidth, labels.map((label, index) => ({
        center: label.position * axisWidth,
        dateWidth: (elements[index].firstElementChild as HTMLElement).offsetWidth,
        nameWidth: (elements[index].lastElementChild as HTMLElement).offsetWidth,
      })));
      setLayout(previous => previous?.nameHeight === next.nameHeight && previous.anchors.length === next.anchors.length
        && next.anchors.every((anchor, index) => previous.anchors[index] === anchor)
        ? previous : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(axis);
    elements.forEach(element => {
      for (const child of element.children) observer.observe(child);
    });
    return () => observer.disconnect();
  }, [labels]);

  if (!labels.length) return children;
  const nameHeight = layout?.nameHeight ?? 112;
  return <div ref={axisRef} className="relative pt-4" style={{ paddingBottom: nameHeight }}>
    {children}
    {labels.map(({ value, label, date, position }, index) => <span
        key={value}
        className={`pointer-events-none absolute inset-y-0 whitespace-nowrap text-[10px] leading-4 ${value === endEventId ? "text-destructive" : date ? "text-foreground" : "text-muted-foreground"}`}
        title={date ? `${label}: ${formatDate(date)}` : undefined}
        data-axis-label=""
        data-event-label={date ? value : undefined}
        style={{ left: layout?.anchors[index] ?? `${position * 100}%` }}
      >
        {date ? <time className="pointer-events-auto absolute top-0 w-max -translate-x-1/2" dateTime={date}>{shortDate(date)}</time> : <span />}
        <span
          className="pointer-events-auto absolute left-0 w-max origin-left"
          style={{ top: `calc(100% - ${nameHeight - 4}px)`, transform: `rotate(${progressLabelAngle}deg)` }}
        >{label}</span>
      </span>)}
  </div>;
}

function seasonChartEvents(workspace: ProjectWorkspace, { startDate, endDate }: ReturnType<typeof seasonChartRange>) {
  const dates: Partial<Record<SeasonEvent, string | null>> = { "season-start": startDate, "season-end": endDate };
  if (workspace.seasonSchedule) {
    const phases = new Map(workspace.seasonSchedule.phases.map(phase => [phase.id, phase]));
    Object.assign(dates, {
      kickoff: phases.get("recruitment")?.endDate,
      "draft-concept": phases.get("draft-concept")?.endDate,
      concept: phases.get("concept")?.endDate,
      design: phases.get("design")?.endDate,
      "production-start": phases.get("construction")?.startDate,
      "car-unveiling": phases.get("construction")?.endDate,
      "competition-start": phases.get("test")?.endDate,
    });
  }
  return (Object.keys(eventLabels) as SeasonEvent[]).flatMap(value => {
    const date = dates[value];
    return date ? [{ value, label: eventLabels[value], date }] : [];
  });
}

export function ProgressChart({ workspace, compact = true, deadline = null, startDate = null, endDate = null, showDeadlineTail = false, events = [], visibleEventIds = [], startEventId, endEventId, deadlineLabel = "Deadline", footerLabels, heightClassName }: {
  workspace: ProjectWorkspace;
  compact?: boolean;
  heightClassName?: string;
  deadline?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  showDeadlineTail?: boolean;
  events?: ChartEvent[];
  visibleEventIds?: string[];
  startEventId?: SeasonEvent;
  endEventId?: SeasonEvent;
  deadlineLabel?: string;
  footerLabels?: { start: string; end: string };
}) {
  const chartId = useId().replace(/:/g, "");
  const deadlinePatternId = `${chartId}-deadline`;
  const scopeLineGradientId = `${chartId}-scope-line-gradient`;
  const scopeAreaGradientId = `${chartId}-scope-area-gradient`;
  const clipId = `${chartId}-plot`;
  const historyClipId = `${chartId}-history`;
  const today = osloDate();
  const points = progressSeries(workspace.progressEvents, workspace.tasks, today);
  const current = points[points.length - 1];
  const hasEvents = events.length > 0;
  const plotHeightClass = heightClassName ?? (compact ? "h-20" : "h-40");
  const viewBoxLeft = hasEvents ? 14 : 0;
  const viewBoxWidth = 640 - viewBoxLeft * 2;
  const plotPosition = (position: number) => (position - viewBoxLeft) / viewBoxWidth;
  const { start, end } = progressChartRange(points[0].date, today, deadline, { startDate, endDate });
  const maximum = Math.max(1, ...points.map(point => point.scope));
  // Reserve a visible post-deadline tail without changing the season's end date.
  const plotRight = showDeadlineTail && deadline === end ? 570 : 618;
  const x = (date: string) => 22 + (chartDay(date) - chartDay(start)) / (chartDay(end) - chartDay(start)) * (plotRight - 22);
  const y = (value: number) => 174 - value / maximum * 146;
  const line = (key: typeof series[number]["key"]) => progressStepPath(points, key, x, y);
  const scopeX = Math.max(22, Math.min(plotRight, x(today)));
  const scopeY = y(current.scope);
  const scopeCurveWidth = Math.max(0, scopeX - 22);
  const scopeProgress = Math.max(0.01, Math.min(0.99, (scopeX - 22) / (plotRight - 22)));
  const scopeLinePath = scopeCurveWidth
    ? `M22,174 C${22 + scopeCurveWidth * 0.25},174 ${scopeX - scopeCurveWidth * 0.12},${scopeY} ${scopeX},${scopeY} H${plotRight}`
    : `M22,174 V${scopeY} H${plotRight}`;
  const scopeAreaPath = `${scopeLinePath} V174 Z`;
  const boundedX = (date: string) => Math.max(22, Math.min(618, x(date)));
  const deadlineX = deadline && deadline >= start && deadline <= end ? x(deadline) : null;
  const visibleEvents = events.filter(event => event.date >= start && event.date <= end && (visibleEventIds.includes(event.value) || event.value === startEventId || event.value === endEventId));
  const eventLabels = visibleEvents.map(event => ({ ...event, position: x(event.date) }));
  const redStart = deadline ? boundedX(deadline) : 618;
  const currentVisible = current.date >= start && current.date <= end;
  const labelToday = today >= start && today <= end && eventLabels.every(event => Math.abs(event.position - x(today)) > 58);
  const axisLabels: AxisLabel[] = eventLabels.map(event => ({ ...event, position: plotPosition(event.position) }));
  if (eventLabels.length && labelToday) {
    axisLabels.push({ value: "today", label: "Today", position: plotPosition(x(today)) });
  }
  const totals = <div
    className={hasEvents ? `mt-4 flex ${plotHeightClass} flex-col justify-center gap-2 pt-2` : "flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1"}
    style={hasEvents ? undefined : { paddingInline: `${22 / 640 * 100}%` }}
    aria-label={`Progress on ${formatDate(current.date)}`}
  >
    {series.map(item => <div key={item.key} className={`flex shrink-0 items-baseline justify-between whitespace-nowrap ${hasEvents ? "gap-3" : "gap-1.5"}`}>
      <div title={item.description} className={`flex items-center gap-1.5 ${hasEvents ? "text-sm" : "text-xs text-muted-foreground"}`}>
        <span className="size-1.5" style={{ background: item.color }} />{item.label}
      </div>
      <div className={`tabular-nums ${hasEvents ? "text-lg font-semibold" : "text-sm font-medium"}`}>{current[item.key]}</div>
    </div>)}
  </div>;
  const plot = <ProgressEventAxis labels={axisLabels} endEventId={endEventId}>
      <div className={`relative ${plotHeightClass}`}>
        <svg viewBox={`${viewBoxLeft} 0 ${viewBoxWidth} 180`} preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Task progress over time" aria-describedby={`${chartId}-description`}>
          <desc id={`${chartId}-description`}>
            {"Scoped counts include non-cancelled tasks. Started includes in-progress, blocked and completed tasks. The shaded scope area rises from zero to today's task count, then stays level. Started and completed lines show daily states through today with smoothed transitions, including any labeled estimates, without a progress forecast. Displayed range:"} {formatDate(start)} {"to"} {formatDate(end)}.
            {visibleEvents.map(event => ` ${event.label}: ${formatDate(event.date)}.`).join("")}
            {deadline && `${deadlineX !== null ? ` The red line marks the end event on ${formatDate(deadline)}.` : ` The end event on ${formatDate(deadline)} is outside the displayed range.`} Red hatching marks time after the end event.`}
          </desc>
          <defs>
            <clipPath id={clipId}><rect x="22" y="20" width="596" height="160" /></clipPath>
            <clipPath id={historyClipId}><rect x="22" y="20" width={plotRight - 22} height="160" /></clipPath>
            <linearGradient id={scopeLineGradientId} gradientUnits="userSpaceOnUse" x1="22" x2={plotRight} y1="0" y2="0">
              <stop offset="0%" stopColor="#777777" stopOpacity="0.32" />
              <stop offset={`${scopeProgress * 100}%`} stopColor="#a0a0a0" stopOpacity="0.82" />
              <stop offset="100%" stopColor="#858585" stopOpacity="0.48" />
            </linearGradient>
            <linearGradient id={scopeAreaGradientId} gradientUnits="userSpaceOnUse" x1="22" x2="22" y1="20" y2="174">
              <stop offset="0%" stopColor="#a0a0a0" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#777777" stopOpacity="0" />
            </linearGradient>
            <pattern id={deadlinePatternId} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="var(--destructive)" strokeOpacity="0.45" strokeWidth="2" />
            </pattern>
          </defs>
          <g clipPath={`url(#${clipId})`}>
          {[0, 0.5, 1].map(fraction => <line key={fraction} x1="22" x2="618" y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="currentColor" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" />)}
          <path d={scopeAreaPath} fill={`url(#${scopeAreaGradientId})`} data-scope-area />
          {deadline && <g data-progress-deadline={deadline} data-progress-event={endEventId} data-event-date={deadline}>
            <title>{`End event: ${deadlineLabel} (${formatDate(deadline)}). Red area: after this event.`}</title>
            <rect x={redStart} y="20" width={618 - redStart} height="154" fill="var(--destructive)" fillOpacity="0.04" />
            <rect x={redStart} y="20" width={618 - redStart} height="154" fill={`url(#${deadlinePatternId})`} />
            {deadlineX !== null && <line x1={deadlineX} x2={deadlineX} y1="20" y2="179" stroke="var(--destructive)" strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />}
          </g>}
          <g clipPath={`url(#${historyClipId})`}>
          <path d={scopeLinePath} fill="none" stroke={`url(#${scopeLineGradientId})`} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-scope-line />
          <path d={`${line("completed")} L${x(current.date)},174 L${x(points[0].date)},174 Z`} fill="var(--progress-completed)" fillOpacity="0.08" />
          {series.filter(item => item.key !== "scope").map(item => <path key={item.key} d={line(item.key)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={item.key === "started" ? "4 3" : undefined} />)}
          {today >= start && today <= end && <line x1={x(today)} x2={x(today)} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
          </g>
          {eventLabels.filter(event => event.value !== endEventId).map(event => <g key={event.value} data-progress-event={event.value} data-event-date={event.date}>
            <title>{`${event.label}: ${formatDate(event.date)}`}</title>
            <line x1={event.position} x2={event.position} y1="20" y2="179" stroke="currentColor" strokeOpacity="0.8" className="text-foreground" vectorEffect="non-scaling-stroke" />
          </g>)}
          </g>
        </svg>
        {currentVisible && series.map(item => <span key={item.key} aria-hidden="true" className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${plotPosition(x(current.date)) * 100}%`, top: `${y(current[item.key]) / 180 * 100}%`, background: item.color }} />)}
      </div>
      <span className="sr-only" data-chart-boundary="start"><time dateTime={start}>{shortDate(start)}</time></span>
      <span className="sr-only" data-chart-boundary="end"><time dateTime={end}>{shortDate(end)}</time></span>
      {!eventLabels.length && <div className="relative mt-1 h-9 text-[10px] text-muted-foreground">
        {labelToday && <span className="absolute top-[18px] -translate-x-1/2" style={{ left: `${plotPosition(x(today)) * 100}%` }}>Today</span>}
      </div>}
  </ProgressEventAxis>;
  return <div className="grid gap-1.5" data-progress-start={start} data-progress-end={end}>
    {workspace.tasks.some(task => task.historicalEstimate) && <p className="text-xs text-muted-foreground">Progress includes estimated historical dates.</p>}
    {hasEvents ? <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
      {plot}
      {totals}
    </div> : <>{totals}{plot}</>}
    {!hasEvents && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span>{footerLabels?.start ?? (workspace.tasks.some(task => task.historicalEstimate) ? `History includes estimates from ${shortDate(points[0].date)}` : points.length === 1 ? `History begins ${shortDate(current.date)}` : `Recorded since ${shortDate(points[0].date)}`)}</span>
      {deadline && <span className="text-destructive" title="Red hatching marks time after the end event">{footerLabels?.end ?? `End event: ${shortDate(deadline)}`}</span>}
    </div>}
    <table className="sr-only"><caption>Progress history</caption><thead><tr><th>Date</th>{series.map(item => <th key={item.key}>{item.label}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.date}><th scope="row">{shortDate(point.date)}</th><td>{point.scope}</td><td>{point.started}</td><td>{point.completed}</td></tr>)}</tbody></table>
  </div>;
}

function OverviewEventFilter({ startEvent, endEvent, events, visibleEventIds, onStartChange, onEndChange, onToggleEvent }: {
  startEvent: SeasonEvent;
  endEvent: SeasonEvent;
  events: ChartEvent[];
  visibleEventIds: string[];
  onStartChange: (value: SeasonEvent) => void;
  onEndChange: (value: SeasonEvent) => void;
  onToggleEvent: (value: SeasonEvent) => void;
}) {
  const startDate = events.find(event => event.value === startEvent)!.date;
  const endDate = events.find(event => event.value === endEvent)!.date;
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="icon-sm" aria-label="Overview event settings" title="Overview event settings"><IconFilter2 aria-hidden="true" className="size-4" /></Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1.5"><Label htmlFor="overview-start-event" className="text-xs text-muted-foreground">Start event</Label><Select value={startEvent} onValueChange={value => onStartChange(value as SeasonEvent)}><SelectTrigger id="overview-start-event" className="w-full"><SelectValue /></SelectTrigger><SelectContent position="popper" align="start">{events.map(event => <SelectItem key={event.value} value={event.value} disabled={event.date >= endDate}>{event.label}<span className="ml-auto pl-3 text-xs text-muted-foreground">{shortDate(event.date)}</span></SelectItem>)}</SelectContent></Select></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="overview-end-event" className="text-xs text-muted-foreground">End event</Label><Select value={endEvent} onValueChange={value => onEndChange(value as SeasonEvent)}><SelectTrigger id="overview-end-event" className="w-full"><SelectValue /></SelectTrigger><SelectContent position="popper" align="start">{events.map(event => <SelectItem key={event.value} value={event.value} disabled={event.date <= startDate}>{event.label}<span className="ml-auto pl-3 text-xs text-muted-foreground">{shortDate(event.date)}</span></SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">Events shown</p><div role="group" aria-label="Events shown in chart" className="flex flex-wrap gap-1.5">{events.map(event => {
        const boundary = event.value === startEvent || event.value === endEvent;
        const active = visibleEventIds.includes(event.value) || boundary;
        return <Button key={event.value} type="button" size="sm" variant={active ? "secondary" : "outline"} aria-pressed={active} disabled={boundary} title={boundary ? `${event.label} is always shown as a chart boundary` : `${active ? "Hide" : "Show"} ${event.label}`} className="h-7 rounded-full px-2.5 text-xs disabled:opacity-100" onClick={() => onToggleEvent(event.value)}>{event.label}</Button>;
      })}</div></div>
    </PopoverContent>
  </Popover>;
}

export function OverviewProgress({ workspace, busy, projectColumns, onToggleProjectColumn, onSelectProject, onSaveSchedule, children }: {
  children?: ReactNode; workspace: ProjectWorkspace; busy: boolean; projectColumns: string[]; onToggleProjectColumn: (key: string) => void; onSelectProject: (id: string) => void; onSaveSchedule?: (change: Extract<ProjectMutation, { action: "save_season_schedule" }>) => Promise<boolean>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const projects = [...workspace.projects].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.name.localeCompare(b.name));
  const events = seasonChartEvents(workspace, seasonChartRange(workspace.season));
  const first = events.find(event => event.value === "season-start")!;
  const last = events.find(event => event.value === "season-end")!;
  const requestedStart = events.find(event => event.value === searchParams.get("startEvent")) ?? first;
  const requestedEnd = events.find(event => event.value === searchParams.get("endEvent")) ?? last;
  const startEvent = requestedStart.date < requestedEnd.date ? requestedStart : first;
  const endEvent = requestedEnd.date > startEvent.date ? requestedEnd : last;
  function filteredEvents(params: URLSearchParams) {
    return params.has("events")
      ? (params.get("events") ?? "").split(",").filter(value => events.some(event => event.value === value))
      : events.map(event => event.value);
  }
  const visibleEventIds = filteredEvents(searchParams);
  const setEventParam = (name: string, value: string, defaultValue: string) => setSearchParams(previous => { const next = new URLSearchParams(previous); if (value === defaultValue) next.delete(name); else next.set(name, value); return next; }, { replace: true });
  const toggleEvent = (value: SeasonEvent) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    const active = filteredEvents(previous);
    const updated = active.includes(value) ? active.filter(item => item !== value) : [...active, value];
    if (updated.length === events.length) next.delete("events"); else next.set("events", updated.join(","));
    return next;
  }, { replace: true });
  return <div data-project-progress className="grid w-full grid-cols-1 gap-8">
    <section aria-labelledby="progress-title" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="progress-title" className="text-base font-medium">Progress</h2>
          <p className="mt-1 text-sm text-muted-foreground">Scoped, started and completed tasks over time.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {workspace.canManage && onSaveSchedule && <SeasonScheduleActions workspace={workspace} busy={busy} save={onSaveSchedule} />}
          <OverviewEventFilter startEvent={startEvent.value} endEvent={endEvent.value} events={events} visibleEventIds={visibleEventIds} onStartChange={value => setEventParam("startEvent", value, "season-start")} onEndChange={value => setEventParam("endEvent", value, "season-end")} onToggleEvent={toggleEvent} />
        </div>
      </div>
      <Card className="gap-2 py-3">
        <CardContent className="gap-2 px-4">
          <ProgressChart workspace={workspace} heightClassName="h-28" deadline={endEvent.date} deadlineLabel={endEvent.label} startDate={startEvent.date} endDate={endEvent.date} showDeadlineTail events={events} visibleEventIds={visibleEventIds} startEventId={startEvent.value} endEventId={endEvent.value} footerLabels={{ start: `Start event: ${startEvent.label}`, end: `End event: ${endEvent.label}` }} />
          <SeasonSchedule schedule={workspace.seasonSchedule} />
        </CardContent>
      </Card>
    </section>
    {children}
    <section aria-labelledby="overview-projects-title" className="space-y-3"><div className="flex items-start justify-between"><div><h2 id="overview-projects-title" className="text-base font-medium">{"Projects"} <span className="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{projects.length}</span></h2><p className="mt-1 text-sm text-muted-foreground">Open projects due in the next 30 days, nearest deadline first.</p></div><OverviewColumnMenu label="Projects" columns={OVERVIEW_PROJECT_COLUMNS} visible={projectColumns} onToggle={onToggleProjectColumn} /></div><Card className="gap-0 py-0"><CardContent className="overflow-x-auto px-0"><Table aria-label="Season projects"><TableHeader><TableRow><TableHead className="min-w-56 pl-4">Name</TableHead>{projectColumns.includes("department") && <TableHead>Department</TableHead>}{projectColumns.includes("priority") && <TableHead className="text-center">Priority</TableHead>}{projectColumns.includes("leads") && <TableHead>Leads</TableHead>}{projectColumns.includes("start") && <TableHead>Start date</TableHead>}{projectColumns.includes("deadline") && <TableHead>Target date</TableHead>}{projectColumns.includes("milestones") && <TableHead className="text-center">Milestones</TableHead>}{projectColumns.includes("tasks") && <TableHead className="text-center">Tasks</TableHead>}{projectColumns.includes("status") && <TableHead className="text-center">Status</TableHead>}{projectColumns.includes("progress") && <TableHead className="text-center">Progress</TableHead>}</TableRow></TableHeader><TableBody>
      {projects.map(project => { const progress = summarize(workspace.tasks.filter(task => task.projectId === project.id && isOrganized(task, workspace))); const milestones = workspace.tasks.filter(task => task.kind === "milestone" && task.projectId === project.id && isOrganized(task, workspace)); return <TableRow key={project.id}>
        <TableCell className="py-3 pl-4"><div className="flex items-center gap-2"><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><button className="text-left font-medium hover:underline" onClick={() => onSelectProject(project.id)}>{project.name}</button></div></TableCell>
        {projectColumns.includes("department") && <TableCell className="max-w-52 text-muted-foreground"><span className="block truncate" title={project.departments.join(", ")}>{project.departments.join(", ") || "—"}</span></TableCell>}
        {projectColumns.includes("priority") && <TableCell className="text-center"><PriorityIndicator priority={project.priority ?? "normal"} /></TableCell>}
        {projectColumns.includes("leads") && <TableCell><AssigneeAvatars assigneeIds={project.leadIds ?? []} members={workspace.members} assignmentRole="lead" /></TableCell>}
        {projectColumns.includes("start") && <TableCell className="whitespace-nowrap">{project.startDate ? <TargetDate deadline={project.startDate} /> : <span className="text-muted-foreground">Not set</span>}</TableCell>}
        {projectColumns.includes("deadline") && <TableCell className="whitespace-nowrap"><TargetDate deadline={project.deadline} /></TableCell>}
        {projectColumns.includes("milestones") && <TableCell className="text-center tabular-nums"><span className="inline-flex items-center gap-1.5"><IconDiamonds aria-hidden="true" className="size-4 text-muted-foreground" />{milestones.length}</span></TableCell>}
        {projectColumns.includes("tasks") && <TableCell className="text-center tabular-nums">{progress.total}</TableCell>}
        {projectColumns.includes("status") && <TableCell className="text-center"><TaskStatusIndicator status={project.status ?? "todo"} showLabel={false} /></TableCell>}
        {projectColumns.includes("progress") && <TableCell className="text-center"><ProgressRing {...progress} label={project.name} showTotal={false} /></TableCell>}
      </TableRow>; })}
      {!projects.length && <TableRow><TableCell colSpan={1 + projectColumns.length} className="py-6 text-center text-sm text-muted-foreground"><EmptyIllustration kind="cube" /><p className="mt-2">No projects yet.</p></TableCell></TableRow>}
    </TableBody></Table></CardContent></Card></section>
  </div>;
}
