import { IconAdjustmentsHorizontal, IconList, IconTimelineEvent } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Choice, Field } from "../ProjectManagement/TaskEditor";
import { PROJECT_COLUMNS, type ProjectView } from "./project-view";
import type { WorkspaceDirectory } from "./types";

export function ProjectViewMenu({ data, options, onChange, onReset }: {
  data: WorkspaceDirectory; options: ProjectView;
  onChange: (key: string, value: string) => void; onReset: () => void;
}) {
  const active = options.department !== "all" || options.lead !== "all" || options.priority !== "all" || options.completion !== "all";
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="icon-sm" className="relative shrink-0" aria-label="Project filters and view" title="Project filters and view">
    <IconAdjustmentsHorizontal aria-hidden="true" className="size-4" />
    {active && <span aria-label="Filters active" className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />}
  </Button></PopoverTrigger><PopoverContent align="end" className="max-h-[min(80svh,45rem)] w-80 max-w-[calc(100vw-2rem)] space-y-5 overflow-y-auto">
    <div role="group" aria-label="Project layout" className="grid grid-cols-2 gap-2">
      <Button variant={options.view === "list" ? "secondary" : "outline"} aria-pressed={options.view === "list"} onClick={() => onChange("view", "list")}><IconList aria-hidden="true" className="size-4" />List</Button>
      <Button variant={options.view === "timeline" ? "secondary" : "outline"} aria-pressed={options.view === "timeline"} onClick={() => onChange("view", "timeline")}><IconTimelineEvent aria-hidden="true" className="size-4" />Timeline</Button>
    </div>
    <div className="space-y-3 [&>div]:grid [&>div]:grid-cols-[5.5rem_minmax(0,1fr)] [&>div]:items-center [&>div]:gap-3 [&>div]:space-y-0 [&_label]:text-xs [&_label]:text-muted-foreground">
      <Field id="project-filter-department" label="Department"><Choice id="project-filter-department" value={options.department} onChange={value => onChange("department", value)} options={[{ value: "all", label: "All departments" }, ...data.departments.map(item => ({ value: item.id, label: item.name }))]} /></Field>
      <Field id="project-filter-lead" label="Lead"><Choice id="project-filter-lead" value={options.lead} onChange={value => onChange("lead", value)} options={[{ value: "all", label: "All Leads" }, { value: "none", label: "No Lead" }, ...data.members.map(item => ({ value: item.id, label: item.name }))]} /></Field>
      <Field id="project-filter-priority" label="Priority"><Choice id="project-filter-priority" value={options.priority} onChange={value => onChange("priority", value)} options={[{ value: "all", label: "All priorities" }, ...["urgent", "high", "normal", "low", "none"].map(value => ({ value, label: value === "normal" ? "Medium" : value === "none" ? "No priority" : value[0].toUpperCase() + value.slice(1) }))]} /></Field>
      <Field id="project-filter-completion" label="Completion"><Choice id="project-filter-completion" value={options.completion} onChange={value => onChange("completion", value)} options={[{ value: "all", label: "All projects" }, { value: "open", label: "Not completed" }, { value: "completed", label: "Completed" }, { value: "empty", label: "No tasks yet" }]} /></Field>
      <Field id="project-group" label="Grouping"><Choice id="project-group" value={options.group} onChange={value => onChange("group", value)} options={[{ value: "none", label: "No grouping" }, { value: "department", label: "Department" }, { value: "lead", label: "Lead" }]} /></Field>
      <Field id="project-sort" label="Ordering"><Choice id="project-sort" value={options.sort} onChange={value => onChange("sort", value)} options={[{ value: "deadline", label: "Target date" }, { value: "start", label: "Start date" }, { value: "name", label: "Name" }, { value: "priority", label: "Priority" }, { value: "progress", label: "Progress" }]} /></Field>
    </div>
    {options.view === "list" && <div className="space-y-3 border-t pt-4"><p className="text-sm font-medium">Display properties</p><div role="group" aria-label="Project display properties" className="flex flex-wrap gap-2">{PROJECT_COLUMNS.map(([key, label]) => <Button key={key} className="rounded-full" size="sm" variant={options.columns.includes(key) ? "secondary" : "outline"} aria-pressed={options.columns.includes(key)} onClick={() => onChange("columns", PROJECT_COLUMNS.map(([item]) => item).filter(item => item === key ? !options.columns.includes(item) : options.columns.includes(item)).join(","))}>{label}</Button>)}</div></div>}
    <Button variant="ghost" className="w-full border-t" onClick={onReset}>Reset view and filters</Button>
  </PopoverContent></Popover>;
}
