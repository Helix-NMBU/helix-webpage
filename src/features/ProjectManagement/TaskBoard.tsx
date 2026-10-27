import { useId } from "react";
import { useTaskBoardDrag } from "./useTaskBoardDrag";
import { BlockedTaskDropDialog } from "./BlockedTaskDropDialog";
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
  const drag = useTaskBoardDrag(tasks, workspace, busy, onStatusChange);
  const instructionsId = useId();
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
    <>
      <p id={instructionsId} className="sr-only">
        Drag tasks between columns or use the status menu. Moving to Blocked
        requires a reason.
      </p>
      <div
        ref={drag.boardRef}
        onDragOver={drag.boardOver}
        onDragLeave={drag.boardLeave}
        aria-describedby={instructionsId}
        aria-busy={busy || drag.pending}
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
              onDragOver={(event) => drag.enter(event, status)}
              onDragLeave={(event) => drag.leave(event, status)}
              onDrop={(event) => drag.drop(event, status)}
              className={`flex min-w-72 flex-1 flex-col rounded-xl p-2 transition-colors ${drag.over === status ? "bg-accent ring-2 ring-inset ring-primary" : "bg-muted/40"}`}
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
                      draggable={drag.canDrag(task)}
                      onDragStart={(event) => drag.start(event, task)}
                      onDragEnd={drag.end}
                      onClickCapture={drag.preventDragClick}
                      className={`relative h-32 min-h-32 shrink-0 gap-0 py-2.5 transition-colors hover:border-muted-foreground/40 ${drag.canDrag(task) ? "cursor-grab active:cursor-grabbing" : ""} ${drag.draggingId === task.id ? "opacity-50" : ""}`}
                      role="article"
                      aria-label={task.title}
                    >
                      <CardContent className="h-full min-w-0 justify-between gap-0 px-2.5">
                        <div className="flex h-10 min-w-0 shrink-0 items-start gap-1.5">
                          <div className="relative z-10 -ml-1 -mt-1">
                            <TaskStatusControl
                              task={task}
                              workspace={workspace}
                              busy={busy || drag.locked}
                              onSave={onStatusChange}
                            />
                          </div>
                          <button
                            type="button"
                            title={task.title}
                            className="min-w-0 flex-1 text-left text-sm font-medium leading-5 after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                            onClick={() => onOpen(task)}
                          >
                            <span className="line-clamp-2 [overflow-wrap:anywhere]">
                              {task.title}
                            </span>
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
                        <div className="flex h-6 min-w-0 shrink-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
                          {show("priority") && (
                            <span className="shrink-0">
                              <PriorityIndicator priority={task.priority} />
                            </span>
                          )}
                          {show("project") && project && (
                            <Link
                              draggable={false}
                              to={`/projects/${project.id}`}
                              title={project.name}
                              className="relative z-10 inline-flex h-6 min-w-0 max-w-40 flex-1 items-center gap-1 rounded-full border px-2 hover:bg-accent"
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
                              draggable={false}
                              to={`/projects/${project.id}?milestone=${milestone.id}`}
                              title={milestone.title}
                              className="relative z-10 inline-flex h-6 min-w-0 max-w-40 flex-1 items-center gap-1 rounded-full border px-2 hover:bg-accent"
                            >
                              <IconDiamonds
                                aria-hidden="true"
                                className="size-3.5 shrink-0"
                              />
                              <span className="truncate">
                                {milestone.title}
                              </span>
                            </Link>
                          )}
                          {show("partner") && task.partnerName && (
                            <button
                              type="button"
                              onClick={() => onOpen(task)}
                              className="relative z-10 h-6 min-w-0 max-w-40 flex-1 truncate rounded-full border px-2 text-left leading-[22px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={task.partnerName}
                            >
                              {task.partnerName}
                            </button>
                          )}
                        </div>
                        <div className="flex h-4 min-w-0 shrink-0 items-center gap-2 text-xs leading-4">
                          {task.status === "blocked" && task.blockedReason && (
                            <button
                              type="button"
                              onClick={() => onOpen(task)}
                              className="relative z-10 min-w-0 flex-1 truncate text-left text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title={task.blockedReason}
                            >
                              {task.blockedReason}
                            </button>
                          )}
                          {show("deadline") && (
                            <span
                              className={`shrink-0 ${overdue ? "text-[oklch(0.577_0.245_27.325)]" : "text-muted-foreground"}`}
                            >
                              {task.deadline ? (
                                <TargetDate deadline={task.deadline} />
                              ) : (
                                "No due date"
                              )}
                            </span>
                          )}
                        </div>
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
      {drag.blockedTask && (
        <BlockedTaskDropDialog
          key={`${drag.blockedTask.id}-${drag.blockedTask.revision}`}
          task={drag.blockedTask}
          busy={busy || drag.pending}
          onClose={drag.closeBlocked}
          onSave={drag.saveBlocked}
        />
      )}
    </>
  );
}
