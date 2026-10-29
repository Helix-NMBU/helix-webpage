import { departmentAccess } from "../ProjectManagement/permissions";
import { useState } from "react";
import { IconFilter2, IconPencil } from "@tabler/icons-react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@libs/components/ui/tabs";
import { useMemberFeatureAccess } from "../MemberPlatform/MemberFeatureAccess";
import { MemberAccessEditor } from "./MemberAccessEditor";
import { Button } from "@libs/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { AssigneeAvatars } from "../ProjectManagement/TaskAssignees";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "./WorkspaceContext";
import {
  Directory,
  Search,
  NoResults,
  LoadDirectory,
} from "./DirectoryComponents";
import type { FormEvent } from "react";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Badge } from "@libs/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Choice, Field } from "../ProjectManagement/TaskEditor";
import { MEMBER_COLUMNS, memberDepartments, memberGroups, memberView } from "./member-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import type {
  MemberChange,
  WorkspaceDirectory,
  WorkspaceMember,
} from "./types";
import { monthDate, seenDate } from "./DirectoryComponents";
function MemberEditor({
  member,
  data,
  busy,
  onSave,
  onClose,
  canManageAccess,
  setBusy,
  onAccessSaved,
}: {
  canManageAccess: boolean;
  setBusy: (busy: boolean) => void;
  onAccessSaved: () => void;
  member: WorkspaceMember;
  data: WorkspaceDirectory;
  busy: boolean;
  onSave: (change: MemberChange) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [helixRole, setHelixRole] = useState(member.helixRole ?? "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy)
      await onSave({
        action: "save_member",
        id: member.id,
        expectedRevision: member.revision,
        name,
        helixRole: helixRole.trim() || null,
        departments: data.departments.map(d => ({ id: d.id, revision: d.revision, member: d.memberIds.includes(member.id), lead: (d.leadIds ?? (d.leadId ? [d.leadId] : [])).includes(member.id), access: departmentAccess(d, member.id) })),
      });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Edit member</DialogTitle>
          <DialogDescription>
            Manage member details, department access, and space access.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={canManageAccess ? "access" : "details"}>
          <TabsList aria-label="Member settings">
            {data.canAdmin && <TabsTrigger value="details" disabled={busy}>Details</TabsTrigger>}
            {canManageAccess && <TabsTrigger value="access" disabled={busy}>Access</TabsTrigger>}
          </TabsList>
          {data.canAdmin && <TabsContent value="details">
            <form className="space-y-4" onSubmit={(event) => void submit(event)}>
              <fieldset disabled={busy} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="member-name">Name</Label>
                  <Input
                    autoFocus
                    id="member-name"
                    maxLength={160}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-title">Assigned Helix Position</Label>
                  <Input
                    id="member-title"
                    maxLength={150}
                    value={helixRole}
                    onChange={(e) => setHelixRole(e.target.value)}
                  />
                </div>

              </fieldset>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save member"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>}
          {canManageAccess && <TabsContent value="access">
            <MemberAccessEditor member={member} data={data} busy={busy} setBusy={setBusy} onSaved={onAccessSaved} />
          </TabsContent>}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function MembersPage() {
  const workspace = useWorkspace();
  const access = useMemberFeatureAccess();
  const canManageAccess = access.canAccess("member_access.manage");
  const data = workspace?.data;
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const options = memberView(params);
  if (!data) return <LoadDirectory title="Members" columns={4} />;
  const canEdit = data.canAdmin || canManageAccess;
  const groups = memberGroups(data, options, search);
  const columnCount = 1 + options.columns.length + (canEdit ? 1 : 0);
  const changeView = (key: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.set(key, value);
    return next;
  }, { replace: true });
  const sortAria = (key: string) => options.sort === key ? (options.direction === "asc" ? "ascending" as const : "descending" as const) : undefined;
  async function save(change: MemberChange) {
    if (busy || !workspace) return;
    setBusy(true);
    try {
      await workspace.saveMember(change);
      setEditing(null);
      notify(
        "Member saved",
        "Their directory details and department membership have been updated.",
        { variant: "success", href: null },
      );
    } catch (error) {
      notify(
        "Could not save member",
        error instanceof Error ? error.message : "Try again.",
        { variant: "error", href: null },
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Directory title="Members" toolbar={<Search outside label="Find members" value={search} onChange={setSearch} />} action={
        <Popover><PopoverTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label="Member view settings" title="Member view settings"><IconFilter2 aria-hidden="true" className="size-4" /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-5">
            <div className="space-y-3 [&>div]:grid [&>div]:grid-cols-[5.5rem_minmax(0,1fr)] [&>div]:items-center [&>div]:gap-3 [&>div]:space-y-0 [&_label]:text-xs [&_label]:text-muted-foreground">
              <Field id="members-group" label="Grouping"><Choice id="members-group" value={options.group} onChange={value => changeView("group", value)} options={[{ value: "none", label: "No grouping" }, { value: "department", label: "Department" }, { value: "role", label: "Role" }]} /></Field>
              <Field id="members-sort" label="Ordering"><Choice id="members-sort" value={options.sort} onChange={value => changeView("sort", value)} options={[{ value: "name", label: "Name" }, ...MEMBER_COLUMNS.map(([value, label]) => ({ value, label }))]} /></Field>
              <Field id="members-direction" label="Direction"><Choice id="members-direction" value={options.direction} onChange={value => changeView("direction", value)} options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} /></Field>
            </div>
            <div className="space-y-3 border-t pt-4"><p className="text-sm font-medium">Display columns</p><div role="group" aria-label="Member display columns" className="flex flex-wrap gap-2">{MEMBER_COLUMNS.map(([key, label]) => <Button key={key} type="button" size="sm" className="rounded-full" variant={options.columns.includes(key) ? "secondary" : "outline"} aria-pressed={options.columns.includes(key)} onClick={() => changeView("columns", MEMBER_COLUMNS.map(([item]) => item).filter(item => item === key ? !options.columns.includes(item) : options.columns.includes(item)).join(","))}>{label}</Button>)}</div></div>
            <Button variant="ghost" className="w-full border-t" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); for (const key of ["group", "sort", "direction", "columns"]) next.delete(key); return next; }, { replace: true })}>Reset view</Button>
          </PopoverContent>
        </Popover>
      }>
        <Table aria-label="Members list">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4" aria-sort={sortAria("name")}>
                Name
              </TableHead>
              {options.columns.includes("role") && <TableHead aria-sort={sortAria("role")}>Role</TableHead>}
              {options.columns.includes("joined") && <TableHead aria-sort={sortAria("joined")}>Joined</TableHead>}
              {options.columns.includes("department") && <TableHead aria-sort={sortAria("department")}>Department</TableHead>}
              {options.columns.includes("seen") && <TableHead aria-sort={sortAria("seen")}>Last seen</TableHead>}
              {canEdit && (
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.flatMap(group => [
              ...(group.name ? [<TableRow key={`group-${group.name}`}><TableCell colSpan={columnCount} className="bg-muted/40 px-4 py-2 text-sm font-medium">{group.name} <span className="ml-1 text-xs text-muted-foreground">{group.members.length}</span></TableCell></TableRow>] : []),
              ...group.members.map((m) => (
              <TableRow key={`${group.name}-${m.id}`}>
                <TableCell className="py-4 pl-4">
                  <div className="flex items-center gap-3">
                    <AssigneeAvatars
                      assigneeIds={[m.id]}
                      members={data.members}
                      maxVisible={1}
                    />
                    <div>
                      <span className="font-medium">{m.name}</span>
                      {m.helixRole && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {m.helixRole}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                {options.columns.includes("role") && <TableCell>
                  {m.role === "Admin" ? (
                    <Badge variant="secondary">Admin</Badge>
                  ) : (
                    m.role
                  )}
                </TableCell>}
                {options.columns.includes("joined") && <TableCell className="text-muted-foreground">
                  {monthDate(m.joinedAt)}
                </TableCell>}
                {options.columns.includes("department") && <TableCell className="max-w-xs whitespace-normal text-muted-foreground">
                  {memberDepartments(data, m.id)
                    .map((d) => d.name)
                    .join(", ") || "—"}
                </TableCell>}
                {options.columns.includes("seen") && <TableCell className="text-muted-foreground">
                  {seenDate(m.lastSeenAt)}
                </TableCell>}
                {canEdit && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={`Edit ${m.name}`}
                      aria-label={`Edit ${m.name}`}
                      onClick={() => setEditing(m)}
                    >
                      <IconPencil className="size-4" aria-hidden="true" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))])}
            {!groups.some(group => group.members.length) && (
              <NoResults columns={columnCount}>
                No members match your search.
              </NoResults>
            )}
          </TableBody>
        </Table>
      </Directory>
      {editing && canEdit && (
        <MemberEditor
          key={editing.id}
          canManageAccess={canManageAccess}
          setBusy={setBusy}
          onAccessSaved={() => { setEditing(null); void workspace?.refresh(); }}
          member={editing}
          data={data}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
