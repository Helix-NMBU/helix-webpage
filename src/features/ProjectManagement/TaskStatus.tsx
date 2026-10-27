import { useId, useRef, useState, type FormEvent } from "react";
import {
  IconCircleMinus,
  IconCheck,
  IconCircle,
  IconCircleCheck,
  IconCircleDotted,
  IconCircleHalf,
  IconCircleOff,
} from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@libs/components/ui/command";
import { Label } from "@libs/components/ui/label";
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
import { Textarea } from "@libs/components/ui/textarea";
import { canChangeTaskStatus } from "./task-status-permissions";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  STATUS_LABELS,
  TASK_WORKFLOW_STATUSES,
  type ProjectWorkspace,
  type Task,
  type TaskStatus,
} from "./types";

const icons = {
  backlog: IconCircleDotted,
  todo: IconCircle,
  in_progress: IconCircleHalf,
  done: IconCircleCheck,
  blocked: IconCircleMinus,
  cancelled: IconCircleOff,
};
const colors = {
  backlog: "text-muted-foreground",
  todo: "text-muted-foreground",
  in_progress: "text-yellow-400",
  done: "text-primary",
  blocked: "text-[oklch(0.577_0.245_27.325)]",
  cancelled: "text-muted-foreground",
};

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const Icon = icons[status];
  return (
    <Icon
      aria-hidden="true"
      data-task-status={status}
      className={`size-4 shrink-0 ${colors[status]} ${status === "done" || status === "blocked" ? "[&>path:first-of-type]:fill-current [&>path:last-of-type]:stroke-background" : ""}`}
    >
      {status === "in_progress" && (
        <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
      )}
    </Icon>
  );
}
export function TaskStatusIndicator({
  status,
  showLabel = true,
}: {
  status: TaskStatus;
  showLabel?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2"
      title={STATUS_LABELS[status]}
      role={showLabel ? undefined : "img"}
      aria-label={showLabel ? undefined : STATUS_LABELS[status]}
    >
      <TaskStatusIcon status={status} />
      {showLabel && STATUS_LABELS[status]}
    </span>
  );
}
export function TaskStatusSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: TaskStatus;
  onChange: (value: TaskStatus) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(value) => onChange(value as TaskStatus)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label="Status" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {value === "cancelled" && (
          <SelectItem value="cancelled" disabled>
            <TaskStatusIndicator status="cancelled" />
          </SelectItem>
        )}
        {TASK_WORKFLOW_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <TaskStatusIndicator status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export type SaveTaskStatus = (
  task: Task,
  status: TaskStatus,
  blockedReason: string,
) => Promise<boolean>;

export function TaskStatusControl({
  task,
  workspace,
  busy,
  onSave,
  showLabel = false,
}: {
  task: Task;
  workspace: ProjectWorkspace;
  busy: boolean;
  onSave: SaveTaskStatus;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState(task.blockedReason);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const id = useId();
  const notify = useNotify();
  const allowed = canChangeTaskStatus(task, workspace);
  const disabled = busy || pending || !allowed;
  async function save(status: TaskStatus, blockedReason = "") {
    if (disabled || saving.current) return;
    saving.current = true;
    setPending(true);
    try {
      if (await onSave(task, status, blockedReason)) setOpen(false);
    } catch (error) {
      notify(
        "Could not change status",
        error instanceof Error
          ? error.message
          : "Try again. Your input has been kept.",
        { variant: "error", href: null },
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  function choose(status: TaskStatus) {
    if (disabled) return;
    if (status === "blocked") {
      setBlocking(true);
      return;
    }
    if (status === task.status) {
      setOpen(false);
      return;
    }
    void save(status);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim() || reason.trim().length > 500) {
      notify(
        "Add a blocking reason",
        "Describe what is blocking this task in up to 500 characters.",
        { variant: "warning", href: null },
      );
      return;
    }
    void save("blocked", reason.trim());
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!disabled && !saving.current) {
          setOpen(next);
          if (next) {
            setBlocking(false);
            setReason(task.blockedReason);
          }
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "sm" : "icon-sm"}
          disabled={disabled}
          aria-label={`Change status for ${task.title}`}
          aria-describedby={`${id}-current`}
          title={STATUS_LABELS[task.status]}
          className={
            showLabel
              ? "-mx-2 h-8 justify-start px-2 font-normal"
              : "size-8 shrink-0"
          }
        >
          <TaskStatusIcon status={task.status} />
          {showLabel && STATUS_LABELS[task.status]}
        </Button>
      </PopoverTrigger>
      <span id={`${id}-current`} className="sr-only">
        Current status: {STATUS_LABELS[task.status]}
      </span>
      <PopoverContent
        align="start"
        className="w-56 p-0"
        aria-label={`Status for ${task.title}`}
      >
        {blocking ? (
          <form onSubmit={submit} className="space-y-2 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TaskStatusIcon status="blocked" />
              Blocked
            </div>
            <Label htmlFor={`${id}-reason`}>Blocked reason</Label>
            <Textarea
              id={`${id}-reason`}
              aria-label="Blocked reason"
              autoFocus
              required
              maxLength={500}
              disabled={disabled}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What needs to be resolved?"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setBlocking(false)}
              >
                Back
              </Button>
              <Button type="submit" size="sm" disabled={disabled}>
                {pending ? "Saving…" : "Save status"}
              </Button>
            </div>
          </form>
        ) : (
          <Command defaultValue={STATUS_LABELS[task.status]}>
            <CommandInput
              autoFocus
              placeholder="Change status…"
              aria-label="Find task status"
              className="h-8"
            />
            <CommandList aria-label="Task status">
              <CommandEmpty>No matching status.</CommandEmpty>
              <CommandGroup>
                {TASK_WORKFLOW_STATUSES.map((status) => (
                  <CommandItem
                    key={status}
                    value={STATUS_LABELS[status]}
                    aria-label={STATUS_LABELS[status]}
                    disabled={disabled}
                    onSelect={() => choose(status)}
                    className="gap-2 px-2 py-1"
                  >
                    <TaskStatusIcon status={status} />
                    <span className="flex-1">{STATUS_LABELS[status]}</span>
                    {task.status === status && (
                      <IconCheck className="size-4" aria-hidden="true" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
