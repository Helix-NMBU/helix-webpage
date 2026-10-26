import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Skeleton } from "@libs/components/ui/skeleton";
import { Button } from "@libs/components/ui/button";
import { useNotify } from "./MemberNotifications";
import { useMemberFeatureAccess } from "./MemberFeatureAccess";
import { getAccessDirectory, saveAccessAssignment, type AccessDirectory, type AccessMember } from "./member-access-api";
import type { PlatformRoleKey } from "./MemberFeatureAccess";

export function MemberAccessPage() {
  const access = useMemberFeatureAccess();
  const notify = useNotify();
  const owner = useRef<string | null>(access.authUserId);
  owner.current = access.authUserId;
  const [directory, setDirectory] = useState<AccessDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { departmentId: string; roleKeys: PlatformRoleKey[] }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAccessDirectory(owner);
      setDirectory(result);
      setDrafts((current) => {
        const next = { ...current };
        for (const member of result.members) {
          if (!next[member.id]) next[member.id] = { departmentId: member.departmentId ?? "", roleKeys: member.roleKeys };
        }
        return next;
      });
    } catch (error) {
      notify("Could not load members", error instanceof Error ? error.message : "Please try again.", {
        id: "member-access-directory", variant: "error", href: null,
        action: { label: "Try again", onClick: () => void load() },
      });
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (directory?.members ?? []).filter((member) => !needle || `${member.name} ${member.email}`.toLowerCase().includes(needle));
  }, [directory?.members, query]);

  function patchDraft(member: AccessMember, patch: Partial<{ departmentId: string; roleKeys: PlatformRoleKey[] }>) {
    const current = drafts[member.id] ?? { departmentId: member.departmentId ?? "", roleKeys: member.roleKeys };
    setDrafts((values) => ({ ...values, [member.id]: { ...current, ...patch } }));
  }

  async function save(member: AccessMember) {
    const draft = drafts[member.id];
    if (!draft?.departmentId) {
      notify("Choose a department", "Every member must be assigned to a department.", { variant: "error", href: null });
      return;
    }
    setSaving(member.id);
    try {
      await saveAccessAssignment(owner, { memberId: member.id, departmentId: draft.departmentId, roleKeys: draft.roleKeys });
      setDirectory((value) => value ? { ...value, members: value.members.map((item) => item.id === member.id ? { ...item, departmentId: draft.departmentId, roleKeys: draft.roleKeys } : item) } : value);
      notify("Member access saved", `${member.name}'s department and roles were updated.`, { variant: "success", href: null });
    } catch (error) {
      notify("Could not save member access", error instanceof Error ? error.message : "Please try again.", { variant: "error", href: null });
    } finally { setSaving(null); }
  }

  if (loading && !directory) return <div className="space-y-4" role="status" aria-label="Loading members"><Skeleton className="h-10 w-64" /><Skeleton className="h-56 w-full" /></div>;
  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Member access</h1>
        <p className="text-sm text-muted-foreground">Assign each member to a department and grant one or more platform roles.</p>
      </header>
      <div className="max-w-sm space-y-2"><Label htmlFor="member-search">Search members</Label><Input id="member-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" /></div>
      <div className="space-y-4">
        {visibleMembers.map((member) => {
          const draft = drafts[member.id] ?? { departmentId: member.departmentId ?? "", roleKeys: member.roleKeys };
          const isSelf = member.id === access.member?.memberId;
          const changed = draft.departmentId !== (member.departmentId ?? "") || draft.roleKeys.length !== member.roleKeys.length || draft.roleKeys.some((role) => !member.roleKeys.includes(role));
          return <Card key={member.id}>
            <CardHeader><CardTitle>{member.name || member.email}</CardTitle><CardDescription>{member.email}{isSelf ? " · You" : ""}</CardDescription></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-[minmax(220px,1fr)_2fr_auto] md:items-end">
              <div className="space-y-2"><Label htmlFor={`department-${member.id}`}>Department</Label><Select value={draft.departmentId} onValueChange={(departmentId: string) => patchDraft(member, { departmentId })} disabled={isSelf || saving === member.id}>
                <SelectTrigger id={`department-${member.id}`} aria-label={`Department for ${member.name}`}><SelectValue placeholder="Choose a department" /></SelectTrigger>
                <SelectContent>{directory?.departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent>
              </Select></div>
              <fieldset className="space-y-2" disabled={isSelf || saving === member.id}><legend className="text-sm font-medium">Roles</legend><div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">{directory?.roles.map((role) => <Label key={role.key} htmlFor={`role-${member.id}-${role.key}`} className="flex items-center gap-2 font-normal"><Checkbox id={`role-${member.id}-${role.key}`} checked={draft.roleKeys.includes(role.key)} onCheckedChange={(checked: boolean | "indeterminate") => patchDraft(member, { roleKeys: checked === true ? [...draft.roleKeys, role.key] : draft.roleKeys.filter((key) => key !== role.key) })} />{role.label}</Label>)}</div></fieldset>
              <Button onClick={() => void save(member)} disabled={isSelf || !changed || saving === member.id || loading}>{isSelf ? "Your access is managed separately" : saving === member.id ? "Saving…" : "Save changes"}</Button>
            </CardContent>
          </Card>;
        })}
        {!visibleMembers.length && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No members match your search.</p>}
      </div>
    </section>
  );
}
