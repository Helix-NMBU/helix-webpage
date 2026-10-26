export type PublicPosition = {
  id: string;
  title: string;
  department: string;
  applyUrl: string;
  contact: { name: string; email: string; linkedin?: string };
  about: string;
  tasks: string[];
  achieve: string[];
  /** The public endpoint omits this field; filter defensively if it returns it. */
  visible?: boolean;
};

export async function fetchPublicPositions(): Promise<PublicPosition[]> {
  const response = await fetch("/api/website?action=positions", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load open positions. Please try again.");

  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !Array.isArray((result as { positions?: unknown }).positions)) {
    throw new Error("Could not load open positions. Please try again.");
  }

  return (result as { positions: PublicPosition[] }).positions.filter((position) => position.visible !== false);
}
