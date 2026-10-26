import { useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { AssigneePicker } from "./TaskAssignees";
import { Choice, Field } from "./TaskEditor";
import { validateDepartment } from "./model";
import { MAX_DEPARTMENT_MEMBERS, type ProjectDepartment, type ProjectMutation, type ProjectWorkspace } from "./types";

export function DepartmentEditor({ department, initialName, workspace, busy, onSave, onClose }: {
  department: ProjectDepartment | null; initialName: string; workspace: ProjectWorkspace; busy: boolean;
  onSave: (mutation: ProjectMutation) => Promise<boolean>; onClose: () => void;
}) {
  const [id] = useState(() => department?.id ?? crypto.randomUUID());
  const [name, setName] = useState(department?.name ?? initialName);
  const [memberIds, setMemberIds] = useState(department?.memberIds ?? []);
  const [leadId, setLeadId] = useState(department?.leadId ?? null);
  const notify = useNotify();
  const selected = memberIds.map(id => workspace.members.find(member => member.id === id) ?? { id, name: "Inactive member" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspace.canManage) return;
    try { await onSave({ action: "save_department", id, expectedRevision: department?.revision ?? 0, department: validateDepartment({ name, memberIds, leadId }) }); }
    catch (error) { notify("Could not save department", error instanceof Error ? error.message : "Check the department details.", { variant: "error", href: null }); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{department ? "Edit department" : "Add department"}</DialogTitle><DialogDescription>Manage the department's members and Lead for {workspace.season}.</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={event => void submit(event)}><fieldset disabled={busy} className="space-y-4">
    <Field id="department-name" label="Department name"><Input id="department-name" autoFocus required readOnly={!!department} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></Field>
    <Field id="department-members" label="Members"><AssigneePicker id="department-members" assignmentRole="member" maxSelected={MAX_DEPARTMENT_MEMBERS} value={memberIds} members={workspace.members} disabled={busy} onChange={ids => { setMemberIds(ids); if (leadId && !ids.includes(leadId)) setLeadId(null); }} /></Field>
    <Field id="department-lead" label="Department Lead"><Choice id="department-lead" disabled={busy} value={leadId ?? "none"} options={[{ value: "none", label: "No Lead" }, ...selected.map(member => ({ value: member.id, label: member.name }))]} onChange={value => setLeadId(value === "none" ? null : value)} /></Field>
  </fieldset><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save department"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
