import type { ReactNode } from "react";
import { IconChevronDown, IconDiamonds, IconPlus } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import { AssigneeAvatars } from "../ProjectManagement/TaskAssignees";
import { ProgressRing } from "../ProjectManagement/ProgressRing";
import { ProgressChart } from "../ProjectManagement/OverviewProgress";
import {
  PriorityIndicator,
  TargetDate,
} from "../ProjectManagement/MilestoneTableControls";
import {
  CATEGORY_LABELS,
  type ProjectWorkspace,
  type Task,
} from "../ProjectManagement/types";
import { summarize } from "../ProjectManagement/model";
import {
  milestoneProgress,
  progressCounts,
} from "../ProjectManagement/progress";
import { getDepartmentIcon } from "./department-icons";
import type { WorkspaceDirectory, WorkspaceProject } from "./types";
function Widget({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Collapsible defaultOpen className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <CollapsibleTrigger
          className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
          aria-label={`Toggle ${title}`}
        >
          {title}
          <IconChevronDown
            aria-hidden="true"
            className="size-3 transition-transform group-data-[state=closed]:-rotate-90"
          />
        </CollapsibleTrigger>
        {action}
      </div>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [&>div]:max-w-full">{children}</dd>
    </div>
  );
}
export function ProjectSidebar({
  project,
  directory,
  workspace,
  tasks,
  milestones,
  selectedMilestone,
  onSelect,
  onEdit,
  canEdit,
  canCreate,
  busy,
  onCreateMilestone,
}: {
  project: WorkspaceProject;
  directory: WorkspaceDirectory;
  workspace: ProjectWorkspace | null;
  tasks: Task[];
  milestones: Task[];
  selectedMilestone: string | null;
  onSelect: (id: string) => void;
  onEdit: () => void;
  canEdit: boolean;
  canCreate: boolean;
  busy: boolean;
  onCreateMilestone: () => void;
}) {
  const counts = progressCounts(tasks);
  const progress = workspace
    ? summarize(tasks)
    : {
        done: project.done,
        total: project.total,
        percent: project.total
          ? Math.round((project.done / project.total) * 100)
          : 0,
      };
  const status = !workspace
    ? "—"
    : !tasks.length
      ? "No tasks"
      : tasks.every((task) => task.status === "cancelled")
        ? "Cancelled"
        : progress.total > 0 && progress.done === progress.total
          ? "Completed"
          : tasks.some((task) => task.status === "blocked")
            ? "Blocked"
            : counts.started > 0
              ? "In progress"
              : "To do";
  const assignees = [...new Set(tasks.flatMap((task) => task.assigneeIds))];
  const ids = new Set(tasks.map((task) => task.id));
  const chart = workspace
    ? {
        ...workspace,
        tasks: tasks,
        progressEvents: workspace.progressEvents.filter((event) =>
          ids.has(event.taskId),
        ),
      }
    : null;
  const loose = tasks.filter((task) => !task.milestoneId).length;
  const milestoneRows = workspace ? milestones : project.milestones;
  return (
    <aside
      tabIndex={0}
      aria-label="Project details"
      className="min-w-0 space-y-3 md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:pb-2 md:pr-2"
    >
      <Widget
        title="Properties"
        action={
          canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={onEdit}
            >
              Edit
            </Button>
          ) : undefined
        }
      >
        <dl className="space-y-5">
          <Property label="Status">
            <span title="Based on project task status">{status}</span>
          </Property>
          <Property label="Priority">
            <span className="inline-flex items-center gap-2">
              <PriorityIndicator priority={project.priority ?? "normal"} />
              {project.priority === "normal" || !project.priority
                ? "Medium"
                : project.priority[0].toUpperCase() + project.priority.slice(1)}
            </span>
          </Property>
          <Property label="Leads">
            <AssigneeAvatars
              assigneeIds={project.leadIds ?? []}
              members={directory.members}
              assignmentRole="lead"
              showNames
            />
          </Property>
          <Property label="Assignees">
            <AssigneeAvatars
              assigneeIds={assignees}
              members={workspace?.members ?? directory.members}
              showNames
            />
          </Property>
          <Property label="Target date">
            <TargetDate deadline={project.deadline} />
          </Property>
          <Property label="Department">
            <div className="space-y-2">
              {project.departments.length ? (
                project.departments.map((name) => {
                  const Icon = getDepartmentIcon(name);
                  return (
                    <span
                      key={name}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Icon
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {name}
                    </span>
                  );
                })
              ) : (
                <span className="text-muted-foreground">No department</span>
              )}
            </div>
          </Property>
          <Property label="Area">{CATEGORY_LABELS[project.category]}</Property>
          <Property label="Season">{project.season}</Property>
        </dl>
      </Widget>
      <Widget
        title="Milestones"
        action={
          canCreate ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label="New project milestone"
              disabled={busy}
              onClick={onCreateMilestone}
            >
              <IconPlus aria-hidden="true" className="size-3.5" />
            </Button>
          ) : undefined
        }
      >
        <div className="-mx-2 space-y-1">
          {milestoneRows.map((milestone) => {
            const result = workspace
              ? milestoneProgress(workspace.tasks, milestone.id)
              : null;
            const active = selectedMilestone === milestone.id;
            const content = (
              <>
                <IconDiamonds
                  aria-hidden="true"
                  className={`size-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={milestone.title}
                >
                  {milestone.title}
                </span>
                {result && (
                  <span
                    className="text-xs tabular-nums text-muted-foreground"
                    title={`${result.done} of ${result.total} tasks complete`}
                  >
                    {result.percent}%
                    <span className="ml-1 text-[10px]">of {result.total}</span>
                  </span>
                )}
              </>
            );
            return workspace ? (
              <button
                key={milestone.id}
                type="button"
                aria-pressed={active}
                aria-label={`Filter tasks by milestone ${milestone.title}`}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted ${active ? "bg-muted ring-1 ring-border" : ""}`}
                onClick={() => onSelect(milestone.id)}
              >
                {content}
              </button>
            ) : (
              <div
                key={milestone.id}
                className="flex items-center gap-2 px-2 py-2.5 text-sm"
              >
                {content}
              </div>
            );
          })}
          {loose > 0 && (
            <button
              type="button"
              aria-pressed={selectedMilestone === "none"}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted ${selectedMilestone === "none" ? "bg-muted ring-1 ring-border" : ""}`}
              onClick={() => onSelect("none")}
            >
              <span>No milestone</span>
              <span className="text-xs tabular-nums">{loose}</span>
            </button>
          )}
          {!milestoneRows.length && (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              No milestones yet.
            </p>
          )}
        </div>
      </Widget>
      <Widget title="Progress">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {progress.done} of {progress.total} tasks complete
          </span>
          <ProgressRing
            label={`${project.name} progress`}
            {...progress}
            showTotal={false}
          />
        </div>
        {chart ? (
          <ProgressChart workspace={chart} compact={false} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Recorded history requires project task access.
          </p>
        )}
      </Widget>
    </aside>
  );
}
