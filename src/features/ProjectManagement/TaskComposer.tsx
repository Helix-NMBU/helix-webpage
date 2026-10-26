import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { AssigneePicker } from "./TaskAssignees";
import { Choice, Field } from "./TaskEditor";
import { CATEGORY_LABELS, type ProjectMutation, type ProjectWorkspace, type TaskCategory, type TaskInput } from "./types";
import { compatibleMilestones, updateTaskDraft } from "./progress";
import { formatDate, validateTask } from "./model";
import { useNotify } from "../MemberPlatform/MemberNotifications";

export function TaskComposer({ workspace, category, projectId, busy, onSave, onClose, initialKind = "task" }: {
  workspace: ProjectWorkspace; category: TaskCategory; projectId: string | null; busy: boolean; initialKind?: TaskInput["kind"];
  onSave: (mutation: ProjectMutation) => Promise<boolean>; onClose: () => void;
}) {
  const areaProjects = workspace.projects.filter(project => project.category === category);
  const initialProjectId = projectId ?? (areaProjects.length === 1 ? areaProjects[0].id : null);
  const initialMilestones = workspace.tasks.filter(task => task.kind === "milestone" && task.projectId && task.projectId === initialProjectId && task.category === category && task.status !== "cancelled");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<TaskInput>(() => ({ title: "", description: "", category, projectId: initialProjectId, milestoneId: initialKind === "task" && initialMilestones.length === 1 ? initialMilestones[0].id : null, assigneeIds: [], deadline: null, startDate: null, status: "todo", priority: "normal", kind: initialKind, partnerName: "", blockedReason: "" }));
  const [details, setDetails] = useState(initialKind === "milestone");
  const [createMore, setCreateMore] = useState(false);
  const notify = useNotify();
  const titleInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { titleInput.current?.focus(); }, [id]);
  const change = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setDraft(previous => updateTaskDraft(previous, key, value, workspace.tasks));
  const milestones = compatibleMilestones(workspace.tasks, draft);
  const milestoneOptions = [{ value: "none", label: "Choose milestone" }, ...milestones.map(item => ({ value: item.id, label: item.title }))];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspace.taskLeadCategories.includes(category)) return;
    try {
      const saved = await onSave({ action: "save_task", id, expectedRevision: 0, task: validateTask(draft) });
      if (!saved) return;
      if (createMore) { setId(crypto.randomUUID()); setDraft(previous => ({ ...previous, title: "", description: "" })); }
      else onClose();
    } catch (error) { notify("Could not create task", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null }); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-4xl" showCloseButton={!busy}>
    <DialogHeader className="flex-row items-baseline gap-3 space-y-0 border-b px-5 py-3"><DialogTitle className="text-sm font-medium">{draft.kind === "milestone" ? "Create milestone" : "Create task"}</DialogTitle><DialogDescription className="text-xs">{CATEGORY_LABELS[category]}</DialogDescription></DialogHeader>
    <form onSubmit={event => void submit(event)}>
      <fieldset disabled={busy}>
        <div className="space-y-3 px-5 py-4"><Label htmlFor="new-task-title" className="sr-only">Task title</Label><Textarea ref={titleInput} id="new-task-title" autoFocus required maxLength={200} rows={2} placeholder="What needs to be done?" className="min-h-12 resize-none border-0 p-0 text-base shadow-none focus-visible:ring-0" value={draft.title} onChange={event => change("title", event.target.value)} />
          {category === "partnership-deliverables" && <Field id="new-task-partner" label="Sponsor or partner"><Input id="new-task-partner" required maxLength={200} value={draft.partnerName} onChange={event => change("partnerName", event.target.value)} placeholder="Which partner is this deliverable for?" /></Field>}
          {!areaProjects.length && <p className="text-sm text-muted-foreground">A project manager needs to add a project in this area before work can be created.</p>}
          {draft.kind === "task" && !milestones.length && <p className="text-sm text-muted-foreground">Choose a project with an available milestone, or create a milestone in the project first.</p>}
          {details && <div className="space-y-4 border-t pt-4"><Field id="new-task-description" label="Description"><Textarea id="new-task-description" maxLength={2000} value={draft.description} onChange={event => change("description", event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-3"><Field id="new-task-priority" label="Priority"><Choice id="new-task-priority" disabled={busy} value={draft.priority} onChange={value => change("priority", value as TaskInput["priority"])} options={["low", "normal", "high", "urgent"].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></Field><Field id="new-task-kind" label="Type"><Choice id="new-task-kind" disabled={busy} value={draft.kind} onChange={value => change("kind", value as TaskInput["kind"])} options={[{ value: "task", label: "Task" }, { value: "milestone", label: "Milestone" }]} /></Field><Field id="new-task-start" label="Start date"><Input id="new-task-start" type="date" min="2000-01-01" max="2100-12-31" value={draft.startDate ?? ""} onChange={event => change("startDate", event.target.value || null)} /></Field></div></div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm">{draft.deadline ? formatDate(draft.deadline) : "Due date"}</Button></PopoverTrigger><PopoverContent className="w-64" align="start"><Field id="new-task-deadline" label="Due date"><Input id="new-task-deadline" type="date" min={draft.startDate ?? "2000-01-01"} max="2100-12-31" value={draft.deadline ?? ""} onChange={event => change("deadline", event.target.value || null)} /></Field></PopoverContent></Popover>
          <div className="min-w-44"><AssigneePicker id="new-task-assignee" disabled={busy} value={draft.assigneeIds} onChange={value => change("assigneeIds", value)} members={workspace.members} /></div>
          <div className="w-36"><Choice id="new-task-project" ariaLabel="Related project" disabled={busy} value={draft.projectId ?? "none"} onChange={value => change("projectId", value === "none" ? null : value)} options={[{ value: "none", label: "Choose project" }, ...workspace.projects.filter(project => project.category === category).map(project => ({ value: project.id, label: project.name }))]} /></div>
          {draft.kind === "task" && <div className="w-44"><Choice id="new-task-milestone" ariaLabel="Milestone" disabled={busy} value={draft.milestoneId ?? "none"} onChange={value => change("milestoneId", value === "none" ? null : value)} options={milestoneOptions} /></div>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setDetails(value => !value)} aria-expanded={details}>{details ? "Fewer details" : "More details"}</Button>
          <div className="flex flex-1 items-center justify-end gap-3"><div className="flex items-center gap-2 whitespace-nowrap"><Checkbox id="create-another-task" checked={createMore} disabled={busy} onCheckedChange={value => setCreateMore(value === true)} /><Label htmlFor="create-another-task" className="text-xs font-normal">Create another</Label></div><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
        </div>
      </fieldset>
    </form>
  </DialogContent></Dialog>;
}
