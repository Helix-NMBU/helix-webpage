import { useState } from "react";
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
import { Checkbox } from "@libs/components/ui/checkbox";
import { Badge } from "@libs/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { ORGANIZATION_DEPARTMENTS } from "../ProjectManagement/types";
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
}: {
  member: WorkspaceMember;
  data: WorkspaceDirectory;
  busy: boolean;
  onSave: (change: MemberChange) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [helixRole, setHelixRole] = useState(member.helixRole ?? "");
  const [departments, setDepartments] = useState(() =>
    data.departments.map((d) => ({
      id: d.id,
      revision: d.revision,
      member: d.memberIds.includes(member.id),
      lead: d.leadId === member.id,
    })),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy)
      await onSave({
        action: "save_member",
        id: member.id,
        expectedRevision: member.revision,
        name,
        helixRole: helixRole.trim() || null,
        departments,
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
            Update their name, Helix title, and department membership.
          </DialogDescription>
        </DialogHeader>
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
              <Label htmlFor="member-title">Helix title</Label>
              <Input
                id="member-title"
                maxLength={150}
                value={helixRole}
                onChange={(e) => setHelixRole(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Departments</Label>
              {ORGANIZATION_DEPARTMENTS.map((department) => {
                const d = data.departments.find((d) => d.name === department);
                const choice = departments.find((c) => c.id === d?.id);
                if (!d || !choice) return null;
                const occupied = !!d.leadId && d.leadId !== member.id;
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                  >
                    <label className="flex items-center gap-2">
                      <Checkbox
                        aria-label={`Member of ${d.name}`}
                        checked={choice.member}
                        onCheckedChange={(checked) =>
                          setDepartments((values) =>
                            values.map((v) =>
                              v.id === d.id
                                ? {
                                    ...v,
                                    member: checked === true,
                                    lead: checked === true && v.lead,
                                  }
                                : v,
                            ),
                          )
                        }
                      />
                      {d.name}
                    </label>
                    <label
                      className="flex items-center gap-2 text-muted-foreground"
                      title={
                        occupied
                          ? "This department already has a Lead"
                          : undefined
                      }
                    >
                      <Checkbox
                        aria-label={`Lead of ${d.name}`}
                        checked={choice.lead}
                        disabled={!choice.member || occupied || busy}
                        onCheckedChange={(checked) =>
                          setDepartments((values) =>
                            values.map((v) =>
                              v.id === d.id
                                ? { ...v, lead: checked === true }
                                : v,
                            ),
                          )
                        }
                      />
                      Lead
                    </label>
                  </div>
                );
              })}
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
      </DialogContent>
    </Dialog>
  );
}

export function MembersPage() {
  const workspace = useWorkspace();
  const data = workspace?.data;
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <LoadDirectory />;
  const matches = data.members.filter((m) =>
    `${m.name} ${m.helixRole ?? ""} ${m.role} ${data.departments
      .filter((d) => d.memberIds.includes(m.id))
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
              {data.canAdmin && (
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
                  {data.departments
                    .filter((d) => d.memberIds.includes(m.id))
                    .map((d) => d.name)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {seenDate(m.lastSeenAt)}
                </TableCell>
                {data.canAdmin && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${m.name}`}
                      onClick={() => setEditing(m)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!matches.length && (
              <NoResults columns={data.canAdmin ? 6 : 5}>
                No members match your search.
              </NoResults>
            )}
          </TableBody>
        </Table>
      </Directory>
      {editing && data.canAdmin && (
        <MemberEditor
          key={editing.id}
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
