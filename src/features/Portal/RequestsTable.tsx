import { CircleAlert, CircleCheck, CircleDashed, CircleMinus, CircleX, Clock3, Loader, MessageSquare, MoreVertical, Send, Users, type LucideIcon } from "lucide-react";
import { cn } from "@libs/lib/utils";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { InterestAvatars } from "./InterestDialog";
import { getRequestStatus, type RequestStatusKey, type RequestStatusTone } from "./requestStatus";
import type { SponsorResponse } from "./types";

export type RequestRow = {
  id: string;
  entityType: "request" | "opportunity" | "engagement";
  title: string;
  type: string;
  status: string;
  createdAt: string;
};

type StatusStyle = { icon: LucideIcon; iconClass?: string };

const statusStyles: Record<RequestStatusKey, StatusStyle> = {
  draft: { icon: CircleDashed },
  submitted: { icon: Send },
  under_review: { icon: Loader },
  input_needed: { icon: CircleAlert, iconClass: "fill-amber-500 text-white" },
  approved: { icon: CircleCheck, iconClass: "fill-emerald-500 text-white" },
  scheduled: { icon: Clock3 },
  published: { icon: CircleCheck, iconClass: "fill-emerald-500 text-white" },
  in_progress: { icon: Loader },
  completed: { icon: CircleCheck, iconClass: "fill-emerald-500 text-white" },
  closed: { icon: CircleMinus },
  cancelled: { icon: CircleX },
};

const toneClasses: Record<RequestStatusTone, string> = {
  neutral: "border-border bg-background text-muted-foreground",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  attention: "border-amber-200 bg-amber-50 text-amber-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  const meta = getRequestStatus(status);
  const { icon: Icon, iconClass } = statusStyles[meta.key];
  return (
    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap px-1.5 font-normal", toneClasses[meta.tone])}>
      <Icon className={cn("size-3.5", iconClass)} />
      {meta.label}
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
