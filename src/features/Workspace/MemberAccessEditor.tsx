import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { departmentAccess } from "../ProjectManagement/permissions";
import type { DepartmentAccess } from "../ProjectManagement/types";
import { Label } from "@libs/components/ui/label";
import { Skeleton } from "@libs/components/ui/skeleton";
import { useMemberFeatureAccess } from "../MemberPlatform/MemberFeatureAccess";
import { getAccessDirectory, saveWorkspaceAccess } from "../MemberPlatform/member-access-api";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { WORKSPACE_SPACES, type WorkspaceSpace } from "./access";
import type { WorkspaceDirectory, WorkspaceMember } from "./types";

export function MemberAccessEditor({ member, data, busy, setBusy, onSaved }: {
  member: WorkspaceMember;
  data: WorkspaceDirectory;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const access = useMemberFeatureAccess();
  const notify = useNotify();
  const owner = useRef(access.authUserId);
  owner.current = access.authUserId;
  const [loading, setLoading] = useState(true);
  const [originalSpaces, setOriginalSpaces] = useState<WorkspaceSpace[] | null>(null);
  const [spaceKeys, setSpaceKeys] = useState<WorkspaceSpace[]>([]);
  const [departments, setDepartments] = useState(() => data.departments.map(d => ({ id: d.id, revision: d.revision, member: d.memberIds.includes(member.id), lead: d.leadId === member.id, access: departmentAccess(d, member.id) })));
  const [roleOverride, setRoleOverride] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void getAccessDirectory(owner).then(result => {
      if (!active) return;
      const assignment = result.members.find(item => item.id === member.id);
      if (!assignment || !Array.isArray(assignment.spaceKeys)) throw new Error("This member's access is unavailable. Reload Members and try again.");
      setRoleOverride(assignment.roleKeys.some(role => role === "project_manager" || role === "platform_administrator"));
      setOriginalSpaces(assignment.spaceKeys);
      setSpaceKeys(assignment.spaceKeys);
    }).catch(error => {
      if (!active) return;
      notify("Could not load member access", error instanceof Error ? error.message : "Please try again.", {
        id: "member-access-editor", variant: "error", href: null,
        action: { label: "Try again", onClick: retry },
      });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, member.id, notify, retry]);

  const isSelf = member.id === data.viewerId;
  const changed = originalSpaces && (spaceKeys.length !== originalSpaces.length || spaceKeys.some(key => !originalSpaces.includes(key)) || departments.some(choice => {
    const d = data.departments.find(d => d.id === choice.id)!;
    return choice.access !== departmentAccess(d, member.id);
  }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || isSelf || !changed) return;
    setBusy(true);
    try {
      await saveWorkspaceAccess(owner, { memberId: member.id, expectedRevision: member.revision, departments, spaceKeys });
      notify("Member access saved", "Their department access and space access have been updated.", { variant: "success", href: null });
      onSaved();
    } catch (error) {
      notify("Could not save member access", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null });
    } finally { setBusy(false); }
  }

  if (loading) return <Skeleton className="h-48 w-full" aria-label="Loading member access" />;
  if (!originalSpaces) return <Button variant="outline" onClick={retry}>Try again</Button>;
  return <form className="space-y-5" onSubmit={event => void save(event)}>
    <fieldset disabled={busy || isSelf} className="space-y-3">
      <legend className="mb-2 font-medium">Department access</legend>
      <p className="text-sm text-muted-foreground">Leads manage department content and work. Members can update their assigned task statuses. Viewers have read-only access.</p>
      {roleOverride && <p className="text-sm text-muted-foreground">Their platform role grants full management access to every department. Department access is set to Viewer.</p>}
      {data.departments.map(department => {
        const choice = departments.find(d => d.id === department.id)!;
        const occupied = !!department.leadId && department.leadId !== member.id;
        return <div key={department.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
          <Label htmlFor={`department-access-${department.id}`} className="font-normal">{department.name}</Label>
          <Select value={roleOverride ? "viewer" : choice.access ?? "none"} disabled={busy || isSelf || roleOverride} onValueChange={value => {
            const level = value === "none" ? null : value as DepartmentAccess;
            setDepartments(values => values.map(item => item.id === department.id ? { ...item, access: level, member: level !== null, lead: level === "lead" } : item));
          }}>
            <SelectTrigger id={`department-access-${department.id}`} aria-label={`Access to ${department.name}`} className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">No access</SelectItem><SelectItem value="member">Member</SelectItem><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="lead" disabled={occupied}>Lead</SelectItem></SelectContent>
          </Select>
        </div>;
      })}
    </fieldset>
    <fieldset disabled={busy || isSelf} className="space-y-3">
      <legend className="mb-2 font-medium">Space access</legend>
      {WORKSPACE_SPACES.map(space => <Label key={space.key} className="flex items-center gap-2 font-normal">
        <Checkbox checked={spaceKeys.includes(space.key)} onCheckedChange={checked => setSpaceKeys(keys => checked === true ? [...keys, space.key] : keys.filter(key => key !== space.key))} />{space.label}
      </Label>)}
    </fieldset>
    {isSelf && <p className="text-sm text-muted-foreground">Another platform administrator must change your access.</p>}
    <div className="flex justify-end"><Button type="submit" disabled={busy || isSelf || !changed}>{busy ? "Saving…" : "Save access"}</Button></div>
  </form>;
}
