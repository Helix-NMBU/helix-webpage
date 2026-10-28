import { departmentAccess } from "../ProjectManagement/permissions";
import { useState } from "react";
import { IconPencil } from "@tabler/icons-react";
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
        departments: data.departments.map(d => ({ id: d.id, revision: d.revision, member: d.memberIds.includes(member.id), lead: d.leadId === member.id, access: departmentAccess(d, member.id) })),
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
  if (!data) return <LoadDirectory />;
  const canEdit = data.canAdmin || canManageAccess;
  const memberDepartments = (memberId: string) =>
    data.departments.filter((department) => {
      const level = departmentAccess(department, memberId);
      return level === "member" || level === "lead";
    });
  const matches = data.members.filter((m) =>
    `${m.name} ${m.helixRole ?? ""} ${m.role} ${memberDepartments(m.id)
      .map((d) => d.name)
      .join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
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
      <Directory title="Members">
        <Search label="Find members" value={search} onChange={setSearch} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4" aria-sort="ascending">
                Name
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Last seen</TableHead>
              {canEdit && (
                <TableHead className="w-20">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((m) => (
              <TableRow key={m.id}>
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
                <TableCell>
                  {m.role === "Admin" ? (
                    <Badge variant="secondary">Admin</Badge>
                  ) : (
                    m.role
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {monthDate(m.joinedAt)}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-muted-foreground">
                  {memberDepartments(m.id)
                    .map((d) => d.name)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {seenDate(m.lastSeenAt)}
                </TableCell>
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
            ))}
            {!matches.length && (
              <NoResults columns={canEdit ? 6 : 5}>
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
