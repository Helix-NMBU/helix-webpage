import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { TaskStatusControl, TaskStatusIcon, type SaveTaskStatus } from "../ProjectManagement/TaskStatus";
import { Input } from "@libs/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@libs/components/ui/empty";
import { AssigneeAvatars } from "../ProjectManagement/TaskAssignees";
import {
  PriorityIndicator,
  TargetDate,
} from "../ProjectManagement/MilestoneTableControls";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type ProjectWorkspace,
  type Task,
} from "../ProjectManagement/types";
export function ProjectTaskList({
  tasks,
  allTasks,
  workspace,
  busy,
  canCreate,
  filterLabel,
  onClear,
  onOpen,
  onStatusChange,
  onCreate,
}: {
  tasks: Task[];
  allTasks: Task[];
  workspace: ProjectWorkspace;
  busy: boolean;
  canCreate: boolean;
  filterLabel: string | null;
  onClear: () => void;
  onOpen: (task: Task) => void;
  onStatusChange: SaveTaskStatus;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const visible = tasks.filter((task) =>
    `${task.title} ${task.description} ${task.partnerName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const hidden = allTasks.length - visible.length;
  return (
    <section aria-label="Project tasks" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium">
          Tasks{" "}
          <span className="ml-1 text-sm text-muted-foreground">
            {allTasks.length}
          </span>
        </h2>
        {canCreate && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onCreate}
          >
            New task
          </Button>
        )}
      </div>
      <Input
        aria-label="Search project tasks"
        placeholder="Search tasks…"
        className="h-8 max-w-sm"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {filterLabel && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Milestone:</span>
          <span>{filterLabel}</span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear milestone filter
          </Button>
        </div>
      )}
      <div className="space-y-5">
        {TASK_STATUSES.map((status) => {
          const group = visible.filter((task) => task.status === status);
          if (!group.length) return null;
          const open = !collapsed.includes(status);
          const total = allTasks.filter(
            (task) => task.status === status,
          ).length;
          return (
            <section key={status} aria-label={`${STATUS_LABELS[status]} tasks`}>
              <button
                type="button"
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left text-sm font-medium"
                onClick={() =>
                  setCollapsed((values) =>
                    values.includes(status)
                      ? values.filter((value) => value !== status)
                      : [...values, status],
                  )
                }
              >
                <IconChevronDown
                  aria-hidden="true"
                  className={`size-3.5 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
                />
                <TaskStatusIcon status={status} />
                {STATUS_LABELS[status]}
                <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                  {group.length}
                  {group.length !== total ? ` / ${total}` : ""}
                </span>
              </button>
              {open && (
                <ul className="divide-y divide-border/50">
                  {group.map((task) => {
                    return (
                      <li
                        key={task.id}
                        className={`flex items-center gap-3 px-3 py-4 ${status === "done" || status === "cancelled" ? "text-muted-foreground" : ""}`}
                      >
                        <PriorityIndicator priority={task.priority} />
                        <TaskStatusControl task={task} workspace={workspace} busy={busy} onSave={onStatusChange} />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="block w-full text-left text-sm leading-5 hover:underline"
                            onClick={() => onOpen(task)}
                          >
                            {task.title}
                          </button>
                          {task.status === "blocked" && task.blockedReason && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {task.blockedReason}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0">
                          <AssigneeAvatars
                            assigneeIds={task.assigneeIds}
                            members={workspace.members}
                          />
                        </span>
                        <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline">
                          <TargetDate deadline={task.deadline} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {!visible.length && (
        <Empty className="min-h-48 border">
          <EmptyHeader>
            <EmptyTitle>
              {allTasks.length ? "No matching tasks" : "No tasks yet"}
            </EmptyTitle>
            <EmptyDescription>
              {allTasks.length
                ? "Choose another milestone or clear the filters."
                : "Tasks added to this project’s milestones will appear here."}
            </EmptyDescription>
          </EmptyHeader>
          {(filterLabel || search) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                onClear();
              }}
            >
              Clear filters
            </Button>
          )}
        </Empty>
      )}
      {hidden > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-4 text-xs text-muted-foreground">
          <span>
            {hidden} task{hidden === 1 ? "" : "s"} hidden by filters
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              onClear();
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}
