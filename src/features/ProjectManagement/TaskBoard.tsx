import { Link } from "react-router-dom";
import { IconCube, IconDiamonds } from "@tabler/icons-react";
import { Card, CardContent } from "@libs/components/ui/card";
import { AssigneeAvatars } from "./TaskAssignees";
import {
  TaskStatusControl,
  TaskStatusIcon,
  type SaveTaskStatus,
} from "./TaskStatus";
import { PriorityIndicator, TargetDate } from "./MilestoneTableControls";
import { osloDate } from "./model";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type ProjectWorkspace,
  type Task,
} from "./types";
import type { PersonalTaskColumn } from "./personal-task-view";

export function TaskBoard({
  tasks,
  workspace,
  busy,
  columns,
  onOpen,
  onStatusChange,
}: {
  tasks: Task[];
  workspace: ProjectWorkspace;
  busy: boolean;
  columns: readonly PersonalTaskColumn[];
  onOpen: (task: Task) => void;
  onStatusChange: SaveTaskStatus;
}) {
  const projects = new Map(
    workspace.projects.map((project) => [project.id, project]),
  );
  const milestones = new Map(
    workspace.tasks
      .filter((task) => task.kind === "milestone")
      .map((task) => [task.id, task]),
  );
  const records = tasks.filter((task) => task.kind === "task");
  const today = osloDate();
  const show = (property: PersonalTaskColumn) => columns.includes(property);
  return (
    <div
      role="region"
      aria-label="Task board"
      tabIndex={0}
      className="flex h-[min(65svh,42rem)] min-h-72 min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-3"
    >
      {TASK_STATUSES.filter(
        (status) =>
          status !== "cancelled" ||
          records.some((task) => task.status === status),
      ).map((status) => {
        const group = records.filter((task) => task.status === status);
        return (
          <section
            key={status}
            aria-label={`${STATUS_LABELS[status]} column`}
            className="flex min-w-72 flex-1 flex-col rounded-xl bg-muted/40 p-2"
          >
            <h3 className="flex shrink-0 items-center gap-2 px-2 py-3 text-sm font-medium">
              <TaskStatusIcon status={status} />
              {STATUS_LABELS[status]}
              <span
                className="text-xs tabular-nums text-muted-foreground"
                aria-label={`${group.length} task${group.length === 1 ? "" : "s"}`}
              >
                {group.length}
              </span>
            </h3>
            <div
              tabIndex={0}
              role="region"
              aria-label={`${STATUS_LABELS[status]} cards`}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-0.5 pb-1"
            >
              {group.map((task) => {
                const project = projects.get(task.projectId ?? "");
                const candidate = milestones.get(task.milestoneId ?? "");
                const milestone =
                  candidate?.projectId === task.projectId
                    ? candidate
                    : undefined;
                const closed =
                  task.status === "done" || task.status === "cancelled";
                const overdue =
                  !closed && task.deadline && task.deadline < today;
                return (
                  <Card
                    key={task.id}
                    className="relative gap-0 py-3 transition-colors hover:border-muted-foreground/40"
                    role="article"
                    aria-label={task.title}
                  >
                    <CardContent className="space-y-3 px-3">
                      <div className="flex items-start gap-2">
                        <div className="relative z-10 -ml-1 -mt-1">
                          <TaskStatusControl
                            task={task}
                            workspace={workspace}
                            busy={busy}
                            onSave={onStatusChange}
                          />
                        </div>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-sm font-medium leading-5 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                          onClick={() => onOpen(task)}
                        >
                          {task.title}
                        </button>
                        {show("assignee") && (
                          <span className="relative z-10 shrink-0">
                            <AssigneeAvatars
                              assigneeIds={task.assigneeIds}
                              members={workspace.members}
                              maxVisible={2}
                            />
                          </span>
                        )}
                      </div>
                      {task.status === "blocked" && task.blockedReason && (
                        <p className="line-clamp-3 text-xs text-muted-foreground">
                          {task.blockedReason}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {show("priority") && (
                          <PriorityIndicator priority={task.priority} />
                        )}
                        {show("project") && project && (
                          <Link
                            to={`/projects/${project.id}`}
                            title={project.name}
                            className="relative z-10 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 hover:bg-accent"
                          >
                            <IconCube
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        )}
                        {show("milestone") && milestone && project && (
                          <Link
                            to={`/projects/${project.id}?milestone=${milestone.id}`}
                            title={milestone.title}
                            className="relative z-10 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 hover:bg-accent"
                          >
                            <IconDiamonds
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            <span className="truncate">{milestone.title}</span>
                          </Link>
                        )}
                        {show("partner") && task.partnerName && (
                          <span className="truncate">{task.partnerName}</span>
                        )}
                      </div>
                      {show("deadline") && (
                        <div
                          className={`text-xs ${overdue ? "text-[oklch(0.577_0.245_27.325)]" : "text-muted-foreground"}`}
                        >
                          {task.deadline ? (
                            <TargetDate deadline={task.deadline} />
                          ) : (
                            "No due date"
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {!group.length && (
                <p className="px-2 py-4 text-xs text-muted-foreground">
                  No tasks
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
