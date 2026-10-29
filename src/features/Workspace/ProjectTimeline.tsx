import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft, IconArrowRight, IconCube, IconDiamonds } from "@tabler/icons-react";
import { EmptyIllustration } from "../MemberPlatform/EmptyIllustration";
import { addDays, formatDate, osloDate } from "../ProjectManagement/model";
import { chartDay } from "../ProjectManagement/progress-chart";
import { ProgressRing } from "../ProjectManagement/ProgressRing";
import type { WorkspaceProject } from "./types";

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const nextMonth = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return parsed.toISOString().slice(0, 10);
};
export function timelineRange(projects: WorkspaceProject[], today: string) {
  const dates = projects.flatMap(project => [project.startDate, project.deadline, ...project.milestones.map(item => item.deadline)]).filter((date): date is string => Boolean(date));
  const start = monthStart(addDays([today, ...dates].sort()[0], -1095));
  const end = nextMonth(monthStart(addDays([today, ...dates].sort().reverse()[0], 1095)));
  const months: string[] = [];
  for (let month = start; month < end; month = nextMonth(month)) months.push(month);
  return { start, end, months };
}
export function offscreenProject(start: number | null, end: number | null, left: number, right: number) {
  if (start === null && end === null) return null;
  const first = start ?? end!;
  const last = end ?? start!;
  return Math.max(first, last) < left ? "left" : Math.min(first, last) > right ? "right" : null;
}
export function timelineTicks(start: string, end: string, pixelsPerDay: number) {
  const interval = pixelsPerDay >= 12 ? 1 : pixelsPerDay >= 6 ? 7 : 14;
  const ticks: string[] = [];
  for (let date = start; date < end; date = addDays(date, 1)) {
    if (Math.floor(chartDay(date)) % interval === 0) ticks.push(date);
  }
  return ticks;
}
export function milestonePositions(milestones: WorkspaceProject["milestones"], x: (date: string) => number) {
  const positions: { milestone: WorkspaceProject["milestones"][number]; position: number }[] = [];
  for (const milestone of milestones.filter(item => item.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.title.localeCompare(b.title))) {
    const previous = positions[positions.length - 1];
    positions.push({ milestone, position: Math.max(x(milestone.deadline!), previous ? previous.position + 12 : -Infinity) });
  }
  return positions;
}
export function ProjectTimeline({ projects, groups, scale, timelineRef }: {
  projects: WorkspaceProject[]; groups: { id: string; name: string; projects: WorkspaceProject[] }[];
  scale: string; timelineRef: React.Ref<{ centerToday: () => void }>;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ left: 0, width: 0, label: 0 });
  const today = osloDate();
  const { start, end, months } = timelineRange(projects, today);
  const width = Math.max(720, (chartDay(end) - chartDay(start)) * (scale === "month" ? 18 : scale === "quarter" ? 8 : 3));
  const x = (date: string) => (chartDay(date) - chartDay(start)) / (chartDay(end) - chartDay(start)) * width;
  const todayX = x(today);
  const ticks = useMemo(() => timelineTicks(start, end, width / (chartDay(end) - chartDay(start))).map(date => ({ date, position: (chartDay(date) - chartDay(start)) / (chartDay(end) - chartDay(start)) * width })), [start, end, width]);
  function updateViewport() {
    if (!scroll.current) return;
    const element = scroll.current;
    const label = element.querySelector<HTMLElement>("[data-timeline-label]")?.offsetWidth ?? 0;
    setViewport({ left: element.scrollLeft, width: element.clientWidth, label });
  }
  function centerToday() {
    if (!scroll.current) return;
    const labelWidth = scroll.current.querySelector<HTMLElement>("[data-timeline-label]")?.offsetWidth ?? 240;
    scroll.current.scrollLeft = Math.max(0, todayX - (scroll.current.clientWidth - labelWidth) / 2);
    updateViewport();
  }
  useImperativeHandle(timelineRef, () => ({ centerToday }));
  useEffect(() => {
    if (!scroll.current) return;
    const labelWidth = scroll.current.querySelector<HTMLElement>("[data-timeline-label]")?.offsetWidth ?? 240;
    scroll.current.scrollLeft = Math.max(0, todayX - (scroll.current.clientWidth - labelWidth) / 2);
    updateViewport();
  }, [todayX, width, projects.length]);
  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(updateViewport);
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, [projects.length]);
  const monthLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { month: "short", ...(date.slice(5, 7) === "01" || date === start ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <section aria-label="Project timeline" className="flex min-h-0 min-w-0 flex-1 flex-col">
    {!projects.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground"><EmptyIllustration kind="cube" /><p className="mt-2">No projects to show.</p></div> : <div ref={scroll} onScroll={updateViewport} tabIndex={0} role="region" aria-label="Project timeline calendar" className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [--timeline-label-width:10rem] sm:[--timeline-label-width:15rem]">
      <div className="relative min-h-full" style={{ width: `calc(${width}px + var(--timeline-label-width))` }}>
        <div className="pointer-events-none absolute inset-y-0 left-[var(--timeline-label-width)]" style={{ width }}>{months.map(month => <div key={month} className="absolute inset-y-0 border-l border-dashed border-border/70" style={{ left: x(month) }} />)}<div aria-label={`Today: ${formatDate(today)}`} className="absolute inset-y-0 border-l border-primary/70" style={{ left: x(today) }} /></div>
        <div className="sticky top-0 z-20 flex h-14 border-b bg-card">
          <div data-timeline-label className="sticky left-0 z-30 w-[var(--timeline-label-width)] shrink-0 border-r bg-card px-4 py-4 text-xs text-muted-foreground">Project</div>
          <div className="relative" style={{ width }}>{months.map(month => <span key={month} className="absolute top-1 whitespace-nowrap pl-1 text-xs text-muted-foreground" style={{ left: x(month) }}>{monthLabel(month)}</span>)}{ticks.filter(tick => tick.position >= viewport.left - 50 && tick.position <= viewport.left + viewport.width + 50).map(({ date, position }) => <span key={date} className="absolute bottom-1 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" title={formatDate(date)} style={{ left: position }}>{Number(date.slice(8, 10))}</span>)}<span className="absolute bottom-0 z-10 -translate-x-1/2 rounded bg-primary px-1 text-[10px] text-primary-foreground" style={{ left: todayX }}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`))}</span></div>
        </div>
        {groups.map(group => <div key={group.id}>
          {group.name && <div className="sticky left-0 w-[var(--timeline-label-width)] border-y bg-muted px-4 py-2 text-xs font-medium">{group.name}</div>}
          {group.projects.map(project => {
            const markers = milestonePositions(project.milestones, x);
            const hasRange = Boolean(project.startDate && project.deadline);
            const direction = viewport.width ? offscreenProject(project.startDate ? x(project.startDate) : null, project.deadline ? x(project.deadline) : null, viewport.left, viewport.left + viewport.width - viewport.label) : null;
            const shortDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
            const dates = project.startDate && project.deadline ? `${shortDate(project.startDate)} – ${shortDate(project.deadline)}` : project.startDate ? `Start: ${shortDate(project.startDate)}` : project.deadline ? `Target: ${shortDate(project.deadline)}` : "";
            return <div key={project.id} className="flex h-24 border-b border-border/50" aria-label={`Timeline for ${project.name}`}>
            <div className="sticky left-0 z-10 flex w-[var(--timeline-label-width)] shrink-0 items-center gap-2 border-r bg-card px-4">
              <Link to={`/projects/${project.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{project.name}</span></Link>
              <ProgressRing label={project.name} done={project.done} total={project.total} percent={project.total ? Math.round(project.done / project.total * 100) : 0} showTotal={false} />
            </div>
            <div className="relative" style={{ width }}>
              {direction && <div className="pointer-events-none sticky left-[var(--timeline-label-width)] z-10 h-0" style={{ width: Math.max(0, viewport.width - viewport.label) }}><button type="button" className={`pointer-events-auto absolute top-5 flex max-w-full items-center gap-2 rounded-md bg-card/95 px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${direction === "left" ? "left-1" : "right-1 text-right"}`} aria-label={`Show ${project.name} timeframe, ${dates}`} onClick={() => { if (scroll.current) scroll.current.scrollLeft = Math.max(0, x((direction === "left" ? project.deadline ?? project.startDate : project.startDate ?? project.deadline)!) - (scroll.current.clientWidth - viewport.label) / 2); }}>{direction === "left" && <IconArrowLeft aria-hidden="true" className="size-4 shrink-0" />}<span className="min-w-0"><span className="block truncate text-foreground">{project.name}</span><span className="block truncate">{dates}</span></span>{direction === "right" && <IconArrowRight aria-hidden="true" className="size-4 shrink-0" />}</button></div>}
              {hasRange ? <><span aria-hidden="true" className="pointer-events-none absolute top-0 truncate text-xs" style={{ left: x(project.startDate!), maxWidth: Math.min(208, width - x(project.startDate!)) }}>{project.name}</span><Link
                data-project-bar={project.id}
                to={`/projects/${project.id}`}
                aria-label={`Open project ${project.name}, ${formatDate(project.startDate!)} to ${formatDate(project.deadline)}`}
                title={`${project.name}: ${formatDate(project.startDate!)} – ${formatDate(project.deadline)}`}
                className="absolute top-6 flex h-7 items-center overflow-hidden rounded-md border border-primary/40 bg-primary/15 text-xs hover:bg-primary/25"
                style={{ left: x(project.startDate!), width: Math.max(2, x(project.deadline!) - x(project.startDate!)) }}
              ><span className="sr-only">{project.name}</span></Link></> : project.deadline ? <Link to={`/projects/${project.id}`} aria-label={`Open project ${project.name}, target ${formatDate(project.deadline)}`} title={`${project.name}: target ${formatDate(project.deadline)}`} className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border bg-muted px-2 py-0.5 text-xs hover:bg-accent" style={{ left: x(project.deadline) }}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${project.deadline}T12:00:00Z`))}</Link> : project.startDate ? <Link to={`/projects/${project.id}`} className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border bg-muted px-2 py-0.5 text-xs hover:bg-accent" style={{ left: x(project.startDate) }} title={`Start: ${formatDate(project.startDate)}; deadline not set`}>Start: {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${project.startDate}T12:00:00Z`))}</Link> : <span className="absolute left-4 top-0 text-xs text-muted-foreground">Dates not set</span>}
              {markers.map(({ milestone, position }) => <Link key={milestone.id} to={`/projects/${project.id}?milestone=${encodeURIComponent(milestone.id)}`} aria-label={`Open milestone ${milestone.title} in ${project.name}`} title={`${milestone.title}: ${formatDate(milestone.deadline)}`} className="absolute top-6 z-10 flex h-7 w-3 -translate-x-1/2 items-center justify-center rounded text-foreground hover:z-20 hover:bg-accent focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ left: position }}><IconDiamonds aria-hidden="true" className="size-4 max-w-none shrink-0" /></Link>)}
            </div>
          </div>; })}
        </div>)}
      </div>
    </div>}
  </section>;
}
