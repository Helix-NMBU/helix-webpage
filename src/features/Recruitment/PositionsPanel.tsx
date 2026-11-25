import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { RecruitmentListSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Switch } from "@libs/components/ui/switch";
import { Textarea } from "@libs/components/ui/textarea";
import type { RecruitmentPosition } from "./positions";
import { memberContact, type PositionContactMember } from "./position-contact";
import { PositionContactPicker } from "./PositionContactPicker";
import { useNotify } from "../MemberPlatform/MemberNotifications";

type PositionInput = Omit<RecruitmentPosition, "id"> & { id?: string };
type Props = {
  positions: RecruitmentPosition[];
  loading: boolean;
  onSave: (position: PositionInput) => Promise<void>;
  onVisibilityChange: (id: string, visible: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loadContactMembers: () => Promise<PositionContactMember[]>;
};
type Draft = Omit<PositionInput, "tasks" | "achieve"> & { tasks: string; achieve: string };
const DEPARTMENTS = ["Finance", "Mechanical & Production", "Electrical", "Software & Autonomous", "Business & Marketing", "Logistics", "Open"];
const emptyDraft = (): Draft => ({
  title: "", department: "Software & Autonomous", applyUrl: "", contact: { name: "", email: "", linkedin: "" },
  about: "", tasks: "", achieve: "", visible: false,
});
const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);

export function PositionsPanel({ positions, loading, onSave, onDelete, onVisibilityChange, loadContactMembers }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<RecruitmentPosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<PositionContactMember[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactRefresh, setContactRefresh] = useState(0);
  const notify = useNotify();
  const editorOpen = draft !== null;
  useEffect(() => {
    if (!editorOpen) return;
    let active = true;
    setContacts(null); setContactsLoading(true);
    void loadContactMembers().then(members => {
      if (!active) return;
      setContacts(members);
      if (!members.length) notify("No Management contacts available", "Add a member to Management in Workspace, then try again.", {
        variant: "warning", href: "/members", action: { label: "Retry", onClick: () => setContactRefresh(value => value + 1) },
      });
    }).catch(error => {
      if (active) notify("Could not load Management members", error instanceof Error ? error.message : "Please try again.", {
        variant: "error", href: null, action: { label: "Retry", onClick: () => setContactRefresh(value => value + 1) },
      });
    }).finally(() => { if (active) setContactsLoading(false); });
    return () => { active = false; };
  }, [editorOpen, loadContactMembers, notify, contactRefresh]);
  const selectedContact = contacts?.find(member => draft?.contactMemberId ? member.id === draft.contactMemberId : member.email.toLowerCase() === draft?.contact.email.toLowerCase());
  const pending = useRef(false);
  const departments = [...new Set([...DEPARTMENTS, ...positions.map(position => position.department)])];
  const update = (change: Partial<Draft>) => setDraft(current => current ? { ...current, ...change } : null);
  const edit = (position: RecruitmentPosition) => setDraft({
    ...position, contact: { ...position.contact }, tasks: position.tasks.join("\n"), achieve: position.achieve.join("\n"),
  });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || pending.current || contactsLoading || !selectedContact) return;
    pending.current = true; setBusy(true);
    try {
      await onSave({
        ...draft, title: draft.title.trim(), applyUrl: "", about: draft.about.trim(),
        contactMemberId: selectedContact.id, contact: memberContact(selectedContact),
        tasks: lines(draft.tasks), achieve: lines(draft.achieve),
      });
      setDraft(null);
    } catch { /* The caller reports the failure; keep the draft for retry. */ }
    finally { pending.current = false; setBusy(false); }
  };
  const setVisibility = async (position: RecruitmentPosition, visible: boolean) => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await onVisibilityChange(position.id, visible); }
    catch { /* The caller reports the failure; retain the saved visibility. */ }
    finally { pending.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || pending.current) return;
    pending.current = true; setBusy(true);
    try { await onDelete(deleting.id); setDeleting(null); }
    catch { /* The caller reports the failure; keep the selection for retry. */ }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="space-y-6" aria-label="Recruitment positions">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1"><h2 className="text-xl font-medium">Positions</h2><p className="text-sm text-muted-foreground">Manage the positions available on the website.</p></div>
      <Button disabled={loading || busy} onClick={() => setDraft(emptyDraft())}>Create position</Button>
    </header>
    {loading ? <RecruitmentListSkeleton positions />
      : positions.length ? <div className="divide-y rounded-lg border">{positions.map(position => <article key={position.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div><h3 className="font-medium">{position.title}</h3><p className="text-sm text-muted-foreground">{position.department}</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-2 flex items-center gap-2">
            <Switch id={`position-${position.id}-visible`} checked={position.visible} disabled={busy || loading}
              aria-label={`Show ${position.title} on the website`} onCheckedChange={visible => void setVisibility(position, visible)} />
            <Label htmlFor={`position-${position.id}-visible`} className="font-normal">Visible on website</Label>
          </div>
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Edit ${position.title}`} title={`Edit ${position.title}`} onClick={() => edit(position)}><IconPencil aria-hidden="true" /></Button><Button variant="outline" size="icon" disabled={busy} aria-label={`Delete ${position.title}`} title={`Delete ${position.title}`} onClick={() => setDeleting(position)}><IconTrash aria-hidden="true" /></Button></div>
      </article>)}</div>
      : <p className="py-12 text-center text-sm text-muted-foreground">No positions yet. Create a position to start recruiting.</p>}
    <Dialog open={draft !== null} onOpenChange={open => { if (!open && !pending.current) setDraft(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy} onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>{draft?.id ? "Edit position" : "Create position"}</DialogTitle><DialogDescription>Hidden positions are saved for recruiters. Turn on website visibility when the position is ready for applicants.</DialogDescription></DialogHeader>
        {draft && <form onSubmit={event => void save(event)} className="space-y-5">
          <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-title">Title</Label><Input id="position-title" value={draft.title} required maxLength={160} onChange={event => update({ title: event.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-department">Department</Label><Select value={draft.department} onValueChange={department => update({ department })} disabled={busy}><SelectTrigger id="position-department" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{departments.map(department => <SelectItem key={department} value={department}>{department === "Open" ? "Open application" : department}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-contact">Contact member</Label><PositionContactPicker members={contacts ?? []} value={selectedContact?.id ?? ""} onChange={contactMemberId => update({ contactMemberId })} disabled={busy || contactsLoading || contacts === null} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-about">Description</Label><Textarea id="position-about" value={draft.about} required maxLength={5000} rows={4} onChange={event => update({ about: event.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-tasks">Tasks</Label><Textarea id="position-tasks" value={draft.tasks} maxLength={20000} rows={4} placeholder="One task per line" onChange={event => update({ tasks: event.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-outcomes">Outcomes</Label><Textarea id="position-outcomes" value={draft.achieve} maxLength={20000} rows={4} placeholder="One outcome per line" onChange={event => update({ achieve: event.target.value })} /></div>
            <div className="flex items-center gap-3 sm:col-span-2"><Switch id="position-visible" checked={draft.visible} disabled={busy} onCheckedChange={visible => update({ visible })} /><Label htmlFor="position-visible">Visible on the website</Label></div>
          </fieldset>
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={busy || contactsLoading || !selectedContact}>{busy ? "Saving…" : "Save position"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={deleting !== null} onOpenChange={open => { if (!open && !pending.current) setDeleting(null); }}>
      <DialogContent showCloseButton={!busy} onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>Delete {deleting?.title}?</DialogTitle><DialogDescription>This permanently removes the position from the website and recruiting list. Existing applications keep their saved position details.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete position"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
