import type { ReactNode } from "react";
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
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex min-h-9 items-center justify-between gap-4">
        <h1 className="text-lg font-medium">{title}</h1>
        {action}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {children}
      </div>
    </section>
  );
}
export function Search({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative max-w-sm p-3">
      <IconSearch
        className="pointer-events-none absolute left-6 top-5 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        className="h-8 border-0 bg-transparent pl-9 shadow-none"
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
  return workspace?.loading ? (
    <section role="status" aria-label={`Loading ${title}`} className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="p-3"><Skeleton className="h-8 w-56 max-w-full" /></div>
        <div className="grid gap-4 border-y px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns }, (_, i) => <Skeleton key={i} className="h-3 w-3/4" />)}</div>
        {Array.from({ length: 5 }, (_, row) => <div key={row} className="grid gap-4 border-b px-4 py-5 last:border-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns }, (_, col) => <Skeleton key={col} className="h-4 w-3/4" />)}</div>)}
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
