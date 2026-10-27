import { IconAdjustmentsHorizontal } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@libs/components/ui/popover";
import { Label } from "@libs/components/ui/label";
import { Switch } from "@libs/components/ui/switch";
import { TaskLayoutSwitch } from "../ProjectManagement/TaskLayoutSwitch";
import { Choice, Field } from "../ProjectManagement/TaskEditor";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type ProjectWorkspace,
} from "../ProjectManagement/types";
import type { ProjectTaskView } from "./project-task-view";

export function ProjectTaskViewMenu({
  workspace,
  options,
  onChange,
  onReset,
}: {
  workspace: ProjectWorkspace;
  options: ProjectTaskView;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
}) {
  const active =
    options.status !== "all" ||
    options.priority !== "all" ||
    options.assignee !== "all" ||
    !options.completed ||
    !options.cancelled;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="relative"
          aria-label="Project task filters and view"
          title="Project task filters and view"
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
        className="max-h-[min(80svh,var(--radix-popover-content-available-height))] w-80 space-y-4 overflow-y-auto"
      >
        <TaskLayoutSwitch
          value={options.view}
          onChange={(value) => onChange("view", value)}
        />
        <div className="space-y-3 [&>div]:grid [&>div]:grid-cols-[5.5rem_minmax(0,1fr)] [&>div]:items-center [&>div]:gap-3 [&>div]:space-y-0 [&_label]:text-xs [&_label]:text-muted-foreground">
          <Field id="project-task-status" label="Status">
            <Choice
              id="project-task-status"
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
          <Field
            id="project-task-assignee"
            label={options.view === "board" ? "Lead" : "Assignee"}
          >
            <Choice
              id="project-task-assignee"
              value={options.assignee}
              onChange={(value) => onChange("assignee", value)}
              options={[
                {
                  value: "all",
                  label:
                    options.view === "board" ? "All leads" : "All assignees",
                },
                { value: "none", label: "Unassigned" },
                ...workspace.members.map((member) => ({
                  value: member.id,
                  label: member.name,
                })),
              ]}
            />
          </Field>
          <Field id="project-task-priority" label="Priority">
            <Choice
              id="project-task-priority"
              value={options.priority}
              onChange={(value) => onChange("priority", value)}
              options={[
                { value: "all", label: "All priorities" },
                ...["urgent", "high", "normal", "low"].map((value) => ({
                  value,
                  label:
                    value === "normal"
                      ? "Medium"
                      : value[0].toUpperCase() + value.slice(1),
                })),
              ]}
            />
          </Field>
          <Field id="project-task-sort" label="Ordering">
            <Choice
              id="project-task-sort"
              value={options.sort}
              onChange={(value) => onChange("sort", value)}
              options={[
                { value: "deadline", label: "Due date" },
                { value: "title", label: "Title" },
                { value: "priority", label: "Priority" },
                { value: "created", label: "Newest first" },
              ]}
            />
          </Field>
        </div>
        {(
          [
            [
              "completed",
              options.view === "board"
                ? "Completed milestones"
                : "Completed tasks",
              options.completed,
            ],
            [
              "cancelled",
              options.view === "board"
                ? "Cancelled milestones"
                : "Cancelled tasks",
              options.cancelled,
            ],
          ] as const
        ).map(([key, label, checked]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <Label htmlFor={`project-task-${key}`} className="font-normal">
              {label}
            </Label>
            <Switch
              id={`project-task-${key}`}
              checked={checked}
              onCheckedChange={(value) =>
                onChange(key, value ? "show" : "hide")
              }
            />
          </div>
        ))}
        <Button variant="ghost" className="w-full border-t" onClick={onReset}>
          Reset {options.view === "board" ? "milestone" : "task"} filters
        </Button>
      </PopoverContent>
    </Popover>
  );
}
