import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Label } from "@libs/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@libs/components/ui/popover";
import { Switch } from "@libs/components/ui/switch";
import { TaskLayoutSwitch } from "./TaskLayoutSwitch";
import { Choice, Field } from "./TaskEditor";
import {
  PERSONAL_TASK_COLUMNS,
  type PersonalTaskView,
} from "./personal-task-view";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  type ProjectWorkspace,
  type Task,
} from "./types";

export function PersonalTaskViewMenu({
  workspace,
  assigned,
  options,
  onChange,
  onReset,
}: {
  workspace: ProjectWorkspace;
  assigned: Task[];
  options: PersonalTaskView;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
}) {
  const active = [
    options.area,
    options.status,
    options.project,
    options.milestone,
  ].some((value) => value !== "all");
  const projectIds = new Set(assigned.map((task) => task.projectId));
  const milestoneIds = new Set(assigned.map((task) => task.milestoneId));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="relative shrink-0"
          aria-label="Task filters and view"
          title="Task filters and view"
        >
          <IconAdjustmentsHorizontal aria-hidden="true" className="size-4" />
          {active && (
            <span
              aria-label="Filters active"
              className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(80svh,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto"
      >
        <TaskLayoutSwitch
          value={options.view}
          onChange={(value) => onChange("view", value)}
        />
        <div className="space-y-3 [&>div]:grid [&>div]:grid-cols-[5.5rem_minmax(0,1fr)] [&>div]:items-center [&>div]:gap-3 [&>div]:space-y-0 [&_label]:text-xs [&_label]:text-muted-foreground">
          <Field id="personal-group" label="Grouping">
            <Choice
              id="personal-group"
              value={options.view === "board" ? "status" : options.group}
              disabled={options.view === "board"}
              onChange={(value) => onChange("group", value)}
              options={[
                { value: "due", label: "Due date" },
                { value: "status", label: "Status" },
                { value: "project", label: "Project" },
                { value: "milestone", label: "Milestone" },
                { value: "none", label: "No grouping" },
              ]}
            />
          </Field>
          <Field id="personal-sort" label="Ordering">
            <Choice
              id="personal-sort"
              value={options.sort}
              onChange={(value) => onChange("sort", value)}
              options={[
                { value: "deadline", label: "Due date" },
                { value: "title", label: "Title" },
                { value: "created", label: "Newest first" },
                { value: "priority", label: "Priority" },
              ]}
            />
          </Field>
          <Field id="personal-area" label="Area">
            <Choice
              id="personal-area"
              value={options.area}
              onChange={(value) => onChange("area", value)}
              options={[
                { value: "all", label: "All areas" },
                ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
          </Field>
          <Field id="personal-status" label="Status">
            <Choice
              id="personal-status"
              value={options.status}
              onChange={(value) => onChange("status", value)}
              options={[
                { value: "all", label: "All statuses" },
                ...TASK_STATUSES.map((value) => ({
                  value,
                  label: STATUS_LABELS[value],
                })),
              ]}
            />
          </Field>
          <Field id="personal-project" label="Project">
            <Choice
              id="personal-project"
              value={options.project}
              onChange={(value) => onChange("project", value)}
              options={[
                { value: "all", label: "All projects" },
                { value: "none", label: "No project" },
                ...workspace.projects
                  .filter((project) => projectIds.has(project.id))
                  .map((project) => ({
                    value: project.id,
                    label: project.name,
                  })),
              ]}
            />
          </Field>
          <Field id="personal-milestone" label="Milestone">
            <Choice
              id="personal-milestone"
              value={options.milestone}
              onChange={(value) => onChange("milestone", value)}
              options={[
                { value: "all", label: "All milestones" },
                { value: "none", label: "No milestone" },
                ...workspace.tasks
                  .filter(
                    (task) =>
                      task.kind === "milestone" &&
                      milestoneIds.has(task.id) &&
                      (options.project === "all" ||
                        task.projectId === options.project),
                  )
                  .map((task) => ({ value: task.id, label: task.title })),
              ]}
            />
          </Field>
        </div>
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="view-completed" className="font-normal">
              Completed tasks
            </Label>
            <Switch
              id="view-completed"
              checked={options.completed}
              onCheckedChange={(value) =>
                onChange("completed", value ? "show" : "hide")
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="view-cancelled" className="font-normal">
              Cancelled tasks
            </Label>
            <Switch
              id="view-cancelled"
              checked={options.cancelled}
              onCheckedChange={(value) =>
                onChange("cancelled", value ? "show" : "hide")
              }
            />
          </div>
        </div>
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Display properties</p>
          <div
            role="group"
            aria-label="Task display properties"
            className="flex flex-wrap gap-2"
          >
            {PERSONAL_TASK_COLUMNS.filter(
              ([key]) =>
                options.view !== "board" ||
                key !== "project",
            ).map(([key, label]) => (
              <Button
                key={key}
                className="rounded-full"
                size="sm"
                variant={
                  options.columns.includes(key) ? "secondary" : "outline"
                }
                aria-pressed={options.columns.includes(key)}
                onClick={() =>
                  onChange(
                    "columns",
                    PERSONAL_TASK_COLUMNS.map(([item]) => item)
                      .filter((item) =>
                        item === key
                          ? !options.columns.includes(item)
                          : options.columns.includes(item),
                      )
                      .join(","),
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <Button variant="ghost" className="w-full border-t" onClick={onReset}>
          Reset view and filters
        </Button>
      </PopoverContent>
    </Popover>
  );
}
