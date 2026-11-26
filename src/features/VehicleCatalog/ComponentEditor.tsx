import { useId, useRef, useState, type FormEvent } from "react";
import { IconCheck, IconDots, IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Textarea } from "@libs/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@libs/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { AssigneePicker } from "../ProjectManagement/TaskAssignees";
import { componentArchived } from "./model";
import type { CatalogMutation, VehicleCatalog, VehicleComponent } from "./types";

type Save = (change: CatalogMutation) => Promise<boolean>;

export function ComponentEditor({ parent, catalog, save, label }: {
  parent?: VehicleComponent;
  catalog: VehicleCatalog;
  save: Save;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const title = parent ? "Add subsystem" : "Add system";
  return <Dialog open={open} onOpenChange={setOpen}>
    <Tooltip>
      <TooltipTrigger asChild><DialogTrigger asChild>
        <Button type="button" variant={parent ? "ghost" : "default"} size="icon" aria-label={label}>
          <IconPlus aria-hidden="true" />
        </Button>
      </DialogTrigger></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{parent ? "Choose the vehicle system this subsystem belongs to." : "Systems can be linked to projects across seasons."}</DialogDescription>
      </DialogHeader>
      <ComponentForm parent={parent} catalog={catalog} save={save} close={() => setOpen(false)} />
    </DialogContent>
  </Dialog>;
}

export function ComponentActions({ component, catalog, save, onDeleted }: {
  component: VehicleComponent;
  catalog: VehicleCatalog;
  save: Save;
  onDeleted: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const [dialog, setDialog] = useState<{ action: "edit" | "delete"; open: boolean }>({ action: "edit", open: false });
  const [deleting, setDeleting] = useState(false);
  const kind = component.parentId ? "subsystem" : "system";
  const label = `Actions for ${component.name}`;

  function open(action: "edit" | "delete") {
    openingDialog.current = true;
    setDialog({ action, open: true });
  }

  function close() {
    setDialog(current => ({ ...current, open: false }));
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    const deleted = await save({ action: "delete_component", id: component.id, expectedRevision: component.revision });
    setDeleting(false);
    if (deleted) {
      close();
      onDeleted();
    }
  }

  return <>
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild><DropdownMenuTrigger asChild>
          <Button ref={trigger} type="button" variant="ghost" size="icon" aria-label={label}><IconDots aria-hidden="true" /></Button>
        </DropdownMenuTrigger></TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        if (openingDialog.current) event.preventDefault();
        openingDialog.current = false;
      }}>
        <DropdownMenuItem onSelect={() => open("edit")}>Edit</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => open("delete")}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={dialog.open} onOpenChange={open => { if (!open && !deleting) close(); }}>
      <DialogContent showCloseButton={false}
        onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}
        onOpenAutoFocus={event => {
          if (dialog.action === "delete" && cancelDelete.current) {
            event.preventDefault();
            cancelDelete.current.focus();
          }
        }}>
        {dialog.action === "edit" ? <>
          <DialogHeader>
            <DialogTitle>Edit {kind}</DialogTitle>
            <DialogDescription>{component.name}</DialogDescription>
          </DialogHeader>
          <ComponentForm component={component} catalog={catalog} save={save} close={close} />
        </> : <>
          <DialogHeader>
            <DialogTitle>Delete {component.name}?</DialogTitle>
            <DialogDescription>
              {component.parentId ? "This permanently removes the subsystem and its responsibility assignments." : "This permanently removes the system from the vehicle catalog."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild><Button ref={cancelDelete} type="button" variant="outline" disabled={deleting}>Cancel</Button></DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void remove()}>Delete</Button>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

function ComponentForm({ component, parent, catalog, save, close }: {
  component?: VehicleComponent;
  parent?: VehicleComponent;
  catalog: VehicleCatalog;
  save: Save;
  close: () => void;
}) {
  const field = useId();
  const assignments = catalog.responsibilities.filter(item => item.subsystemId === component?.id);
  const [draft, setDraft] = useState<VehicleComponent>(() => component ?? {
    id: crypto.randomUUID(), parentId: parent?.id ?? null, name: "", code: "", description: "", archived: false, revision: 0,
  });
  const [busy, setBusy] = useState(false);
  const [memberIds, setMemberIds] = useState(() => assignments.flatMap(item => item.memberId ? [item.memberId] : []));
  const [pendingNames, setPendingNames] = useState(() => assignments.filter(item => item.memberId === null).map(item => item.name));
  const parents = catalog.components.filter(item => !item.parentId && (!item.archived || item.id === draft.parentId));
  const canAssign = Boolean(draft.parentId && catalog.canAssignResponsibility);
  const required = canAssign && !componentArchived(draft, catalog.components);
  const eligible = new Set(catalog.members.map(member => member.id));
  const pickerMembers = [...catalog.members, ...assignments.flatMap(item => item.memberId && !eligible.has(item.memberId) && memberIds.includes(item.memberId) ? [{ id: item.memberId, name: item.name }] : [])];
  const valid = !required || ((memberIds.length > 0 || pendingNames.length > 0) && memberIds.every(id => eligible.has(id)));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    const responsibility = canAssign ? { season: catalog.season, memberIds, pendingNames } : undefined;
    if (await save({ ...draft, ...(responsibility ? { responsibility } : {}) })) close();
    setBusy(false);
  }
  return <form onSubmit={submit} className="space-y-4">
    {draft.parentId && <div className="grid gap-2">
      <Label htmlFor={`${field}-parent`}>Parent system</Label>
      <Select value={draft.parentId} onValueChange={parentId => setDraft({ ...draft, parentId })} disabled={busy}>
        <SelectTrigger id={`${field}-parent`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{parents.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>}
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <div className="grid gap-2"><Label htmlFor={`${field}-code`}>Code</Label><Input id={`${field}-code`} autoCapitalize="characters" required maxLength={24} value={draft.code} disabled={busy} onChange={event => setDraft({ ...draft, code: event.target.value.toUpperCase() })} /></div>
      <div className="grid gap-2"><Label htmlFor={`${field}-name`}>Name</Label><Input id={`${field}-name`} required maxLength={120} value={draft.name} disabled={busy} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div>
    </div>
    <div className="grid gap-2"><Label htmlFor={`${field}-description`}>Description</Label><Textarea id={`${field}-description`} maxLength={1000} value={draft.description} disabled={busy} onChange={event => setDraft({ ...draft, description: event.target.value })} /></div>
    {canAssign && <div className="grid gap-2">
      <Label htmlFor={`${field}-owner`}>Responsible people{required ? " (required)" : ""}</Label>
      <AssigneePicker id={`${field}-owner`} assignmentRole="member" triggerLabel="Choose responsible members" groupLabel="Responsible members"
        optionLabel={name => `Assign ${name} responsibility`} value={memberIds} onChange={setMemberIds} members={pickerMembers} disabled={busy} maxSelected={Infinity} />
      {pendingNames.length > 0 && <ul aria-label="Responsibilities pending a member profile" className="flex flex-wrap gap-2">
        {pendingNames.map(name => <li key={name} className="flex items-center gap-1 rounded-md border pl-2 text-sm">
          {name}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} disabled={busy}
            onClick={() => setPendingNames(names => names.filter(item => item !== name))}><IconX aria-hidden="true" /></Button>
        </li>)}
      </ul>}
    </div>}
    {component && <div className="flex items-start gap-2">
      <Checkbox id={`${field}-archived`} checked={draft.archived} disabled={busy} onCheckedChange={value => setDraft({ ...draft, archived: value === true })} />
      <div className="grid gap-1"><Label htmlFor={`${field}-archived`}>Archive from new project assignments</Label><p className="text-xs text-muted-foreground">Existing links are kept. Archiving a system also hides its subsystems from new assignments.</p></div>
    </div>}
    <DialogFooter>
      <DialogClose asChild><Button type="button" variant="outline" size="icon" aria-label="Cancel" title="Cancel" disabled={busy}><IconX aria-hidden="true" /></Button></DialogClose>
      <Button type="submit" size="icon" aria-label="Save" title="Save" disabled={busy || !valid}><IconCheck aria-hidden="true" /></Button>
    </DialogFooter>
  </form>;
}
