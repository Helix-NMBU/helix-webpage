import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft, IconArrowRight, IconCube } from "@tabler/icons-react";
import { EmptyIllustration } from "../MemberPlatform/EmptyIllustration";
import { addDays, formatDate, osloDate } from "../ProjectManagement/model";
import { chartDay } from "../ProjectManagement/progress-chart";
import { projectRepository } from "../ProjectManagement/repository";
import type { ProjectWorkspace, Task, TaskStatus } from "../ProjectManagement/types";
import { ProjectTimelineProperties } from "./ProjectTimelineProperties";
import type { WorkspaceDirectory, WorkspaceProject } from "./types";

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
export function timelinePointerPosition(pointerX: number, labelWidth: number) {
  return Math.max(pointerX, labelWidth);
}
export function timelinePointerDate(start: string, end: string, pixelsPerDay: number, pointerX: number, labelWidth: number, scrollLeft: number) {
  const dayOffset = Math.floor((scrollLeft + timelinePointerPosition(pointerX, labelWidth) - labelWidth) / pixelsPerDay);
  return addDays(start, Math.max(0, Math.min(chartDay(end) - chartDay(start) - 1, dayOffset)));
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
    positions.push({ milestone, position: Math.max(x(milestone.deadline!), previous ? previous.position + 6 : -Infinity) });
  }
  return positions;
}
export function projectTimelineStatus(tasks: Pick<Task, "status">[]): TaskStatus | null {
  if (!tasks.length) return null;
  if (tasks.every(task => task.status === "cancelled")) return "cancelled";
  const active = tasks.filter(task => task.status !== "cancelled");
  if (active.length && active.every(task => task.status === "done")) return "done";
  if (active.some(task => task.status === "blocked")) return "blocked";
  return active.some(task => task.status === "in_progress" || task.status === "done") ? "in_progress" : "todo";
}
export function ProjectTimeline({ projects, groups, directory, scale, timelineRef }: {
  projects: WorkspaceProject[]; groups: { id: string; name: string; projects: WorkspaceProject[] }[];
  directory: WorkspaceDirectory; scale: string; timelineRef: React.Ref<{ centerToday: () => void }>;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [viewport, setViewport] = useState({ left: 0, width: 0, label: 0 });
  const [pointerX, setPointerX] = useState<number | null>(null);
  const today = osloDate();
  useEffect(() => {
    let active = true;
    const load = () => { void projectRepository().then(repository => repository.load()).then(result => { if (active) setWorkspace(result); }).catch(() => { if (active) setWorkspace(null); }); };
    load();
    window.addEventListener("helix-workspace-updated", load);
    return () => { active = false; window.removeEventListener("helix-workspace-updated", load); };
  }, []);
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
  return <section aria-label="Project timeline" className="project-timeline flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--timeline-surface)]">
    {!projects.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground"><EmptyIllustration kind="cube" /><p className="mt-2">No projects to show.</p></div> : <div ref={scroll} onScroll={updateViewport} onPointerMove={event => { if (event.pointerType === "mouse") setPointerX(event.clientX - event.currentTarget.getBoundingClientRect().left); }} onPointerLeave={() => setPointerX(null)} tabIndex={0} role="region" aria-label="Project timeline calendar" className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [--timeline-label-width:15rem] sm:[--timeline-label-width:19rem]">
      <div className="relative min-h-full" style={{ width: `calc(${width}px + var(--timeline-label-width))` }}>
        <div className="pointer-events-none absolute inset-y-0 left-[var(--timeline-label-width)]" style={{ width }}>{months.map(month => <div key={month} className="absolute inset-y-0 border-l border-dashed border-[var(--timeline-grid)]" style={{ left: x(month) }} />)}<div aria-label={`Today: ${formatDate(today)}`} className="absolute inset-y-0 border-l border-primary/70" style={{ left: x(today) }} /></div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20"><div className={`sticky left-0 h-full w-[var(--timeline-label-width)] bg-[var(--timeline-surface)] ${viewport.left > 0 ? "after:absolute after:inset-y-0 after:-right-6 after:w-6 after:bg-gradient-to-r after:from-[var(--timeline-surface)] after:to-transparent" : ""}`} /></div>
        {pointerX !== null && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[35]"><div className="sticky left-0 h-full w-0"><div className="absolute inset-y-0 border-l border-foreground/20" style={{ left: timelinePointerPosition(pointerX, viewport.label) }} /></div></div>}
        <div className="sticky top-0 z-40 flex h-14 bg-[var(--timeline-surface)]">
          {pointerX !== null && <div aria-hidden="true" className="pointer-events-none sticky left-0 z-20 h-full w-0 shrink-0"><span className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap rounded bg-muted px-1 text-[10px] text-foreground" style={{ left: timelinePointerPosition(pointerX, viewport.label) }}>{formatDate(timelinePointerDate(start, end, width / (chartDay(end) - chartDay(start)), pointerX, viewport.label, viewport.left))}</span></div>}
          <div className="relative ml-[var(--timeline-label-width)] shrink-0" style={{ width }}>{months.map(month => <span key={month} className="absolute top-1 whitespace-nowrap pl-1 text-xs text-muted-foreground" style={{ left: x(month) }}>{monthLabel(month)}</span>)}{ticks.filter(tick => tick.position >= viewport.left - viewport.label - 50 && tick.position <= viewport.left + viewport.width + 50).map(({ date, position }) => <span key={date} className="absolute bottom-1 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" title={formatDate(date)} style={{ left: position }}>{Number(date.slice(8, 10))}</span>)}<span className="absolute bottom-0 z-10 -translate-x-1/2 rounded bg-primary px-1 text-[10px] text-primary-foreground" style={{ left: todayX }}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`))}</span></div>
        </div>
        {groups.map(group => <div key={group.id}>
          {group.name && <div className="sticky left-0 z-30 w-[var(--timeline-label-width)] bg-muted/40 px-4 py-2 text-xs font-medium">{group.name}</div>}
          {group.projects.map(project => {
            const markers = milestonePositions(project.milestones, x);
            const projectTasks = workspace?.tasks.filter(task => task.projectId === project.id && task.kind === "task");
            const status = projectTasks ? projectTimelineStatus(projectTasks) : null;
            const hasRange = Boolean(project.startDate && project.deadline);
            const direction = viewport.width ? offscreenProject(project.startDate ? x(project.startDate) : null, project.deadline ? x(project.deadline) : null, viewport.left, viewport.left + viewport.width - viewport.label) : null;
            const shortDate = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
            const dates = project.startDate && project.deadline ? `${shortDate(project.startDate)} – ${shortDate(project.deadline)}` : project.startDate ? `Start: ${shortDate(project.startDate)}` : project.deadline ? `Target: ${shortDate(project.deadline)}` : "";
            return <div key={project.id} className="flex h-14" aria-label={`Timeline for ${project.name}`}>
            <div data-timeline-label className={`sticky left-0 z-30 flex w-[var(--timeline-label-width)] shrink-0 items-center bg-[var(--timeline-surface)] px-4 before:pointer-events-none before:absolute before:inset-x-2 before:inset-y-2 before:rounded-lg hover:before:bg-muted/60 ${viewport.left > 0 ? "after:pointer-events-none after:absolute after:inset-y-0 after:-right-6 after:w-6 after:bg-gradient-to-r after:from-[var(--timeline-surface)] after:to-transparent" : ""}`}>
              <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
              <Link to={`/projects/${project.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{project.name}</span></Link>
              <ProjectTimelineProperties project={project} directory={directory} workspace={workspace} status={status} onWorkspaceChange={setWorkspace} />
              </div>
            </div>
            <div className="relative" style={{ width }}>
              {direction && <div className="pointer-events-none sticky left-[var(--timeline-label-width)] z-10 h-0" style={{ width: Math.max(0, viewport.width - viewport.label) }}><button type="button" className={`pointer-events-auto absolute top-5 flex max-w-full items-center gap-2 rounded-md bg-card/95 px-2 py-1 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${direction === "left" ? "left-1" : "right-1 text-right"}`} aria-label={`Show ${project.name} timeframe, ${dates}`} onClick={() => { if (scroll.current) scroll.current.scrollLeft = Math.max(0, x((direction === "left" ? project.deadline ?? project.startDate : project.startDate ?? project.deadline)!) - (scroll.current.clientWidth - viewport.label) / 2); }}>{direction === "left" && <IconArrowLeft aria-hidden="true" className="size-4 shrink-0" />}<span className="min-w-0"><span className="block truncate text-foreground">{project.name}</span><span className="block truncate">{dates}</span></span>{direction === "right" && <IconArrowRight aria-hidden="true" className="size-4 shrink-0" />}</button></div>}
              {hasRange ? <><span aria-hidden="true" className="pointer-events-none absolute top-0 truncate text-xs" style={{ left: x(project.startDate!), maxWidth: Math.min(208, width - x(project.startDate!)) }}>{project.name}</span><Link
                data-project-bar={project.id}
                to={`/projects/${project.id}`}
                aria-label={`Open project ${project.name}, ${formatDate(project.startDate!)} to ${formatDate(project.deadline)}`}
                title={`${project.name}: ${formatDate(project.startDate!)} – ${formatDate(project.deadline)}`}
                className="project-timeline-bar absolute top-6 flex h-6 items-center overflow-hidden rounded-md border border-border/40 bg-muted/60 text-xs hover:bg-muted"
                style={{ left: x(project.startDate!), width: Math.max(16, x(project.deadline!) - x(project.startDate!)) }}
              ><span className="sr-only">{project.name}</span></Link></> : project.deadline ? <Link to={`/projects/${project.id}`} aria-label={`Open project ${project.name}, target ${formatDate(project.deadline)}`} title={`${project.name}: target ${formatDate(project.deadline)}`} className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border bg-muted px-2 py-0.5 text-xs hover:bg-accent" style={{ left: x(project.deadline) }}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${project.deadline}T12:00:00Z`))}</Link> : project.startDate ? <Link to={`/projects/${project.id}`} className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border bg-muted px-2 py-0.5 text-xs hover:bg-accent" style={{ left: x(project.startDate) }} title={`Start: ${formatDate(project.startDate)}; deadline not set`}>Start: {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${project.startDate}T12:00:00Z`))}</Link> : <span className="absolute left-4 top-0 text-xs text-muted-foreground">Dates not set</span>}
              {markers.map(({ milestone, position }) => <Link key={milestone.id} to={`/projects/${project.id}?milestone=${encodeURIComponent(milestone.id)}`} aria-label={`Open milestone ${milestone.title} in ${project.name}`} title={`${milestone.title}: ${formatDate(milestone.deadline)}`} className="absolute top-6 z-10 flex h-6 w-3 -translate-x-1/2 items-center justify-center rounded text-muted-foreground hover:z-20 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ left: position }}><svg aria-hidden="true" viewBox="0 0 16 16" className="size-5 max-w-none shrink-0"><path d="M7.2 1.9a1 1 0 0 1 1.6 0l4 5.5a1 1 0 0 1 0 1.2l-4 5.5a1 1 0 0 1-1.6 0l-4-5.5a1 1 0 0 1 0-1.2Z" fill="currentColor" /></svg></Link>)}
            </div>
          </div>; })}
        </div>)}
      </div>
    </div>}
  </section>;
}
