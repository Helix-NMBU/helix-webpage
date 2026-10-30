import { IconFilter2 } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";

export type OverviewColumn = readonly [string, string];
export const OVERVIEW_PROJECT_COLUMNS = [
  ["department", "Department"],
  ["priority", "Priority"],
  ["leads", "Leads"],
  ["start", "Start date"],
  ["deadline", "Target date"],
  ["milestones", "Milestones"],
  ["tasks", "Tasks"],
  ["status", "Status"],
  ["progress", "Progress"],
] as const;
export const OVERVIEW_MILESTONE_COLUMNS = [
  ["department", "Project"],
  ["priority", "Priority"],
  ["leads", "Leads"],
  ["deadline", "Target date"],
  ["tasks", "Tasks"],
  ["status", "Status"],
  ["progress", "Progress"],
] as const;

export function overviewColumns(params: URLSearchParams, key: string, columns: readonly OverviewColumn[]) {
  const keys = columns.map(([column]) => column);
  if (!params.has(key)) return keys;
  const selected = params.get(key)!.split(",");
  // Older saved views combined progress with status; retain that visibility.
  if (selected.includes("status") && !selected.includes("!progress") && !selected.includes("progress")) selected.push("progress");
  return keys.filter(column => selected.includes(column));
}

export function OverviewColumnMenu({ label, columns, visible, onToggle }: {
  label: string;
  columns: readonly OverviewColumn[];
  visible: string[];
  onToggle: (key: string) => void;
}) {
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label={`${label} columns`} title={`${label} columns`}><IconFilter2 aria-hidden="true" className="size-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-4">
    <p className="text-sm font-medium">Display columns</p>
    <div role="group" aria-label={`${label} display columns`} className="flex flex-wrap gap-2">
      {columns.map(([key, title]) => <Button key={key} type="button" className="rounded-full" size="sm" variant={visible.includes(key) ? "secondary" : "outline"} aria-pressed={visible.includes(key)} onClick={() => onToggle(key)}>{title}</Button>)}
    </div>
  </PopoverContent></Popover>;
}
