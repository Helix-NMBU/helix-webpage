import { useState } from "react";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@libs/components/ui/avatar";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { MAX_TASK_ASSIGNEES, type ProjectMember } from "./types";
import { useNotify } from "../MemberPlatform/MemberNotifications";

function imageSource(value?: string | null): string | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function MemberAvatar({ member }: { member: ProjectMember }) {
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "?";
  const src = imageSource(member.avatarUrl);
  return <Avatar size="sm" title={member.name} aria-label={member.name} role="img">
    {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
    <AvatarFallback aria-hidden="true">{initials}</AvatarFallback>
  </Avatar>;
}

export function AssigneeAvatars({ assigneeIds, members, maxVisible = 3 }: { assigneeIds: string[]; members: ProjectMember[]; maxVisible?: number }) {
  const assigned = assigneeIds.map(id => members.find(member => member.id === id) ?? { id, name: "Inactive member" });
  if (!assigned.length) return <span className="text-sm text-muted-foreground">Unassigned</span>;
  const remaining = assigned.slice(maxVisible);
  return <AvatarGroup role="group" aria-label={`Assigned to ${assigned.map(member => member.name).join(", ")}`}>
    {assigned.slice(0, maxVisible).map(member => <MemberAvatar key={member.id} member={member} />)}
    {remaining.length > 0 && <AvatarGroupCount role="img" aria-label={remaining.map(member => member.name).join(", ")} title={remaining.map(member => member.name).join(", ")}>+{remaining.length}</AvatarGroupCount>}
  </AvatarGroup>;
}

export function AssigneePicker({ id, value, members, onChange, disabled = false }: {
  id: string; value: string[]; members: ProjectMember[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const notify = useNotify();
  const options = [...members, ...value.filter(key => !members.some(member => member.id === key)).map(key => ({ id: key, name: "Inactive member" }))];
  const filtered = options.filter(member => member.name.toLowerCase().includes(search.toLowerCase()));
  function toggle(memberId: string) {
    if (disabled) return;
    if (value.includes(memberId)) onChange(value.filter(key => key !== memberId));
    else if (value.length < MAX_TASK_ASSIGNEES) onChange([...value, memberId]);
    else notify("Assignment limit reached", `A task can have up to ${MAX_TASK_ASSIGNEES} assignees.`, { variant: "warning", href: null });
  }
  return <Popover open={open} onOpenChange={next => { if (!disabled) { setOpen(next); if (!next) setSearch(""); } }}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" disabled={disabled} aria-label="Choose task assignees" className="h-9 w-full justify-start gap-2 font-normal">
      {value.length ? <><AssigneeAvatars assigneeIds={value} members={members} maxVisible={2} /><span className="truncate text-xs">{value.length === 1 ? options.find(member => member.id === value[0])?.name : `${value.length} assignees`}</span></> : "Assign to…"}
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-72 p-2"><div className="p-1"><Input autoFocus aria-label="Search members to assign" placeholder="Search members…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div className="mt-1 max-h-64 overflow-y-auto" role="group" aria-label="Task assignees">
        {filtered.map(member => <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
          <Checkbox aria-label={`Assign ${member.name}`} checked={value.includes(member.id)} disabled={disabled} onCheckedChange={() => toggle(member.id)} /><MemberAvatar member={member} /><span className="truncate">{member.name}</span>
        </label>)}
        {!filtered.length && <p className="px-2 py-4 text-sm text-muted-foreground">No members found.</p>}
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-2"><Button type="button" size="sm" variant="ghost" disabled={!value.length || disabled} onClick={() => onChange([])}>Clear</Button><Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button></div>
    </PopoverContent>
  </Popover>;
}
