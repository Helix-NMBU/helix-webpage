import { useState } from "react";
import { IconUser } from "@tabler/icons-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@libs/components/ui/select";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { AssigneeAvatars, AssigneePicker } from "../ProjectManagement/TaskAssignees";
import { PriorityGlyph } from "../ProjectManagement/PriorityGlyph";
import { TaskStatusIcon, TaskStatusIndicator } from "../ProjectManagement/TaskStatus";
import { validateProject } from "../ProjectManagement/model";
import { STATUS_LABELS, TASK_PRIORITIES, TASK_WORKFLOW_STATUSES, type ProjectInput } from "../ProjectManagement/types";
import { useWorkspace } from "./WorkspaceContext";
import type { WorkspaceDirectory, WorkspaceProject } from "./types";

export function ProjectTimelineProperties({ project, directory }: {
  project: WorkspaceProject; directory: WorkspaceDirectory;
}) {
  const session = useWorkspace();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [leads, setLeads] = useState(project.leadIds ?? []);
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
  const status = project.status ?? "todo";
  return <>
    {canEdit ? <Select value={status} disabled={busy} onValueChange={value => void saveProject({ status: value as ProjectInput["status"] })}><SelectTrigger aria-label={`Change status for ${project.name}`} className="size-6 shrink-0 justify-center rounded-full border-0 bg-transparent p-0 shadow-none data-[size=default]:h-6 dark:bg-transparent dark:hover:bg-accent [&_svg]:size-5 [&>svg:last-child]:hidden"><TaskStatusIcon status={status} /></SelectTrigger><SelectContent>{[...TASK_WORKFLOW_STATUSES, ...(status === "cancelled" ? ["cancelled" as const] : [])].map(value => <SelectItem key={value} value={value}><span className="flex items-center gap-2"><TaskStatusIcon status={value} />{STATUS_LABELS[value]}</span></SelectItem>)}</SelectContent></Select> : <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-5"><TaskStatusIndicator status={status} showLabel={false} /></span>}
    {canEdit ? <Select value={project.priority ?? "normal"} disabled={busy} onValueChange={value => void saveProject({ priority: value as ProjectInput["priority"] })}><SelectTrigger aria-label={`Change priority for ${project.name}`} className="size-6 shrink-0 justify-center rounded-full border border-muted-foreground/30 bg-transparent p-0 shadow-none data-[size=default]:h-6 dark:bg-transparent dark:hover:bg-accent [&_svg]:size-3.5 [&>svg:last-child]:hidden"><PriorityGlyph priority={project.priority ?? "normal"} /></SelectTrigger><SelectContent>{TASK_PRIORITIES.map(value => <SelectItem key={value} value={value}>{value === "normal" ? "Medium" : value[0].toUpperCase() + value.slice(1)}</SelectItem>)}</SelectContent></Select> : <span role="img" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/30 [&_svg]:size-3.5" aria-label={`Priority: ${!project.priority || project.priority === "normal" ? "Medium" : project.priority}`}><PriorityGlyph priority={project.priority ?? "normal"} /></span>}
    <span className="flex w-6 shrink-0 items-center [&_[data-slot=avatar]]:size-5">{canEdit ? <AssigneePicker id={`timeline-leads-${project.id}`} inline inlineShowNames={false} inlineMaxVisible={1} inlineShowOverflowCount={false} emptyIcon circular assignmentRole="lead" members={directory.members} value={leads} disabled={busy} onChange={setLeads} onOpenChange={() => setLeads(project.leadIds ?? [])} triggerLabel={`Change leads for ${project.name}`} groupLabel="Project leads" onCommit={leadIds => saveProject({ leadIds })} /> : project.leadIds?.length ? <AssigneeAvatars assigneeIds={project.leadIds} members={directory.members} assignmentRole="lead" maxVisible={1} showOverflowCount={false} /> : <span role="img" className="flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/30" aria-label="No leads"><IconUser aria-hidden="true" className="size-3.5 text-muted-foreground" /></span>}</span>
  </>;
}
