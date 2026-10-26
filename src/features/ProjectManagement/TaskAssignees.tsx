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

export function AssigneeAvatars({ assigneeIds, members, maxVisible = 3, assignmentRole = "assignee", showNames = false }: { assigneeIds: string[]; members: ProjectMember[]; maxVisible?: number; assignmentRole?: "assignee" | "lead"; showNames?: boolean }) {
  const assigned = assigneeIds.map(id => members.find(member => member.id === id) ?? { id, name: "Inactive member" });
  if (!assigned.length) return <span className="text-sm text-muted-foreground">{assignmentRole === "lead" ? "No leads" : "Unassigned"}</span>;
  const remaining = assigned.slice(maxVisible);
  const avatars = <AvatarGroup role="group" aria-label={`${assignmentRole === "lead" ? "Leads:" : "Assigned to"} ${assigned.map(member => member.name).join(", ")}`}>
    {assigned.slice(0, maxVisible).map(member => <MemberAvatar key={member.id} member={member} />)}
    {remaining.length > 0 && <AvatarGroupCount role="img" aria-label={remaining.map(member => member.name).join(", ")} title={remaining.map(member => member.name).join(", ")}>+{remaining.length}</AvatarGroupCount>}
  </AvatarGroup>;
  return showNames ? <div className="inline-flex max-w-64 items-center gap-2">{avatars}<span className="truncate text-sm" title={assigned.map(member => member.name).join(", ")} aria-hidden="true">{assigned.map(member => member.name).join(", ")}</span></div> : avatars;
}

export function AssigneePicker({ id, value, members, onChange, disabled = false, assignmentRole = "assignee", inline = false, triggerLabel, onOpenChange, onCommit }: {
  id: string; value: string[]; members: ProjectMember[]; onChange: (ids: string[]) => void; disabled?: boolean; assignmentRole?: "assignee" | "lead"; inline?: boolean; triggerLabel?: string; onOpenChange?: (open: boolean) => void; onCommit?: (ids: string[]) => Promise<boolean>;
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
    else notify("Assignment limit reached", `A ${assignmentRole === "lead" ? "milestone" : "task"} can have up to ${MAX_TASK_ASSIGNEES} ${assignmentRole === "lead" ? "leads" : "assignees"}.`, { variant: "warning", href: null });
  }
  function changeOpen(next: boolean) { if (!disabled) { setOpen(next); if (!next) setSearch(""); onOpenChange?.(next); } }
  return <Popover open={open} onOpenChange={changeOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" variant={inline ? "ghost" : "outline"} disabled={disabled} aria-label={triggerLabel ?? (assignmentRole === "lead" ? "Choose milestone leads" : "Choose task assignees")} aria-describedby={`${id}-summary`} className={inline ? "-mx-2 h-auto justify-start px-2 py-1 font-normal" : "h-9 w-full justify-start gap-2 font-normal"}>
      {inline ? <AssigneeAvatars assigneeIds={value} members={members} assignmentRole={assignmentRole} showNames /> : value.length ? <><AssigneeAvatars assigneeIds={value} members={members} maxVisible={2} assignmentRole={assignmentRole} /><span className="truncate text-xs">{value.length === 1 ? options.find(member => member.id === value[0])?.name : `${value.length} ${assignmentRole === "lead" ? "leads" : "assignees"}`}</span></> : assignmentRole === "lead" ? "Add leads…" : "Assign to…"}
    </Button></PopoverTrigger>
    <span id={`${id}-summary`} className="sr-only">{value.length ? `${assignmentRole === "lead" ? "Leads:" : "Assigned to"} ${value.map(key => options.find(member => member.id === key)?.name).join(", ")}.` : assignmentRole === "lead" ? "No leads." : "Unassigned."}</span>
    <PopoverContent align="start" className="w-72 p-2"><div className="p-1"><Input autoFocus aria-label="Search members to assign" placeholder="Search members…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div className="mt-1 max-h-64 overflow-y-auto" role="group" aria-label={assignmentRole === "lead" ? "Milestone leads" : "Task assignees"}>
        {filtered.map(member => <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
          <Checkbox aria-label={`Assign ${member.name}${assignmentRole === "lead" ? " as lead" : ""}`} checked={value.includes(member.id)} disabled={disabled} onCheckedChange={() => toggle(member.id)} /><MemberAvatar member={member} /><span className="truncate">{member.name}</span>
        </label>)}
        {!filtered.length && <p className="px-2 py-4 text-sm text-muted-foreground">No members found.</p>}
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-2"><Button type="button" size="sm" variant="ghost" disabled={!value.length || disabled} onClick={() => onChange([])}>Clear</Button><div className="flex gap-1">{onCommit && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => changeOpen(false)}>Cancel</Button>}<Button type="button" size="sm" disabled={disabled} onClick={() => { if (onCommit) void onCommit(value).then(saved => { if (saved) changeOpen(false); }); else changeOpen(false); }}>{onCommit ? "Save leads" : "Done"}</Button></div></div>
    </PopoverContent>
  </Popover>;
}
