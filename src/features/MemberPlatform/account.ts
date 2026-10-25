export type MemberAccount = {
  name: string;
  email: string;
  role: "Admin" | "Member";
};

export function readMemberAccount(value: unknown): MemberAccount | null {
  if (!value || typeof value !== "object") return null;
  const account = value as Partial<MemberAccount>;
  if (typeof account.email !== "string" || typeof account.name !== "string")
    return null;
  if (account.role !== "Admin" && account.role !== "Member") return null;
  return {
    name: account.name.trim() || account.email,
    email: account.email,
    role: account.role,
  };
}

export function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  return (
    words.length > 1
      ? `${words[0][0]}${words[words.length - 1][0]}`
      : name.slice(0, 2)
  ).toUpperCase();
}
