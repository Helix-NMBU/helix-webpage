import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { IconCube, IconDiamonds } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Choice } from "../ProjectManagement/TaskEditor";
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
  const dates = projects.flatMap(project => [project.deadline, ...project.milestones.map(item => item.deadline)]).filter((date): date is string => Boolean(date));
  const start = monthStart(addDays([addDays(today, -30), ...dates].sort()[0], -14));
  const end = nextMonth(monthStart(addDays([addDays(today, 90), ...dates].sort().reverse()[0], 14)));
  const months: string[] = [];
  for (let month = start; month < end; month = nextMonth(month)) months.push(month);
  return { start, end, months };
}
export function ProjectTimeline({ projects, groups, scale, onScale }: {
  projects: WorkspaceProject[]; groups: { id: string; name: string; projects: WorkspaceProject[] }[];
  scale: string; onScale: (value: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const today = osloDate();
  const { start, end, months } = timelineRange(projects, today);
  const width = Math.max(720, (chartDay(end) - chartDay(start)) * (scale === "month" ? 18 : scale === "quarter" ? 8 : 3));
  const x = (date: string) => (chartDay(date) - chartDay(start)) / (chartDay(end) - chartDay(start)) * width;
  const todayX = x(today);
  function centerToday() {
    if (!scroll.current) return;
    const labelWidth = scroll.current.querySelector<HTMLElement>("[data-timeline-label]")?.offsetWidth ?? 240;
    scroll.current.scrollLeft = Math.max(0, todayX - (scroll.current.clientWidth - labelWidth) / 2);
  }
  useEffect(() => {
    if (!scroll.current) return;
    const labelWidth = scroll.current.querySelector<HTMLElement>("[data-timeline-label]")?.offsetWidth ?? 240;
    scroll.current.scrollLeft = Math.max(0, todayX - (scroll.current.clientWidth - labelWidth) / 2);
  }, [todayX, width, projects.length]);
  const monthLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { month: "short", ...(date.slice(5, 7) === "01" || date === start ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <section aria-label="Project timeline">
    <div className="flex flex-wrap items-center justify-between gap-3 border-y px-4 py-3">
      <span className="text-xs text-muted-foreground">Target dates and milestones</span>
      <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={centerToday}>Today</Button><div className="w-28"><Choice id="project-timeline-scale" ariaLabel="Timeline scale" value={scale} onChange={onScale} options={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }]} /></div></div>
    </div>
    {!projects.length ? <p className="px-4 py-12 text-center text-sm text-muted-foreground">No projects to show.</p> : <div ref={scroll} tabIndex={0} role="region" aria-label="Project timeline calendar" className="max-h-[70svh] overflow-auto overscroll-contain [--timeline-label-width:10rem] sm:[--timeline-label-width:15rem]">
      <div className="relative min-h-80" style={{ width: `calc(${width}px + var(--timeline-label-width))` }}>
        <div className="pointer-events-none absolute inset-y-0 left-[var(--timeline-label-width)]" style={{ width }}>{months.map(month => <div key={month} className="absolute inset-y-0 border-l border-dashed border-border/70" style={{ left: x(month) }} />)}<div aria-label={`Today: ${formatDate(today)}`} className="absolute inset-y-0 border-l border-primary/70" style={{ left: x(today) }} /></div>
        <div className="sticky top-0 z-20 flex h-12 border-b bg-card">
          <div data-timeline-label className="sticky left-0 z-30 w-[var(--timeline-label-width)] shrink-0 border-r bg-card px-4 py-4 text-xs text-muted-foreground">Project</div>
          <div className="relative" style={{ width }}>{months.map(month => <span key={month} className="absolute top-4 whitespace-nowrap pl-2 text-xs text-muted-foreground" style={{ left: x(month) }}>{monthLabel(month)}</span>)}<span className="absolute bottom-0 -translate-x-1/2 rounded bg-primary px-1 text-[10px] text-primary-foreground" style={{ left: todayX }}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`))}</span></div>
        </div>
        {groups.map(group => <div key={group.id}>
          {group.name && <div className="sticky left-0 w-[var(--timeline-label-width)] border-y bg-muted px-4 py-2 text-xs font-medium">{group.name}</div>}
          {group.projects.map(project => {
            const datedMilestones = project.milestones.filter(item => item.deadline);
            const lanes: number[] = [];
            for (const [index, milestone] of datedMilestones.entries()) {
              const occupied = new Set(datedMilestones.slice(0, index).flatMap((other, previous) => Math.abs(x(other.deadline!) - x(milestone.deadline!)) < 24 ? [lanes[previous]] : []));
              let lane = 0;
              while (occupied.has(lane)) lane++;
              lanes.push(lane);
            }
            const height = Math.max(96, 88 + Math.max(0, ...lanes) * 24);
            return <div key={project.id} className="flex border-b border-border/50" style={{ height }} aria-label={`Timeline for ${project.name}`}>
            <div className="sticky left-0 z-10 flex w-[var(--timeline-label-width)] shrink-0 items-center gap-2 border-r bg-card px-4">
              <Link to={`/projects/${project.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"><IconCube aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{project.name}</span></Link>
              <ProgressRing label={project.name} done={project.done} total={project.total} percent={project.total ? Math.round(project.done / project.total * 100) : 0} showTotal={false} />
            </div>
            <div className="relative" style={{ width }}>
              {project.deadline ? <Link to={`/projects/${project.id}`} aria-label={`Open project ${project.name}, target ${formatDate(project.deadline)}`} title={`${project.name}: target ${formatDate(project.deadline)}`} className="absolute top-3 -translate-x-1/2 whitespace-nowrap rounded-md border bg-muted px-3 py-1.5 text-xs hover:bg-accent" style={{ left: x(project.deadline) }}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${project.deadline}T12:00:00Z`))}</Link> : <span className="absolute left-4 top-5 text-xs text-muted-foreground">Target date not set</span>}
              {datedMilestones.map((milestone, index) => <Link key={milestone.id} to={`/projects/${project.id}?milestone=${encodeURIComponent(milestone.id)}`} aria-label={`Open milestone ${milestone.title} in ${project.name}`} title={`${milestone.title}: ${formatDate(milestone.deadline)}`} className="absolute -translate-x-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" style={{ left: x(milestone.deadline!), top: 56 + lanes[index] * 24 }}><IconDiamonds aria-hidden="true" className="size-4" /></Link>)}
            </div>
          </div>; })}
        </div>)}
      </div>
    </div>}
  </section>;
}
