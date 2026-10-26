export type RecruitmentPosition = {
  id: string;
  title: string;
  department: string;
  applyUrl: string;
  contact: { name: string; email: string; linkedin?: string };
  about: string;
  tasks: string[];
  achieve: string[];
  visible: boolean;
};

export async function publicPositions(): Promise<RecruitmentPosition[]> {
  const response = await fetch("/api/website?action=positions", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load available positions. Please try again.");
  return (await response.json()).positions;
}
