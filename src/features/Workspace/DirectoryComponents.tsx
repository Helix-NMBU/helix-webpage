import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { IconSearch } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Skeleton } from "@libs/components/ui/skeleton";
import { TableCell, TableRow } from "@libs/components/ui/table";
import { useWorkspace } from "./WorkspaceContext";
export function Directory({
  title,
  children,
  action,
  toolbar,
  fill = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  toolbar?: ReactNode;
  fill?: boolean;
}) {
  return (
    <section aria-label={title} className={fill ? "flex min-h-0 min-w-0 flex-1 flex-col gap-4" : "space-y-4"}>
      <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-medium">{title}</h1>
        {action}
      </div>
      {toolbar}
      <div className={fill ? "flex min-h-80 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card md:min-h-0" : "overflow-hidden rounded-xl border bg-card"}>
        {children}
      </div>
    </section>
  );
}
export function Search({
  label,
  value,
  onChange,
  outside = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  outside?: boolean;
}) {
  return (
    <div className={outside ? "relative max-w-sm" : "relative max-w-sm p-3"}>
      <IconSearch
        className={`pointer-events-none absolute size-4 text-muted-foreground ${outside ? "left-3 top-2" : "left-6 top-5"}`}
        aria-hidden="true"
      />
      <Input
        className={outside ? "h-8 pl-9" : "h-8 border-0 bg-transparent pl-9 shadow-none"}
        aria-label={label}
        placeholder={`${label}…`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
export function NoResults({
  columns,
  children,
}: {
  columns: number;
  children: ReactNode;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={columns}
        className="h-28 text-center text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}
export function LoadDirectory({ title = "Workspace", columns = 5 }: { title?: string; columns?: number }) {
  const workspace = useWorkspace();
  const { search } = useLocation();
  const timeline = title === "Projects" && new URLSearchParams(search).get("view") === "timeline";
  const headings = title === "Departments" ? ["Name", "Leads", "Membership", "Members", "Active projects"] : title === "Members" ? ["Name", "Role", "Joined", "Department", "Last seen"] : title === "Projects" ? ["Name", "Department", "Priority", "Leads", "Target date", "Tasks", "Status"] : Array.from({ length: columns }, () => "");
  return workspace?.loading ? (
    <section role="status" aria-label={`Loading ${title}`} className="space-y-4">
      <div className="flex min-h-9 items-center justify-between"><h1 className="text-lg font-medium">{title}</h1>{title === "Projects" && <Skeleton className="h-8 w-24" />}</div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {title !== "Departments" && <div className="p-3"><Skeleton className="h-8 w-56 max-w-full" /></div>}
        {timeline ? <div className="space-y-3 border-t p-4"><div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-32" /></div>{[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-4 border-t py-3"><Skeleton className="h-4 w-36" /><Skeleton className={`h-6 ${i % 2 ? "w-1/3" : "w-1/2"}`} /></div>)}</div> : <div className="overflow-x-auto"><div className="min-w-[42rem]"><div className="grid gap-4 border-y px-4 py-3" style={{ gridTemplateColumns: `2fr repeat(${headings.length - 1}, minmax(0, 1fr))` }}>{headings.map((heading, i) => <span key={i} className="text-xs font-medium text-muted-foreground">{heading || <Skeleton className="h-3 w-3/4" />}</span>)}</div>
        {Array.from({ length: 5 }, (_, row) => <div key={row} className="grid items-center gap-4 border-b px-4 py-4 last:border-0" style={{ gridTemplateColumns: `2fr repeat(${headings.length - 1}, minmax(0, 1fr))` }}>{headings.map((_, col) => <div key={col} className="flex items-center gap-2">{col === 0 && title === "Members" && <Skeleton className="size-7 shrink-0 rounded-full" />}<Skeleton className="h-4 w-3/4" /></div>)}</div>)}</div></div>}
      </div>
    </section>
  ) : (
    <Button variant="outline" onClick={() => void workspace?.refresh()}>
      Try again
    </Button>
  );
}
export const monthDate = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", {
        month: "short",
        year: "numeric",
        timeZone: "Europe/Oslo",
      }).format(new Date(value))
    : "—";
export const seenDate = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Oslo",
      }).format(new Date(value))
    : "—";
