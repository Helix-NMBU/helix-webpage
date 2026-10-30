import { useId, useState } from "react";
import { useTaskBoardDrag } from "./useTaskBoardDrag";
import { BlockedTaskDropDialog } from "./BlockedTaskDropDialog";
import { Link } from "react-router-dom";
import { IconCube, IconDiamonds, IconUserPlus } from "@tabler/icons-react";
import { Card, CardContent } from "@libs/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { AssigneeAvatars, AssigneePicker } from "./TaskAssignees";
import { canManageTask } from "./permissions";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  TaskStatusControl,
  TaskStatusIcon,
  type SaveTaskStatus,
} from "./TaskStatus";
import { MilestoneDateControl, MilestonePriorityControl, PriorityIndicator, TargetDate } from "./MilestoneTableControls";
import { ProgressRing } from "./ProgressRing";
import { milestoneProgress } from "./progress";
import { osloDate } from "./model";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  type ProjectWorkspace,
  type ProjectMutation,
  type Task,
  type TaskInput,
} from "./types";
import type { PersonalTaskColumn } from "./personal-task-view";

export type SaveBoardAssignees = (task: Task, assigneeIds: string[]) => Promise<boolean>;
export type TaskPropertyChanges = Partial<Pick<TaskInput, "priority" | "assigneeIds" | "deadline" | "milestoneId">>;
export type SaveTaskProperties = (task: Task, changes: TaskPropertyChanges) => Promise<boolean>;
export function boardPropertyMutation(task: Task, changes: TaskPropertyChanges): ProjectMutation {
  if (task.kind === "milestone" && "milestoneId" in changes) throw new Error("A milestone cannot be assigned to another milestone.");
  return task.kind === "milestone"
    ? { action: "update_milestone", id: task.id, expectedRevision: task.revision, changes }
    : { action: "save_task", id: task.id, expectedRevision: task.revision, task: { ...task, ...changes } };
}

export function MilestonePill({ milestone, projectId }: { milestone: Task; projectId: string }) {
  return <Link draggable={false} to={`/projects/${projectId}?milestone=${encodeURIComponent(milestone.id)}`} title={milestone.title} aria-label={`Open milestone ${milestone.title}`} className="relative z-10 inline-flex h-6 min-w-0 max-w-40 items-center gap-1.5 rounded-full border px-2 text-xs text-muted-foreground hover:bg-accent"><IconDiamonds aria-hidden="true" className="size-3.5 shrink-0 text-primary" /><span className="truncate">{milestone.title}</span></Link>;
}

export function TaskMilestoneControl({ task, workspace, busy, onSave, compact = false, property = false }: { task: Task; workspace: ProjectWorkspace; busy: boolean; onSave: SaveTaskProperties; compact?: boolean; property?: boolean }) {
  const milestones = workspace.tasks.filter(item => item.kind === "milestone" && item.projectId === task.projectId);
  return <Select value={task.milestoneId ?? "none"} disabled={busy} onValueChange={value => void onSave(task, { milestoneId: value })}>
    <SelectTrigger aria-label={`Change milestone for ${task.title}`} className={compact ? "size-8 justify-center border-transparent bg-transparent p-0 shadow-none hover:bg-muted [&>svg:last-child]:hidden" : property ? "-mx-2 h-8 max-w-full gap-2 border-transparent bg-transparent px-2 shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted [&>svg:last-child]:opacity-0" : "h-7 max-w-40 gap-1 px-2 text-xs"}><IconDiamonds aria-hidden="true" fill={property && task.milestoneId ? "currentColor" : "none"} className={`size-3.5 shrink-0 ${property && task.milestoneId ? "text-primary" : ""}`} />{compact ? <span className="sr-only"><SelectValue placeholder="No milestone" /></span> : <SelectValue placeholder="No milestone" />}</SelectTrigger>
    <SelectContent position="popper" align="start">{!task.milestoneId && <SelectItem value="none" disabled>No milestone</SelectItem>}{milestones.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent>
  </Select>;
}
export function boardAssignmentMutation(task: Task, assigneeIds: string[]): ProjectMutation {
  return boardPropertyMutation(task, { assigneeIds });
}

export function BoardAssignees({ task, workspace, busy, onSave, onOpen }: { task: Task; workspace: ProjectWorkspace; busy: boolean; onSave?: SaveBoardAssignees; onOpen: (task: Task) => void }) {
  const [draft, setDraft] = useState(task.assigneeIds);
  const notify = useNotify();
  if (!onSave || !canManageTask(task, workspace)) return task.assigneeIds.length ? <AssigneeAvatars assigneeIds={task.assigneeIds} members={workspace.members} maxVisible={2} assignmentRole={task.kind === "milestone" ? "lead" : "assignee"} /> : <span role="img" aria-label={task.kind === "milestone" ? "No leads" : "Unassigned"} title={task.kind === "milestone" ? "No leads" : "Unassigned"} className="flex size-7 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"><IconUserPlus aria-hidden="true" className="size-4" /></span>;
  return <AssigneePicker id={`board-assignees-${task.id}`} value={draft} members={workspace.members} onChange={setDraft} disabled={busy} assignmentRole={task.kind === "milestone" ? "lead" : "assignee"} inline inlineShowNames={false} emptyIcon triggerLabel={`${task.kind === "milestone" ? "Assign leads to" : "Assign"} ${task.title}`} onOpenChange={() => setDraft(task.assigneeIds)} onCommit={ids => {
    if (task.kind === "task" && (!task.projectId || !task.milestoneId)) {
      notify("Organize this task first", "Choose a project and milestone before assigning this task.", { variant: "warning", href: null, action: { label: "Open task", onClick: () => onOpen(task) } });
      return Promise.resolve(false);
    }
    return onSave(task, ids);
  }} />;
}

export function TaskBoard({
  tasks,
  kind = "task",
  workspace,
  busy,
  columns,
  onOpen,
  onStatusChange,
  onSaveAssignees,
  onSaveProperties,
}: {
  tasks: Task[];
  kind?: Task["kind"];
  workspace: ProjectWorkspace;
  busy: boolean;
  columns: readonly PersonalTaskColumn[];
  onOpen: (task: Task) => void;
  onStatusChange: SaveTaskStatus;
  onSaveAssignees?: SaveBoardAssignees;
  onSaveProperties?: SaveTaskProperties;
}) {
  const records = tasks.filter((task) => task.kind === kind);
  const drag = useTaskBoardDrag(records, workspace, busy, onStatusChange);
  const instructionsId = useId();
  const projects = new Map(
    workspace.projects.map((project) => [project.id, project]),
  );
  const milestones = new Map(
    workspace.tasks
      .filter((task) => task.kind === "milestone")
      .map((task) => [task.id, task]),
  );
  const noun = kind === "milestone" ? "milestone" : "task";
  const today = osloDate();
  const show = (property: PersonalTaskColumn) => columns.includes(property);
  return (
    <>
      <p id={instructionsId} className="sr-only">
        {`Drag ${noun}s between columns or use the status menu. Moving to Blocked requires a reason.`}
      </p>
      <div
        ref={drag.boardRef}
        data-task-board
        onDragOver={drag.boardOver}
        onDragLeave={drag.boardLeave}
        aria-describedby={instructionsId}
        aria-busy={busy || drag.pending}
        role="region"
        aria-label={kind === "milestone" ? "Milestone board" : "Task board"}
        tabIndex={0}
        className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto overscroll-x-contain pb-3"
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
              className={`flex w-[22rem] flex-none flex-col rounded-xl p-2 transition-colors ${drag.over === status ? "bg-accent ring-2 ring-inset ring-primary" : "bg-muted/60 dark:bg-black/20"}`}
            >
              <h3 className="flex shrink-0 items-center gap-2 px-2 py-3 text-sm font-medium">
                <TaskStatusIcon status={status} />
                {STATUS_LABELS[status]}
                <span
                  className="text-xs tabular-nums text-muted-foreground"
                  aria-label={`${group.length} ${noun}${group.length === 1 ? "" : "s"}`}
                >
                  {group.length}
                </span>
              </h3>
              <div
                tabIndex={0}
                role="region"
                aria-label={`${STATUS_LABELS[status]} cards`}
                className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-0.5 py-1"
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
                      className={`relative min-h-32 shrink-0 gap-0 py-2.5 transition-colors bg-card hover:border-muted-foreground/40 dark:bg-card dark:ring-foreground/5 dark:hover:ring-foreground/35 ${drag.canDrag(task) ? "cursor-grab active:cursor-grabbing" : ""} ${drag.draggingId === task.id ? "opacity-50" : ""}`}
                      role="article"
                      aria-label={task.title}
                    >
                      <CardContent className="flex h-full min-w-0 flex-col gap-2 px-3">
                        <div className="flex min-w-0 shrink-0 items-start gap-1.5">
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
                              <BoardAssignees task={task} workspace={workspace} busy={busy || drag.locked} onSave={onSaveAssignees} onOpen={onOpen} />
                            </span>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {show("priority") && (
                            <span className="relative z-10 inline-flex shrink-0 items-center">
                              {onSaveProperties && canManageTask(task, workspace) ? <MilestonePriorityControl task={task} busy={busy || drag.locked} onSave={onSaveProperties} compact /> : <PriorityIndicator priority={task.priority} />}
                            </span>
                          )}
                          {show("deadline") && <span className={`relative z-10 ${overdue ? "text-[oklch(0.577_0.245_27.325)] dark:text-[#D18A8A]" : "text-muted-foreground"}`}>{onSaveProperties && canManageTask(task, workspace) ? <MilestoneDateControl task={task} busy={busy || drag.locked} onSave={onSaveProperties} pill /> : <span className="inline-flex h-6 items-center rounded-full border px-2">{task.deadline ? <TargetDate deadline={task.deadline} /> : "No target date"}</span>}</span>}
                          {kind === "task" && show("project") && project && <Link draggable={false} to={`/projects/${project.id}`} title={project.name} aria-label={`Open project ${project.name}`} className="relative z-10 inline-flex h-6 min-w-0 max-w-44 items-center gap-1.5 rounded-full border px-2 hover:bg-accent"><IconCube aria-hidden="true" className="size-3.5 shrink-0 text-primary" /><span className="truncate">{project.name}</span></Link>}
                          {kind === "task" && show("milestone") && milestone && project && <MilestonePill milestone={milestone} projectId={project.id} />}
                          {kind === "milestone" && (
                            <span className="inline-flex h-6 shrink-0 items-center rounded-full border px-2">
                              <ProgressRing
                                {...milestoneProgress(
                                  workspace.tasks.filter(
                                    (item) => item.projectId === task.projectId,
                                  ),
                                  task.id,
                                )}
                                label={task.title}
                                valueFormat="count"
                              />
                            </span>
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
                        <p className="text-xs text-muted-foreground"><time dateTime={task.createdAt}>Created {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Oslo" }).format(new Date(task.createdAt))}</time></p>
                      </CardContent>
                    </Card>
                  );
                })}
                {!group.length && (
                  <p className="px-2 py-4 text-xs text-muted-foreground">
                    {`No ${noun}s`}
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
