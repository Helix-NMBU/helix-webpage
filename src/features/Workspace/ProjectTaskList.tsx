import { useSearchParams } from "react-router-dom";
import { EmptyIllustration } from "../MemberPlatform/EmptyIllustration";
import { TaskBoard, type SaveBoardAssignees } from "../ProjectManagement/TaskBoard";
import { ProjectTaskViewMenu } from "./ProjectTaskViewMenu";
import { projectTaskView, visibleProjectTasks } from "./project-task-view";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import {
  TaskStatusControl,
  TaskStatusIcon,
  type SaveTaskStatus,
} from "../ProjectManagement/TaskStatus";
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
  milestones,
  selectedMilestone,
  onOpenMilestone,
  onCreateMilestone,
  workspace,
  busy,
  canCreate,
  filterLabel,
  onClear,
  onOpen,
  onStatusChange,
  onSaveAssignees,
  onCreate,
  boardKind = "milestone",
  heading,
  filterLabelText = "Milestone:",
}: {
  tasks: Task[];
  allTasks: Task[];
  milestones: Task[];
  selectedMilestone: string | null;
  onOpenMilestone: (milestone: Task) => void;
  onCreateMilestone: () => void;
  workspace: ProjectWorkspace;
  busy: boolean;
  canCreate: boolean;
  filterLabel: string | null;
  onClear: () => void;
  onOpen: (task: Task) => void;
  onStatusChange: SaveTaskStatus;
  onSaveAssignees?: SaveBoardAssignees;
  onCreate: () => void;
  boardKind?: "task" | "milestone";
  heading?: string;
  filterLabelText?: string;
}) {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const collapsed = (params.get("collapsed") ?? "").split(",").filter(Boolean);
  const options = projectTaskView(params);
  const board = options.view === "board";
  const allRecords = board
    ? boardKind === "task"
      ? allTasks
      : milestones
    : allTasks;
  const records = board
    ? allRecords.filter(
        (item) => !selectedMilestone || item.id === selectedMilestone,
      )
    : tasks;
  const visible = visibleProjectTasks(
    records,
    options,
    search,
    board ? boardKind : "task",
  );
  function change(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("cancelled");
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }
  function setSearch(value: string) {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value) next.set("search", value);
      else next.delete("search");
      return next;
    }, { replace: true });
  }
  function toggleCollapsed(status: string) {
    setParams(current => {
      const next = new URLSearchParams(current);
      const values = (current.get("collapsed") ?? "").split(",").filter(Boolean);
      const updated = values.includes(status) ? values.filter(value => value !== status) : [...values, status];
      if (updated.length) next.set("collapsed", updated.join(","));
      else next.delete("collapsed");
      return next;
    }, { replace: true });
  }
  function resetFilters() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of [
          "status",
          "priority",
          "assignee",
          "completed",
          "cancelled",
          "sort",
          "group",
          "search",
          "collapsed",
        ])
          next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  function clearAll() {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of [
          "milestone",
          "status",
          "priority",
          "assignee",
          "completed",
          "cancelled",
          "sort",
          "search",
          "collapsed",
        ])
          next.delete(key);
        return next;
      },
      { replace: true },
    );
  }
  const hidden = allRecords.length - visible.length;
  return (
    <section
      aria-label="Project tasks"
      className={
        board
          ? "flex h-full min-h-0 min-w-0 flex-col gap-4"
          : "min-w-0 space-y-4"
      }
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium">
          {heading ?? (board && boardKind === "milestone" ? "Milestones" : "Tasks")}{" "}
          <span className="ml-1 text-sm text-muted-foreground">
            {allRecords.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <ProjectTaskViewMenu
            workspace={workspace}
            options={options}
            onChange={change}
            onReset={resetFilters}
          />
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={board ? onCreateMilestone : onCreate}
            >
              {board ? "New milestone" : "New task"}
            </Button>
          )}
        </div>
      </div>
      <Input
        aria-label={
          board ? "Search project milestones" : "Search project tasks"
        }
        placeholder={board ? "Search milestones…" : "Search tasks…"}
        className="h-8 max-w-sm shrink-0"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {filterLabel && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{filterLabelText}</span>
          <span>{filterLabel}</span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear milestone filter
          </Button>
        </div>
      )}
      {board && boardKind === "milestone" && !milestones.length && <EmptyIllustration kind="diamond" />}
      {options.view === "board" ? (
        <TaskBoard
          tasks={visible}
          kind={boardKind}
          workspace={workspace}
          busy={busy}
          columns={["priority", "milestone", "assignee", "deadline"]}
          onOpen={boardKind === "milestone" ? onOpenMilestone : onOpen}
          onStatusChange={onStatusChange}
          onSaveAssignees={onSaveAssignees}
        />
      ) : (
        <div className="space-y-5">
          {(options.group === "none" ? [null] : TASK_STATUSES).map((status) => {
            const group = status
              ? visible.filter((task) => task.status === status)
              : visible;
            if (!group.length) return null;
            const open = !status || !collapsed.includes(status);
            const total = allTasks.filter(
              (task) => task.status === status,
            ).length;
            return (
              <section
                key={status ?? "all"}
                aria-label={
                  status ? `${STATUS_LABELS[status]} tasks` : "All tasks"
                }
              >
                {status && (
                  <button
                    type="button"
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left text-sm font-medium"
                    onClick={() => toggleCollapsed(status)}
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
                )}
                {open && (
                  <ul className="divide-y divide-border/50">
                    {group.map((task) => {
                      return (
                        <li
                          key={task.id}
                          className={`flex items-center gap-3 px-3 py-4 ${task.status === "done" || task.status === "cancelled" ? "text-muted-foreground" : ""}`}
                        >
                          <PriorityIndicator priority={task.priority} />
                          <TaskStatusControl
                            task={task}
                            workspace={workspace}
                            busy={busy}
                            onSave={onStatusChange}
                          />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              className="block w-full text-left text-sm leading-5 hover:underline"
                              onClick={() => onOpen(task)}
                            >
                              {task.title}
                            </button>
                            {task.status === "blocked" &&
                              task.blockedReason && (
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
      )}
      {!visible.length && options.view !== "board" && (
        <Empty className="min-h-48 border">
          {!milestones.length && !allTasks.length && <EmptyIllustration kind="diamond" />}
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
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          )}
        </Empty>
      )}
      {hidden > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 py-4 text-xs text-muted-foreground">
          <span>
            {hidden} {board ? "milestone" : "task"}
            {hidden === 1 ? "" : "s"} hidden by filters
          </span>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Clear filters
          </Button>
        </div>
      )}
    </section>
  );
}
