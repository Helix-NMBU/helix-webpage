import { canManageTask, canUpdateTaskStatus } from "./permissions";
import { TaskStatusSelect } from "./TaskStatus";
import { ProjectComposer } from "./ProjectComposer";
import { AssigneePicker } from "./TaskAssignees";
import { useState, type FormEvent, type ReactNode } from "react";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Textarea } from "@libs/components/ui/textarea";
import { CATEGORY_LABELS, TASK_CATEGORIES, TASK_PRIORITIES, ORGANIZATION_DEPARTMENTS, type Project, type ProjectInput, type ProjectMutation, type ProjectWorkspace, type Task, type TaskCategory, type TaskInput } from "./types";
import { compatibleMilestones, updateTaskDraft } from "./progress";
import { validateProject, validateTask } from "./model";
import { useNotify } from "../MemberPlatform/MemberNotifications";

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export function Choice({ id, value, onChange, options, disabled = false, ariaLabel }: { id: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean; ariaLabel?: string }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-label={ariaLabel} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}

const categoryOptions = TASK_CATEGORIES.map(value => ({ value, label: CATEGORY_LABELS[value] }));

export function TaskEditor({ task, workspace, category, busy, onSave, onClose, statusOnly = false }: {
  task: Task | null; workspace: ProjectWorkspace; category: TaskCategory; busy: boolean;
  statusOnly?: boolean;
  onSave: (mutation: ProjectMutation) => Promise<unknown>; onClose: () => void;
}) {
  const [id] = useState(() => task?.id ?? crypto.randomUUID());
  const [revision] = useState(task?.revision ?? 0);
  const [draft, setDraft] = useState<TaskInput>(() => task ? { ...task } : { title: "", description: "", category, projectId: null, milestoneId: null, assigneeIds: [], deadline: null, startDate: null, status: "todo", priority: "normal", kind: "task", partnerName: "", blockedReason: "" });
  const notify = useNotify();
  const canLeadTask = canManageTask(task ?? { projectId: draft.projectId }, workspace);
  const manager = !statusOnly && canLeadTask;
  const canEdit = canLeadTask || (!!task && canUpdateTaskStatus(task, workspace));
  const change = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setDraft(previous => updateTaskDraft(previous, key, value, workspace.tasks));
  const milestones = compatibleMilestones(workspace.tasks, draft, id);
  const selectedMilestone = workspace.tasks.find(item => item.id === draft.milestoneId);
  const milestoneOptions = [{ value: "none", label: "Choose milestone" }, ...milestones.map(item => ({ value: item.id, label: item.title })), ...(selectedMilestone && !milestones.some(item => item.id === selectedMilestone.id) ? [{ value: selectedMilestone.id, label: `${selectedMilestone.title} (Needs organization)` }] : [])];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !canEdit) return;
    try {
      const valid = validateTask(draft, { allowUnorganized: !manager });
      await onSave(manager ? { action: "save_task", id, expectedRevision: revision, task: valid } : { action: "set_status", id, expectedRevision: revision, status: valid.status, blockedReason: valid.blockedReason });
    } catch (error) { notify("Could not save task", error instanceof Error ? error.message : "Check the task details and try again.", { variant: "error", href: null }); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>{task ? (canEdit ? task.kind === "milestone" ? "Edit milestone" : "Edit task" : "Task details") : "New task"}</DialogTitle><DialogDescription>{manager ? "Assign work, set a deadline, and keep progress up to date." : "Assigned members can update their task status and blocked reason."}</DialogDescription></DialogHeader>
    <form onSubmit={event => void submit(event)} className="space-y-5">
      {manager && (!draft.projectId || (draft.kind === "task" && !milestones.some(item => item.id === draft.milestoneId))) && <p className="text-sm text-muted-foreground">Choose a project{draft.kind === "task" ? " and milestone" : ""} to place this work in the season hierarchy before saving details.</p>}
      <fieldset disabled={busy || !manager} className="space-y-4">
        <Field id="task-title" label="Title"><Input id="task-title" autoFocus required maxLength={200} value={draft.title} onChange={event => change("title", event.target.value)} /></Field>
        <Field id="task-description" label="Description"><Textarea id="task-description" maxLength={2000} rows={3} value={draft.description} onChange={event => change("description", event.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="task-category" label="Area"><Input id="task-category" readOnly value={CATEGORY_LABELS[draft.category]} /></Field>
          <Field id="task-project" label="Project"><Choice id="task-project" disabled={busy || !manager} value={draft.projectId ?? "none"} onChange={value => change("projectId", value === "none" ? null : value)} options={[{ value: "none", label: "Choose project" }, ...workspace.projects.filter(project => project.category === draft.category && canManageTask({ projectId: project.id }, workspace)).map(project => ({ value: project.id, label: project.name }))]} /></Field>
          <Field id="task-assignee" label={draft.kind === "milestone" ? "Leads" : "Assignees"}><AssigneePicker assignmentRole={draft.kind === "milestone" ? "lead" : "assignee"} id="task-assignee" disabled={busy || !manager} value={draft.assigneeIds} onChange={value => change("assigneeIds", value)} members={workspace.members} /></Field>
          <Field id="task-kind" label="Type"><Choice id="task-kind" disabled={busy || !manager || workspace.tasks.some(item => item.milestoneId === id)} value={draft.kind} onChange={value => change("kind", value as TaskInput["kind"])} options={[{ value: "task", label: "Task" }, { value: "milestone", label: "Milestone" }]} /></Field>
          {draft.kind === "task" && <Field id="task-milestone" label="Milestone"><Choice id="task-milestone" disabled={busy || !manager} value={draft.milestoneId ?? "none"} onChange={value => change("milestoneId", value === "none" ? null : value)} options={milestoneOptions} /></Field>}
          <Field id="task-start" label="Start date"><Input id="task-start" type="date" min="2000-01-01" max="2100-12-31" value={draft.startDate ?? ""} onChange={event => change("startDate", event.target.value || null)} /></Field>
          <Field id="task-deadline" label="Deadline"><Input id="task-deadline" type="date" min={draft.startDate ?? "2000-01-01"} max="2100-12-31" required={draft.kind === "milestone"} value={draft.deadline ?? ""} onChange={event => change("deadline", event.target.value || null)} /></Field>
          <Field id="task-priority" label="Priority"><Choice id="task-priority" disabled={busy || !manager} value={draft.priority} onChange={value => change("priority", value as TaskInput["priority"])} options={TASK_PRIORITIES.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></Field>
          {draft.category === "partnership-deliverables" && <Field id="task-partner" label="Sponsor or partner"><Input id="task-partner" required maxLength={200} value={draft.partnerName} onChange={event => change("partnerName", event.target.value)} /></Field>}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="task-status" label="Status"><TaskStatusSelect id="task-status" disabled={busy || !canEdit} value={draft.status} onChange={value => change("status", value)} /></Field>
        {(draft.status === "blocked" || draft.blockedReason) && <Field id="task-blocked" label="Blocked reason"><Textarea id="task-blocked" disabled={busy || !canEdit} required={draft.status === "blocked"} maxLength={500} value={draft.blockedReason} onChange={event => change("blockedReason", event.target.value)} /></Field>}
      </div>
      {task?.completedAt && <p className="text-sm text-muted-foreground">Completed {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/Oslo" }).format(new Date(task.completedAt))}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Close</Button>{canEdit && <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save task"}</Button>}</DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

interface ProjectEditorProps { project: Project | null; category: TaskCategory; members?: ProjectWorkspace["members"]; taskLeadCategories?: TaskCategory[]; initialDepartments?: string[]; busy: boolean; onSave: (mutation: ProjectMutation) => Promise<unknown>; onClose: () => void }
export function ProjectEditor(props: ProjectEditorProps) {
  return props.project ? <ExistingProjectEditor {...props} /> : <ProjectComposer {...props} members={props.members ?? []} taskLeadCategories={props.taskLeadCategories ?? []} />;
}
function ExistingProjectEditor({ project, category, members = [], busy, onSave, onClose }: ProjectEditorProps) {
  const [id] = useState(() => project?.id ?? crypto.randomUUID());
  const [revision] = useState(project?.revision ?? 0);
  const [draft, setDraft] = useState<ProjectInput>(() => project ? { ...project } : { name: "", description: "", category, departments: [], startDate: null, deadline: null });
  const notify = useNotify();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    try { await onSave({ action: "save_project", id, expectedRevision: revision, project: validateProject(draft) }); }
    catch (error) { notify("Could not save project", error instanceof Error ? error.message : "Check the project details and try again.", { variant: "error", href: null }); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90svh] overflow-y-auto" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle><DialogDescription>Group related work within the current season. Projects can span departments.</DialogDescription></DialogHeader>
    <form onSubmit={event => void submit(event)} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      <Field id="project-name" label="Project name"><Input id="project-name" autoFocus required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
      <Field id="project-description" label="Description"><Textarea id="project-description" maxLength={2000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></Field>
      <Field id="project-category" label="Area"><Choice id="project-category" disabled={busy} value={draft.category} options={categoryOptions} onChange={value => setDraft({ ...draft, category: value as TaskCategory })} /></Field>
      <Field id="project-departments" label="Departments"><div id="project-departments" role="group" aria-label="Project departments" className="grid gap-2 sm:grid-cols-2">{ORGANIZATION_DEPARTMENTS.map(name => <label key={name} className="flex items-center gap-2 text-sm"><Checkbox checked={draft.departments.includes(name)} disabled={busy} aria-label={name} onCheckedChange={checked => setDraft(previous => ({ ...previous, departments: checked === true ? [...previous.departments, name] : previous.departments.filter(value => value !== name) }))} />{name}</label>)}</div></Field>
      <Field id="project-priority" label="Priority"><Choice id="project-priority" disabled={busy} value={draft.priority ?? "normal"} options={TASK_PRIORITIES.map(value => ({ value, label: value === "normal" ? "Medium" : value[0].toUpperCase() + value.slice(1) }))} onChange={value => setDraft({ ...draft, priority: value as ProjectInput["priority"] })} /></Field>
      <Field id="project-status" label="Status"><TaskStatusSelect id="project-status" disabled={busy} value={draft.status ?? "todo"} onChange={value => setDraft({ ...draft, status: value })} /></Field>
      <Field id="project-leads" label="Leads"><AssigneePicker id="project-leads" triggerLabel="Choose project leads" assignmentRole="lead" members={members} value={draft.leadIds ?? []} disabled={busy || members.length === 0} onChange={leadIds => setDraft({ ...draft, leadIds })} /></Field>
      <Field id="project-start" label="Start date"><Input id="project-start" type="date" min="2000-01-01" max={draft.deadline ?? "2100-12-31"} value={draft.startDate ?? ""} onChange={event => setDraft({ ...draft, startDate: event.target.value || null })} /></Field>
      <Field id="project-deadline" label="Project deadline"><Input id="project-deadline" type="date" min={draft.startDate ?? "2000-01-01"} max="2100-12-31" value={draft.deadline ?? ""} onChange={event => setDraft({ ...draft, deadline: event.target.value || null })} /></Field>
    </fieldset><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save project"}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
