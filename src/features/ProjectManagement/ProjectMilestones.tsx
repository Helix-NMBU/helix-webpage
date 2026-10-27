import { IconDiamonds } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { TaskStatusControl, TaskStatusIndicator, type SaveTaskStatus } from "./TaskStatus";
import { formatDate } from "./model";
import { isOrganized } from "./hierarchy";
import { milestoneProgress, milestoneTasks } from "./progress";
import { type Project, type ProjectWorkspace, type Task } from "./types";

export function ProjectMilestones({ project, workspace, onOpen, onSelect, busy = false, onStatusChange }: {
  busy?: boolean; onStatusChange?: SaveTaskStatus; project: Project; workspace: ProjectWorkspace; onOpen: (task: Task) => void; onSelect: (id: string) => void;
}) {
  const milestones = workspace.tasks.filter(task => task.kind === "milestone" && task.projectId === project.id && isOrganized(task, workspace));
  return <div className="space-y-2 border-t pt-3" aria-label={`Milestones in ${project.name}`}>
    <p className="text-xs font-medium text-muted-foreground">{milestones.length} milestone{milestones.length === 1 ? "" : "s"}</p>
    {milestones.map(milestone => { const progress = milestoneProgress(workspace.tasks, milestone.id); const tasks = milestoneTasks(workspace.tasks, milestone.id); return <details key={milestone.id} className="rounded-md border px-2.5 py-2">
      <summary className="cursor-pointer text-sm"><span className="ml-1 inline-flex max-w-[85%] items-center gap-1.5 align-middle"><IconDiamonds className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{milestone.title}</span><span className="shrink-0 text-xs text-muted-foreground">{progress.percent}%</span></span></summary>
      <div className="space-y-2 pt-3"><p className="text-xs text-muted-foreground">{progress.done} of {progress.total} tasks complete · {formatDate(milestone.deadline)}</p><div className="flex gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => onOpen(milestone)}>Milestone details</Button><Button type="button" variant="ghost" size="sm" onClick={() => onSelect(milestone.id)}>View tasks</Button></div>
        {tasks.length ? <ul className="space-y-1 border-l pl-3">{tasks.map(task => <li key={task.id} className="flex items-center justify-between gap-2 py-1"><button type="button" className="min-w-0 truncate text-left text-sm hover:underline" onClick={() => onOpen(task)}>{task.title}</button>{onStatusChange ? <TaskStatusControl task={task} workspace={workspace} busy={busy} onSave={onStatusChange} /> : <TaskStatusIndicator status={task.status} />}</li>)}</ul> : <p className="px-2 text-xs text-muted-foreground">No linked tasks yet.</p>}
      </div>
    </details>; })}
    {!milestones.length && <p className="text-xs text-muted-foreground">Add a milestone to organize this project's tasks.</p>}
  </div>;
}
