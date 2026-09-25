import { CircleAlert, CircleCheck, CircleDashed, CircleMinus, Loader, MessageSquare, MoreVertical, Users, type LucideIcon } from "lucide-react";
import { cn } from "@libs/lib/utils";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { InterestAvatars } from "./InterestDialog";
import type { SponsorResponse } from "./types";

export type RequestRow = {
  id: string;
  entityType: "request" | "opportunity" | "engagement";
  title: string;
  type: string;
  status: string;
  createdAt: string;
};

type StatusStyle = { icon: LucideIcon; iconClass: string };

const done: StatusStyle = { icon: CircleCheck, iconClass: "fill-emerald-500 text-white" };
const working: StatusStyle = { icon: Loader, iconClass: "text-muted-foreground" };
const needsYou: StatusStyle = { icon: CircleAlert, iconClass: "fill-amber-500 text-white" };
const fresh: StatusStyle = { icon: CircleDashed, iconClass: "text-muted-foreground" };
const ended: StatusStyle = { icon: CircleMinus, iconClass: "text-muted-foreground" };

const statusStyles: Record<string, StatusStyle> = {
  completed: done, published: done, fulfilled: done, approved: done,
  in_progress: working, scheduled: working, quoting: working, under_review: working,
  waiting_for_sponsor: needsYou, changes_requested: needsYou,
  submitted: fresh, requested: fresh, draft: fresh,
  closed: ended, cancelled: ended,
};

export const statusLabel = (status: string) => {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function StatusBadge({ status }: { status: string }) {
  const { icon: Icon, iconClass } = statusStyles[status] ?? ended;
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap px-1.5 font-normal text-muted-foreground">
      <Icon className={cn("size-3.5", iconClass)} />
      {statusLabel(status)}
    </Badge>
  );
}

export function RequestsTable({ rows, interest, onOpenThread, onViewInterest, className }: {
  rows: RequestRow[];
  interest: Map<string, SponsorResponse[]>;
  onOpenThread: (row: RequestRow) => void;
  onViewInterest: (row: RequestRow) => void;
  className?: string;
}) {
  return (
    <div className={cn("@container overflow-hidden rounded-lg border bg-background", className)}>
      <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-3 [&_td]:py-2.5 [&_th:first-child]:pl-4 [&_th:last-child]:pr-3">
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-foreground">Request</TableHead>
            <TableHead className="hidden text-foreground @2xl:table-cell">Type</TableHead>
            <TableHead className="hidden text-foreground @2xl:table-cell">Date</TableHead>
            <TableHead className="text-foreground">Interest</TableHead>
            <TableHead className="text-foreground">Status</TableHead>
            <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const date = new Date(row.createdAt).toLocaleDateString();
            const interested = row.entityType === "opportunity" ? interest.get(row.id) ?? [] : [];
            return (
              <TableRow key={`${row.entityType}-${row.id}`}>
                <TableCell>
                  <button type="button" onClick={() => onOpenThread(row)} className="text-left underline-offset-4 hover:underline">{row.title}</button>
                  <span className="block text-xs text-muted-foreground @2xl:hidden">{row.type} · {date}</span>
                </TableCell>
                <TableCell className="hidden @2xl:table-cell">
                  <Badge variant="outline" className="whitespace-nowrap px-1.5 font-normal text-muted-foreground">{row.type}</Badge>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums @2xl:table-cell">{date}</TableCell>
                <TableCell>
                  {row.entityType !== "opportunity" ? (
                    <span className="text-muted-foreground" title="Not posted to Helix members">—</span>
                  ) : interested.length ? (
                    <button
                      type="button"
                      onClick={() => onViewInterest(row)}
                      aria-label={`${interested.length} ${interested.length === 1 ? "member" : "members"} interested. View`}
                      className="-mx-1.5 inline-flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
                    >
                      <InterestAvatars responses={interested} />
                      <span className="text-xs font-medium">{interested.length}</span>
                    </button>
                  ) : (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">None yet</span>
                  )}
                </TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground data-[state=open]:bg-muted">
                        <MoreVertical />
                        <span className="sr-only">Actions for {row.title}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => onOpenThread(row)}><MessageSquare /> Open conversation</DropdownMenuItem>
                      {interested.length > 0 && <DropdownMenuItem onSelect={() => onViewInterest(row)}><Users /> View interested members</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
