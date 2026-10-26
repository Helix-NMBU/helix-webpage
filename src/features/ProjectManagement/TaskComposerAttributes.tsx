import type { ReactNode } from "react";
import {
  IconCircleDashed,
  IconCircleHalf2,
  IconCircleCheck,
  IconCircleOff,
  IconAlertCircle,
  IconCube,
  IconDiamonds,
  IconDots,
} from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@libs/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { AssigneePicker } from "./TaskAssignees";
import { Field } from "./TaskEditor";
import { PriorityGlyph } from "./PriorityGlyph";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  type TaskInput,
  type ProjectWorkspace,
} from "./types";
import { formatDate } from "./model";
import { compatibleMilestones } from "./progress";
const statusIcons = {
  todo: IconCircleDashed,
  in_progress: IconCircleHalf2,
  blocked: IconAlertCircle,
  done: IconCircleCheck,
  cancelled: IconCircleOff,
};
function AttributeChoice({
  id,
  label,
  value,
  icon,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  icon: ReactNode;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={label}
        className="max-w-60 gap-2 rounded-full bg-muted/40 px-3 shadow-none [&>svg:last-child]:hidden"
      >
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          {icon}
        </span>
        <SelectValue className="min-w-0 truncate" />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function TaskComposerAttributes({
  draft,
  workspace,
  busy,
  details,
  onDetails,
  onChange,
}: {
  draft: TaskInput;
  workspace: ProjectWorkspace;
  busy: boolean;
  details: boolean;
  onDetails: () => void;
  onChange: <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => void;
}) {
  const StatusIcon = statusIcons[draft.status];
  const milestones = compatibleMilestones(workspace.tasks, draft);
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3">
      <AttributeChoice
        id="new-task-status"
        label="Status"
        value={draft.status}
        onChange={(value) => onChange("status", value as TaskInput["status"])}
        icon={<StatusIcon className="size-4" />}
        disabled={busy}
        options={TASK_STATUSES.map((value) => ({
          value,
          label: STATUS_LABELS[value],
        }))}
      />
      <AttributeChoice
        id="new-task-priority"
        label="Priority"
        value={draft.priority}
        onChange={(value) =>
          onChange("priority", value as TaskInput["priority"])
        }
        icon={<PriorityGlyph priority={draft.priority} />}
        disabled={busy}
        options={TASK_PRIORITIES.map((value) => ({
          value,
          label:
            value === "normal"
              ? "Medium"
              : value[0].toUpperCase() + value.slice(1),
        }))}
      />
      <div className="max-w-56 [&>button]:w-auto [&>button]:min-w-32 [&>button]:rounded-full [&>button]:bg-muted/40">
        <AssigneePicker
          assignmentRole={draft.kind === "milestone" ? "lead" : "assignee"}
          id="new-task-assignee"
          disabled={busy}
          value={draft.assigneeIds}
          onChange={(value) => onChange("assigneeIds", value)}
          members={workspace.members}
        />
      </div>
      <AttributeChoice
        id="new-task-project"
        label="Related project"
        value={draft.projectId ?? "none"}
        onChange={(value) =>
          onChange("projectId", value === "none" ? null : value)
        }
        icon={<IconCube className="size-4" />}
        disabled={busy}
        options={[
          { value: "none", label: "Choose project" },
          ...workspace.projects
            .filter((project) => project.category === draft.category)
            .map((project) => ({ value: project.id, label: project.name })),
        ]}
      />
      {draft.kind === "task" && (
        <AttributeChoice
          id="new-task-milestone"
          label="Milestone"
          value={draft.milestoneId ?? "none"}
          onChange={(value) =>
            onChange("milestoneId", value === "none" ? null : value)
          }
          icon={<IconDiamonds className="size-4" />}
          disabled={busy}
          options={[
            { value: "none", label: "Choose milestone" },
            ...milestones.map((item) => ({
              value: item.id,
              label: item.title,
            })),
          ]}
        />
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="h-9 rounded-full bg-muted/40 px-3 font-normal"
          >
            {draft.deadline ? formatDate(draft.deadline) : "Due date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <Field id="new-task-deadline" label="Due date">
            <Input
              id="new-task-deadline"
              type="date"
              disabled={busy}
              min={draft.startDate ?? "2000-01-01"}
              max="2100-12-31"
              value={draft.deadline ?? ""}
              onChange={(event) =>
                onChange("deadline", event.target.value || null)
              }
            />
          </Field>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={busy}
        aria-label={details ? "Fewer details" : "More details"}
        title={details ? "Fewer details" : "More details"}
        aria-expanded={details}
        className="size-9 rounded-full bg-muted/40"
        onClick={onDetails}
      >
        <IconDots aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
