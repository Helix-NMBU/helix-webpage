import { Link, useSearchParams } from "react-router-dom";
import { IconCube, IconDiamonds, IconRefresh } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@libs/components/ui/empty";
import { Badge } from "@libs/components/ui/badge";
import { TaskStatusControl, type SaveTaskStatus } from "./TaskStatus";
import { AssigneeAvatars } from "./TaskAssignees";
import { PriorityIndicator } from "./MilestoneTableControls";
import { TaskBoard, type SaveBoardAssignees } from "./TaskBoard";
import { PersonalTaskViewMenu } from "./PersonalTaskViewMenu";
import {
  assignedTasks,
  personalTaskGroups,
  personalTaskView,
} from "./personal-task-view";
import { type ProjectWorkspace, type Task } from "./types";
import { formatDate, osloDate } from "./model";

export function PersonalTasks({
  workspace,
  busy,
  loading,
  onRefresh,
  onOpen,
  onStatusChange,
  onSaveAssignees,
}: {
  workspace: ProjectWorkspace;
  busy: boolean;
  loading: boolean;
  onRefresh: () => void;
  onOpen: (task: Task) => void;
  onStatusChange: SaveTaskStatus;
  onSaveAssignees: SaveBoardAssignees;
}) {
  const [params, setParams] = useSearchParams();
  const options = personalTaskView(params);
  const today = osloDate();
  const assigned = assignedTasks(workspace);
  const groups = personalTaskGroups(
    workspace,
    options.view === "board" ? { ...options, group: "status" } : options,
    today,
  );
  const projects = new Map(
    workspace.projects.map((project) => [project.id, project]),
  );
  const milestones = new Map(
    workspace.tasks
      .filter((task) => task.kind === "milestone")
      .map((task) => [task.id, task]),
  );
  const show = (column: (typeof options.columns)[number]) =>
    options.columns.includes(column);
  const columns = 1 + options.columns.length;
  function change(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("cancelled");
        next.set(key, value);
        if (key === "project") next.delete("milestone");
        return next;
      },
      { replace: true },
    );
  }
  return (
    <section
      className={`mx-auto w-full ${options.view === "board" ? "flex min-h-0 min-w-0 flex-1 flex-col pt-5" : "max-w-7xl py-5"}`}
      aria-labelledby="my-tasks-title"
      aria-busy={busy || loading}
    >
      <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
        <h1 id="my-tasks-title" className="text-2xl font-medium tracking-tight">
          My tasks
        </h1>
        <div className="flex items-center gap-2">
          <PersonalTaskViewMenu
            workspace={workspace}
            assigned={assigned}
            options={options}
            onChange={change}
            onReset={() => setParams({}, { replace: true })}
          />
          <Button
            variant="outline"
            size="icon-sm"
            disabled={busy || loading}
            onClick={onRefresh}
            aria-label="Refresh tasks"
            title="Refresh tasks"
          >
            <IconRefresh aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
      <div
        className={
          options.view === "board"
            ? "flex min-h-0 min-w-0 flex-1 flex-col"
            : "overflow-hidden rounded-xl border bg-background"
        }
      >
        {options.view === "board" ? (
          <TaskBoard
            tasks={groups.flatMap((group) => group.tasks)}
            workspace={workspace}
            busy={busy || loading}
            columns={options.columns}
            onOpen={onOpen}
            onStatusChange={onStatusChange}
            onSaveAssignees={onSaveAssignees}
          />
        ) : groups.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64 px-4">Task</TableHead>
                {show("deadline") && (
                  <TableHead className="min-w-32">Due date</TableHead>
                )}
                {show("project") && (
                  <TableHead className="min-w-40">Project</TableHead>
                )}
                {show("milestone") && (
                  <TableHead className="min-w-40">Milestone</TableHead>
                )}
                {show("assignee") && (
                  <TableHead className="min-w-24">Assigned to</TableHead>
                )}
                {show("priority") && <TableHead>Priority</TableHead>}
                {show("partner") && <TableHead>Partner</TableHead>}
              </TableRow>
            </TableHeader>
            {groups.map((group) => (
              <TableBody key={group.id} aria-label={group.label || "Tasks"}>
                {group.label && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell
                      colSpan={columns}
                      className="px-4 py-2 text-xs text-muted-foreground"
                    >
                      {group.label}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 tabular-nums">
                        {group.tasks.length}
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {group.tasks.map((task) => {
                  const closed =
                    task.status === "done" || task.status === "cancelled";
                  const project = projects.get(task.projectId ?? "");
                  const candidate = milestones.get(task.milestoneId ?? "");
                  const milestone =
                    candidate?.projectId === task.projectId
                      ? candidate
                      : undefined;
                  return (
                    <TableRow
                      key={task.id}
                      className={closed ? "text-muted-foreground" : ""}
                    >
                      <TableCell className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <TaskStatusControl
                            task={task}
                            workspace={workspace}
                            busy={busy || loading}
                            onSave={onStatusChange}
                          />
                          <div className="min-w-0 pt-1">
                            <button
                              className={`text-left leading-5 underline-offset-4 hover:underline ${closed ? "line-through decoration-muted-foreground/50" : "font-medium"}`}
                              onClick={() => onOpen(task)}
                            >
                              {task.title}
                            </button>
                            {task.status === "blocked" && (
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  Blocked
                                </Badge>
                                {task.blockedReason && (
                                  <span className="text-xs text-muted-foreground">
                                    {task.blockedReason}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      {show("deadline") && (
                        <TableCell
                          className={`whitespace-nowrap ${!closed && task.deadline && task.deadline < today ? "text-[oklch(0.577_0.245_27.325)] dark:text-[#D18A8A]" : "text-muted-foreground"}`}
                        >
                          {task.deadline
                            ? formatDate(task.deadline)
                            : "No due date"}
                        </TableCell>
                      )}
                      {show("project") && (
                        <TableCell>
                          {project ? (
                            <Link
                              className="inline-flex max-w-52 items-center gap-2 underline-offset-4 hover:underline"
                              title={project.name}
                              to={`/projects/${project.id}`}
                            >
                              <IconCube
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground"
                              />
                              <span className="truncate">{project.name}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              No project
                            </span>
                          )}
                        </TableCell>
                      )}
                      {show("milestone") && (
                        <TableCell>
                          {milestone && project ? (
                            <Link
                              className="inline-flex max-w-56 items-center gap-2 underline-offset-4 hover:underline"
                              title={milestone.title}
                              to={`/projects/${project.id}?milestone=${milestone.id}`}
                            >
                              <IconDiamonds
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground"
                              />
                              <span className="truncate">
                                {milestone.title}
                              </span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">
                              No milestone
                            </span>
                          )}
                        </TableCell>
                      )}
                      {show("assignee") && (
                        <TableCell>
                          <AssigneeAvatars
                            assigneeIds={task.assigneeIds}
                            members={workspace.members}
                          />
                        </TableCell>
                      )}
                      {show("priority") && (
                        <TableCell>
                          <PriorityIndicator priority={task.priority} />
                        </TableCell>
                      )}
                      {show("partner") && (
                        <TableCell>
                          {task.partnerName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            ))}
          </Table>
        ) : (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyTitle>
                {assigned.length
                  ? "No matching tasks"
                  : "No tasks assigned to you"}
              </EmptyTitle>
              <EmptyDescription>
                {assigned.length
                  ? "Adjust the filters or view settings."
                  : "Your Department Lead's assignments will appear here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      {options.view !== "board" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Select a status icon to update a task for all its assignees.
          Department Leads create and assign tasks within projects.
        </p>
      )}
    </section>
  );
}
