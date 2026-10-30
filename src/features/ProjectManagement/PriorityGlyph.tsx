import type { TaskPriority } from "./types";

// Reproduces the 16px glyph geometry in the supplied Linear reference.
export function PriorityGlyph({ priority }: { priority: TaskPriority | "none" }) {
  const filled = priority === "high" ? 3 : priority === "normal" ? 2 : 1;
  const color = {
    urgent: "text-red-700! dark:text-red-300!",
    high: "text-red-500! dark:text-red-400!",
    normal: "text-orange-500! dark:text-orange-400!",
    low: "text-yellow-500! dark:text-yellow-400!",
    none: "text-muted-foreground",
  }[priority];
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className={`size-4 shrink-0 ${color}`} aria-hidden="true">
    {priority === "none" ? <path d="M1 7h4v2H1zm5 0h4v2H6zm5 0h4v2h-4z" /> : priority === "urgent" ? <path fillRule="evenodd" clipRule="evenodd" d="M3 1h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Zm4 3h2v5H7V4Zm1 6.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z" /> : <>
      <rect x="1.5" y="8" width="3" height="6" />
      <rect x="6.5" y="5" width="3" height="9" opacity={filled >= 2 ? 1 : 0.5} />
      <rect x="11.5" y="2" width="3" height="12" opacity={filled >= 3 ? 1 : 0.5} />
    </>}
  </svg>;
}
