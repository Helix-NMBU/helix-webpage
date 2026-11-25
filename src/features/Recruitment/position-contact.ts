export type PositionContactMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  linkedin?: string;
};

export function memberContact(member: PositionContactMember) {
  return { name: member.name, email: member.email, ...(member.linkedin ? { linkedin: member.linkedin } : {}) };
}
