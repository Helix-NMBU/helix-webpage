import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { Button } from "../../libs/components/ui/button";
import { Badge } from "../../libs/components/ui/badge";
import { Input } from "../../libs/components/ui/input";
import { Label } from "../../libs/components/ui/label";
import { Textarea } from "../../libs/components/ui/textarea";
import { Switch } from "../../libs/components/ui/switch";
import { Skeleton } from "../../libs/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../../libs/components/ui/empty";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../libs/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../libs/components/ui/select";
import { createRecruitmentApi, type WebsitePosition, type WebsitePositionInput } from "./website-api";

const DEPARTMENTS = [
  "Finance",
  "Mechanical & Production",
  "Electrical",
  "Software & Autonomous",
  "Business & Marketing",
  "Logistics",
] as const;
const POSTING_DEPARTMENTS = ["Open", ...DEPARTMENTS] as const;

type EditorValues = {
  title: string;
  department: string;
  applyUrl: string;
  contactName: string;
  contactEmail: string;
  contactLinkedin: string;
  about: string;
  tasks: string;
  achieve: string;
};

const emptyEditor: EditorValues = {
  title: "",
  department: DEPARTMENTS[0],
  applyUrl: "",
  contactName: "",
  contactEmail: "",
  contactLinkedin: "",
  about: "",
  tasks: "",
  achieve: "",
};

function toEditor(position: WebsitePosition): EditorValues {
  return {
    title: position.title,
    department: position.department,
    applyUrl: position.applyUrl,
    contactName: position.contact.name,
    contactEmail: position.contact.email,
    contactLinkedin: position.contact.linkedin ?? "",
    about: position.about,
    tasks: position.tasks.join("\n"),
    achieve: position.achieve.join("\n"),
  };
}

function toInput(values: EditorValues, visible: boolean): WebsitePositionInput {
  return {
    title: values.title.trim(),
    department: values.department,
    applyUrl: values.applyUrl.trim(),
    contact: {
      name: values.contactName.trim(),
      email: values.contactEmail.trim(),
      ...(values.contactLinkedin.trim() ? { linkedin: values.contactLinkedin.trim() } : {}),
    },
    about: values.about.trim(),
    tasks: values.tasks.split("\n").map(item => item.trim()).filter(Boolean),
    achieve: values.achieve.split("\n").map(item => item.trim()).filter(Boolean),
    visible,
  };
}

export default function PositionManagement() {
  const notify = useNotify();
  const owner = useRef<string | null>(null);
  const api = useMemo(() => createRecruitmentApi(owner), []);
  const [positions, setPositions] = useState<WebsitePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WebsitePosition | null>(null);
  const [values, setValues] = useState<EditorValues>(emptyEditor);
  const [deleteTarget, setDeleteTarget] = useState<WebsitePosition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const active = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.managedPositions();
      if (active.current) setPositions(result);
    } catch (error) {
      if (active.current) notify("Could not load positions", error instanceof Error ? error.message : "Please try again.", {
        id: "managed-positions", variant: "error", href: null,
        action: { label: "Try again", onClick: () => setReload(value => value + 1) },
      });
    } finally {
      if (active.current) setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
  }, [load, reload]);

  const sorted = useMemo(() => [...positions].sort((a, b) => {
    if (a.department === "Open") return -1;
    if (b.department === "Open") return 1;
    return a.department.localeCompare(b.department) || a.title.localeCompare(b.title);
  }), [positions]);

  function openCreate() {
    setEditing(null);
    setValues(emptyEditor);
    setEditorOpen(true);
  }

  function openEdit(position: WebsitePosition) {
    setEditing(position);
    setValues(toEditor(position));
    setEditorOpen(true);
  }

  function change<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues(current => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        const result = await api.updatePosition({ id: editing.id, ...toInput(values, editing.visible) });
        setPositions(current => current.map(item => item.id === editing.id ? result.position : item));
      } else {
        const result = await api.createPosition(toInput(values, false));
        setPositions(current => [...current, result.position]);
      }
      setEditorOpen(false);
      notify(editing ? "Position updated" : "Position created", editing ? "Your changes have been saved." : "The new position is hidden until you publish it.", { variant: "success", href: null });
    } catch (error) {
      notify("Could not save position", error instanceof Error ? error.message : "Your changes are still in the form. Try again.", {
        variant: "error", href: null,
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(position: WebsitePosition, visible: boolean) {
    try {
      const result = await api.setPositionVisibility(position.id, visible);
      setPositions(current => current.map(item => item.id === position.id ? result.position : item));
      notify(visible ? "Position published" : "Position hidden", visible ? "Applicants can now see this position." : "This position no longer appears to applicants.", { variant: "success", href: null });
    } catch (error) {
      notify("Could not update visibility", error instanceof Error ? error.message : "The position's visibility was not changed. Try again.", { variant: "error", href: null });
    }
  }

  async function removePosition() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deletePosition(deleteTarget.id);
      setPositions(current => current.filter(item => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify("Position deleted", "The posting was permanently removed. Existing applications keep their saved position details.", { variant: "success", href: null });
    } catch (error) {
      notify("Could not delete position", error instanceof Error ? error.message : "The posting is still available. Try again.", { variant: "error", href: null });
    } finally {
      setDeleting(false);
    }
  }

  return <section className="space-y-6" aria-labelledby="position-management-title">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h2 id="position-management-title" className="text-xl font-medium">Open positions</h2>
        <p className="text-sm text-muted-foreground">Create and update the postings shown to applicants.</p>
      </div>
      <Button onClick={openCreate}>Add position</Button>
    </div>

    {loading ? <div role="status" aria-label="Loading positions" className="space-y-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-24 w-full" />)}</div>
      : sorted.length ? <div className="divide-y rounded-lg border">
        {sorted.map(position => <article key={position.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
          <div className="min-w-48 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{position.title}</h3>
              <Badge variant={position.visible ? "default" : "secondary"}>{position.visible ? "Visible" : "Hidden"}</Badge>
              {position.department === "Open" && <Badge variant="outline">Open application</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{position.department}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-2">
              <Switch id={`position-visible-${position.id}`} checked={position.visible} onCheckedChange={(checked: boolean) => void toggleVisibility(position, checked)} aria-label={`${position.visible ? "Hide" : "Show"} ${position.title}`} />
              <Label htmlFor={`position-visible-${position.id}`} className="text-sm">Show on website</Label>
            </div>
            <Button variant="outline" onClick={() => openEdit(position)}>Edit</Button>
            <Button variant="destructive" onClick={() => setDeleteTarget(position)}>Delete</Button>
          </div>
        </article>)}
      </div> : <Empty className="min-h-56 rounded-lg border py-10"><EmptyHeader><EmptyTitle>No positions yet</EmptyTitle><EmptyDescription>Add a position and keep it hidden until it is ready for applicants.</EmptyDescription></EmptyHeader></Empty>}

    <Dialog open={editorOpen} onOpenChange={(open: boolean) => { if (!saving) setEditorOpen(open); }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl" showCloseButton={!saving}>
        <DialogHeader><DialogTitle>{editing ? "Edit position" : "Add position"}</DialogTitle>
          <DialogDescription>{editing ? "Update the position details shown to applicants." : "Create a posting. It will start hidden until you choose to show it on the website."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={event => void save(event)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="position-title">Title</Label><Input id="position-title" required maxLength={120} value={values.title} onChange={event => change("title", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="position-department">Department</Label><Select value={values.department} onValueChange={(value: string) => change("department", value)}><SelectTrigger id="position-department"><SelectValue /></SelectTrigger><SelectContent>{POSTING_DEPARTMENTS.map(department => <SelectItem key={department} value={department}>{department === "Open" ? "Open application" : department}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-apply-url">Application URL</Label><Input id="position-apply-url" type="url" required maxLength={1000} value={values.applyUrl} onChange={event => change("applyUrl", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="position-contact-name">Contact name</Label><Input id="position-contact-name" required maxLength={160} value={values.contactName} onChange={event => change("contactName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="position-contact-email">Contact email</Label><Input id="position-contact-email" type="email" required maxLength={254} value={values.contactEmail} onChange={event => change("contactEmail", event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-contact-linkedin">Contact LinkedIn URL (optional)</Label><Input id="position-contact-linkedin" type="url" maxLength={1000} value={values.contactLinkedin} onChange={event => change("contactLinkedin", event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-about">About the position</Label><Textarea id="position-about" required maxLength={5000} rows={5} value={values.about} onChange={event => change("about", event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-tasks">Tasks (one per line)</Label><Textarea id="position-tasks" required maxLength={10000} rows={5} value={values.tasks} onChange={event => change("tasks", event.target.value)} /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="position-achieve">What the applicant will achieve (one per line)</Label><Textarea id="position-achieve" required maxLength={10000} rows={5} value={values.achieve} onChange={event => change("achieve", event.target.value)} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create position"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteTarget !== null} onOpenChange={(open: boolean) => { if (!open && !deleting) setDeleteTarget(null); }}>
      <DialogContent showCloseButton={!deleting}>
        <DialogHeader><DialogTitle>Delete {deleteTarget?.title}?</DialogTitle>
          <DialogDescription>This permanently removes the posting from the active catalog. Existing applications keep their saved position title and ID. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={deleting} onClick={() => void removePosition()}>{deleting ? "Deleting…" : "Delete position"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
