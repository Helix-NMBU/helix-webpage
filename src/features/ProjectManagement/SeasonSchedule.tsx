import { useId, useRef, useState, type FormEvent } from "react";
import { IconDots } from "@tabler/icons-react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@libs/components/ui/tabs";
import { Textarea } from "@libs/components/ui/textarea";
import { cn } from "@libs/lib/utils";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { formatDate, shortDate } from "./model";
import { ProjectDatePicker } from "./ProjectDatePicker";
import { emptySeasonPhases, seasonPhaseLabels, seasonPhaseStatuses, type SeasonPhase, type SeasonPhaseId, type SeasonPhaseStatus } from "./season-schedule";
import type { ProjectMutation, ProjectWorkspace } from "./types";

type SaveSchedule = (change: Extract<ProjectMutation, { action: "save_season_schedule" }>) => Promise<boolean>;

const statusLabels: Record<SeasonPhaseStatus, string> = { planned: "Planned", in_progress: "In progress", done: "Complete" };
const badgeVariant = { planned: "outline", in_progress: "default", done: "secondary" } as const;
const endDateLabels: Record<SeasonPhaseId, string> = {
  recruitment: "Season kickoff",
  "draft-concept": "Draft Concept Review",
  concept: "Concept Event",
  design: "Design Event",
  construction: "Car Unveiling",
  test: "Competition start",
};

function PhaseDates({ startDate, endDate }: Pick<SeasonPhase, "startDate" | "endDate">) {
  const date = (value: string) => <time dateTime={value} title={formatDate(value)} className="whitespace-nowrap">{shortDate(value)}</time>;
  if (startDate && endDate && startDate !== endDate) return <>{date(startDate)} – {date(endDate)}</>;
  if (startDate && endDate) return date(startDate);
  if (startDate) return <>From {date(startDate)}</>;
  if (endDate) return <>Until {date(endDate)}</>;
  return "Dates to confirm";
}

export function SeasonSchedule({ schedule }: { schedule: ProjectWorkspace["seasonSchedule"] }) {
  const heading = useId();
  if (!schedule) return null;
  return <section aria-labelledby={heading} className="@container">
    <h3 id={heading} className="sr-only">Season timeline</h3>
    <ol className="grid grid-cols-2 gap-2 @md:grid-cols-3 @min-[52rem]:grid-cols-6">
      {schedule.phases.map(phase => {
        const current = phase.status === "in_progress";
        return <li
          key={phase.id}
          aria-current={current ? "step" : undefined}
          className="flex min-w-0 flex-col items-start gap-1.5 rounded-md border px-2.5 py-2"
        >
          <span className={cn("text-sm font-medium leading-snug", phase.status === "done" && "text-muted-foreground")}>
            {seasonPhaseLabels[phase.id]}
          </span>
          <p className="text-xs text-muted-foreground"><PhaseDates startDate={phase.startDate} endDate={phase.endDate} /></p>
          <Badge className={cn("mt-auto", phase.status === "done" && "bg-muted/50 text-muted-foreground")} variant={badgeVariant[phase.status]}>{statusLabels[phase.status]}</Badge>
        </li>;
      })}
    </ol>
  </section>;
}

export function SeasonScheduleActions({ workspace, busy, save }: { workspace: ProjectWorkspace; busy: boolean; save: SaveSchedule }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} type="button" variant="outline" size="icon-sm" disabled={busy} aria-label="Schedule actions" title="Schedule actions">
          <IconDots aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        if (openingDialog.current) event.preventDefault();
        openingDialog.current = false;
      }}>
        <DropdownMenuItem onSelect={() => { openingDialog.current = true; setOpen(true); }}>Edit schedule</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent
        className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={!busy}
        onPointerDownOutside={event => event.preventDefault()}
        onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}
      >
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <DialogTitle>Edit {workspace.season} schedule</DialogTitle>
          <DialogDescription>Phase dates also update the events on the Progress chart.</DialogDescription>
        </DialogHeader>
        <SeasonScheduleFields key={workspace.season} workspace={workspace} busy={busy} save={save} close={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  </>;
}

function SeasonScheduleFields({ workspace, busy, save, close }: { workspace: ProjectWorkspace; busy: boolean; save: SaveSchedule; close: () => void }) {
  const notify = useNotify();
  const [original] = useState(() => workspace.seasonSchedule ?? { phases: emptySeasonPhases(), revision: 0 });
  const [phases, setPhases] = useState(original.phases);
  const [selectedId, setSelectedId] = useState<SeasonPhaseId>(() =>
    original.phases.find(phase => phase.status === "in_progress")?.id
    ?? original.phases.find(phase => phase.status === "planned")?.id
    ?? "recruitment",
  );
  const dirty = phases.some(({ startDate, endDate, status, note }, index) => {
    const saved = original.phases[index];
    return startDate !== saved.startDate || endDate !== saved.endDate || status !== saved.status || note !== saved.note;
  });

  function change(id: SeasonPhaseId, fields: Partial<Omit<SeasonPhase, "id">>) {
    setPhases(current => current.map(phase => {
      if (phase.id === id) return { ...phase, ...fields };
      return id === "construction" && phase.id === "test" && "endDate" in fields
        ? { ...phase, startDate: fields.endDate ?? null } : phase;
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !dirty) return;
    const invalid = phases.find(phase => phase.startDate && phase.endDate && phase.startDate > phase.endDate);
    if (invalid) {
      setSelectedId(invalid.id);
      notify("Check the phase dates", `${seasonPhaseLabels[invalid.id]} must start on or before its end date.`, { variant: "error", href: null });
      return;
    }
    if (await save({ action: "save_season_schedule", season: workspace.season, expectedRevision: original.revision, phases })) close();
  }

  return <form className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]" onSubmit={submit}>
    <Tabs
      value={selectedId}
      onValueChange={id => setSelectedId(id as SeasonPhaseId)}
      orientation="vertical"
      className="min-h-0 flex-col gap-0 overflow-y-auto sm:grid sm:grid-cols-[13rem_minmax(0,1fr)]"
    >
      <TabsList aria-label="Season phases" className="grid w-full shrink-0 grid-cols-2 gap-1 rounded-none border-b bg-muted/30 p-2 sm:flex sm:justify-start sm:self-stretch sm:border-r sm:border-b-0 sm:p-3">
        {phases.map(phase => <TabsTrigger
          key={phase.id}
          value={phase.id}
          disabled={busy}
          className="h-auto w-full min-w-0 flex-col items-start gap-0.5 px-2.5 py-2 text-left whitespace-normal after:hidden"
        >
          <span>{seasonPhaseLabels[phase.id]}</span>
          <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">
            <PhaseDates startDate={phase.startDate} endDate={phase.endDate} />
          </span>
        </TabsTrigger>)}
      </TabsList>
      {phases.map(phase => <TabsContent key={phase.id} value={phase.id} className="min-w-0 focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring">
        <fieldset disabled={busy} className="space-y-4 p-5">
          <h3 className="text-base font-semibold">{seasonPhaseLabels[phase.id]}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">Start date</p>
              {phase.id === "test"
                ? <p className="text-sm">{phase.startDate ? formatDate(phase.startDate) : "Date to confirm"} <span className="block text-xs text-muted-foreground">Set by Car Unveiling</span></p>
                : <ProjectDatePicker id={`schedule-${phase.id}-start`} label="Choose start date" value={phase.startDate} showYear disabled={busy} onChange={startDate => change(phase.id, { startDate })} />}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">{endDateLabels[phase.id]}</p>
              <ProjectDatePicker id={`schedule-${phase.id}-end`} label={`Choose ${endDateLabels[phase.id]} date`} value={phase.endDate} showYear disabled={busy} onChange={endDate => change(phase.id, { endDate })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`schedule-${phase.id}-status`}>Status</Label>
            <Select value={phase.status} disabled={busy} onValueChange={status => change(phase.id, { status: status as SeasonPhaseStatus })}>
              <SelectTrigger id={`schedule-${phase.id}-status`} className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{seasonPhaseStatuses.map(status => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`schedule-${phase.id}-note`}>Phase note <span className="font-normal text-muted-foreground">Optional</span></Label>
            <Textarea id={`schedule-${phase.id}-note`} value={phase.note} maxLength={300} rows={3} className="min-h-20" onChange={event => change(phase.id, { note: event.target.value })} />
          </div>
        </fieldset>
      </TabsContent>)}
    </Tabs>
    <DialogFooter className="border-t px-5 py-3">
      <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>Cancel</Button></DialogClose>
      <Button type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save schedule"}</Button>
    </DialogFooter>
  </form>;
}
