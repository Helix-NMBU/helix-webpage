import { useState } from "react";
import { IconCircleDotted, IconUser } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@libs/components/ui/select";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { AssigneeAvatars, AssigneePicker } from "../ProjectManagement/TaskAssignees";
import { PriorityGlyph } from "../ProjectManagement/PriorityGlyph";
import { TaskStatusControl, TaskStatusIndicator } from "../ProjectManagement/TaskStatus";
import { validateProject } from "../ProjectManagement/model";
import { projectRepository } from "../ProjectManagement/repository";
import { TASK_PRIORITIES, type ProjectInput, type ProjectWorkspace, type Task, type TaskStatus } from "../ProjectManagement/types";
import { useWorkspace } from "./WorkspaceContext";
import type { WorkspaceDirectory, WorkspaceProject } from "./types";

export function ProjectTimelineProperties({ project, directory, workspace, status, onWorkspaceChange }: {
  project: WorkspaceProject; directory: WorkspaceDirectory; workspace: ProjectWorkspace | null; status: TaskStatus | null;
  onWorkspaceChange: (workspace: ProjectWorkspace) => void;
}) {
  const session = useWorkspace();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [leads, setLeads] = useState(project.leadIds ?? []);
  const tasks = workspace?.tasks.filter(task => task.projectId === project.id && task.kind === "task");
  const canEdit = directory.canAdmin || directory.canManageProjects || directory.departments.some(department => project.departments.includes(department.name) && (department.leadIds ?? (department.leadId ? [department.leadId] : [])).includes(directory.viewerId));
  async function saveProject(changes: Partial<ProjectInput>) {
    if (!session || busy) return false;
    setBusy(true);
    try {
      await session.saveProject({ action: "save_project", id: project.id, expectedRevision: project.revision, project: validateProject({ ...project, ...changes }) });
      notify("Project saved", "Project properties have been updated.", { variant: "success", href: null });
      return true;
    } catch (error) {
      notify("Could not save project", error instanceof Error ? error.message : "Try again.", { variant: "error", href: null });
      return false;
    } finally { setBusy(false); }
  }
  async function saveStatus(task: Task, nextStatus: TaskStatus, blockedReason: string) {
    try {
      const next = await (await projectRepository()).mutate({ action: "set_status", id: task.id, expectedRevision: task.revision, status: nextStatus, blockedReason });
      onWorkspaceChange(next);
      void session?.refresh();
      notify("Task saved", "Project status has been updated.", { variant: "success", href: null });
      return true;
    } catch (error) {
      notify("Could not change status", error instanceof Error ? error.message : "Try again.", { variant: "error", href: null });
      return false;
    }
  }
  const statusIcon = status ? <TaskStatusIndicator status={status} showLabel={false} /> : <span role="img" aria-label={tasks ? "No tasks" : "Status unavailable"}><IconCircleDotted aria-hidden="true" className="size-4 text-muted-foreground" /></span>;
  return <>
    <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" className="size-6 shrink-0 rounded-full [&_svg]:size-5" aria-label={`View task statuses for ${project.name}`} title="Project status is based on its tasks">{statusIcon}</Button></PopoverTrigger><PopoverContent align="start" className="w-80 p-3"><p className="mb-2 text-sm font-medium">Task statuses</p>{tasks ? tasks.length ? <div className="max-h-64 space-y-1 overflow-y-auto">{tasks.map(task => <div key={task.id} className="flex items-center gap-2"><TaskStatusControl task={task} workspace={workspace!} busy={busy} onSave={saveStatus} /><span className="min-w-0 truncate text-sm" title={task.title}>{task.title}</span></div>)}</div> : <p className="text-sm text-muted-foreground">No tasks in this project.</p> : <p className="text-sm text-muted-foreground">Task statuses are unavailable.</p>}</PopoverContent></Popover>
    {canEdit ? <Select value={project.priority ?? "normal"} disabled={busy} onValueChange={value => void saveProject({ priority: value as ProjectInput["priority"] })}><SelectTrigger aria-label={`Change priority for ${project.name}`} className="size-6 shrink-0 justify-center rounded-full border border-muted-foreground/30 bg-transparent p-0 shadow-none data-[size=default]:h-6 dark:bg-transparent dark:hover:bg-accent [&_svg]:size-3.5 [&>svg:last-child]:hidden"><PriorityGlyph priority={project.priority ?? "normal"} /></SelectTrigger><SelectContent>{TASK_PRIORITIES.map(value => <SelectItem key={value} value={value}>{value === "normal" ? "Medium" : value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select> : <span role="img" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 [&_svg]:size-3.5" aria-label={`Priority: ${!project.priority || project.priority === "normal" ? "Medium" : project.priority}`}><PriorityGlyph priority={project.priority ?? "normal"} /></span>}
    <span className="flex w-6 shrink-0 items-center [&_[data-slot=avatar]]:size-5">{canEdit ? <AssigneePicker id={`timeline-leads-${project.id}`} inline inlineShowNames={false} inlineMaxVisible={1} inlineShowOverflowCount={false} emptyIcon circular assignmentRole="lead" members={directory.members} value={leads} disabled={busy} onChange={setLeads} onOpenChange={() => setLeads(project.leadIds ?? [])} triggerLabel={`Change leads for ${project.name}`} groupLabel="Project leads" onCommit={leadIds => saveProject({ leadIds })} /> : project.leadIds?.length ? <AssigneeAvatars assigneeIds={project.leadIds} members={directory.members} assignmentRole="lead" maxVisible={1} showOverflowCount={false} /> : <span role="img" className="flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/30" aria-label="No leads"><IconUser aria-hidden="true" className="size-3.5 text-muted-foreground" /></span>}</span>
  </>;
}
