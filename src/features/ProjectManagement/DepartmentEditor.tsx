import { useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { AssigneePicker } from "./TaskAssignees";
import { Field } from "./TaskEditor";
import { validateDepartment } from "./model";
import { departmentMemberIds } from "./permissions";
import { MAX_DEPARTMENT_MEMBERS, type ProjectDepartment, type ProjectMutation, type ProjectWorkspace } from "./types";

export function DepartmentEditor({ department, workspace, busy, onSave, onClose }: {
  department: ProjectDepartment; workspace: ProjectWorkspace; busy: boolean;
  onSave: (mutation: ProjectMutation) => Promise<boolean>; onClose: () => void;
}) {
  const id = department.id;
  const name = department.name;
  const [memberIds, setMemberIds] = useState(() => departmentMemberIds(department));
  const [leadIds, setLeadIds] = useState(department.leadIds ?? (department.leadId ? [department.leadId] : []));
  const notify = useNotify();
  const selected = memberIds.map(id => workspace.members.find(member => member.id === id) ?? { id, name: "Inactive member" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspace.canManage) return;
    const viewerIds = department.viewerIds?.filter(id => !memberIds.includes(id));
    const accessHolderIds = [...new Set([...memberIds, ...(viewerIds ?? [])])];
    try { await onSave({ action: "save_department", id, expectedRevision: department.revision, department: validateDepartment({ name, memberIds: accessHolderIds, leadId: leadIds[0] ?? null, leadIds, viewerIds }) }); }
    catch (error) { notify("Could not save department", error instanceof Error ? error.message : "Check the department details.", { variant: "error", href: null }); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Edit department</DialogTitle><DialogDescription>Manage the department's members and Leads for {workspace.season}.</DialogDescription></DialogHeader><form className="space-y-5" onSubmit={event => void submit(event)}><fieldset disabled={busy} className="space-y-4">
    <Field id="department-name" label="Department name"><Input id="department-name" autoFocus required readOnly maxLength={100} value={name} /></Field>
    <Field id="department-members" label="Members"><AssigneePicker id="department-members" assignmentRole="member" maxSelected={MAX_DEPARTMENT_MEMBERS} value={memberIds} members={workspace.members} disabled={busy} onChange={ids => { setMemberIds(ids); setLeadIds(leads => leads.filter(id => ids.includes(id))); }} /></Field>
    <Field id="department-lead" label="Department Leads"><AssigneePicker id="department-lead" assignmentRole="lead" triggerLabel="Choose department leads" groupLabel="Department leads" members={selected} value={leadIds} disabled={busy} onChange={setLeadIds} /></Field>
  </fieldset><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save department"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
