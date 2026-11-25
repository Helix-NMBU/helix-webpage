import { Avatar, AvatarFallback, AvatarImage } from "@libs/components/ui/avatar";
import { avatarFallbackStyle } from "@libs/components/avatar-colors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import type { PositionContactMember } from "./position-contact";

export function PositionContactPicker({ members, value, onChange, disabled }: {
  members: PositionContactMember[]; value: string; onChange: (id: string) => void; disabled: boolean;
}) {
  const selected = members.find(member => member.id === value);
  return <div className="space-y-2">
    <Select value={selected?.id ?? ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id="position-contact" aria-label="Contact member" className="h-auto min-h-9 w-full"><SelectValue placeholder="Choose a Management member" /></SelectTrigger>
      <SelectContent>{members.map(member => <SelectItem key={member.id} value={member.id} textValue={member.name}>
        <Avatar size="sm" aria-hidden="true">
          {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback style={avatarFallbackStyle(member.id)}>{member.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</AvatarFallback>
        </Avatar>
        <span>{member.name}</span>
      </SelectItem>)}</SelectContent>
    </Select>
    {selected ? <p className="text-sm text-muted-foreground">{selected.email}{selected.linkedin && <> · <a className="underline underline-offset-4" href={selected.linkedin} target="_blank" rel="noreferrer">LinkedIn profile</a></>}</p>
      : <p className="text-sm text-muted-foreground">The selected member's profile supplies the public contact details.</p>}
  </div>;
}
