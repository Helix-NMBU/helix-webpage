import { useId } from "react";
import { IconFilter2 } from "@tabler/icons-react";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import { Label } from "@libs/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { confidenceLabels, dealConfidences } from "./confidence";
import { sponsorLevelLabels, sponsorLevels, type OpportunityKind } from "./types";
import { activePipelineFilterCount, defaultPipelineFilters, type PipelineFilterState } from "./pipeline-filters";

export function PipelineFilters({kind,filters,onChange,canFilterMine}: {
  kind: OpportunityKind;
  filters: PipelineFilterState;
  onChange: (filters: PipelineFilterState) => void;
  canFilterMine: boolean;
}) {
  const id = useId();
  const count = activePipelineFilterCount(filters,kind);
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="outline" size="icon-sm" aria-label="Pipeline filters" className="relative shrink-0"><IconFilter2 aria-hidden="true" className="size-4"/>{count > 0 && <Badge variant="secondary" className="pointer-events-none absolute -right-1.5 -top-1.5 size-4 justify-center p-0 text-[10px]" aria-label={`${count} active filters`}>{count}</Badge>}</Button></PopoverTrigger>
    <PopoverContent align="end" className="max-h-[min(80svh,var(--radix-popover-content-available-height))] w-72 overflow-y-auto overscroll-contain">
      <h2 className="font-medium">Filter pipeline</h2>
      <div className="space-y-2"><Label htmlFor={`${id}-confidence`}>Confidence</Label>
        <Select value={filters.confidence} onValueChange={value=>onChange({...filters,confidence:value as PipelineFilterState["confidence"]})}>
          <SelectTrigger id={`${id}-confidence`} aria-label="Filter by confidence" className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="all">All confidence levels</SelectItem>{dealConfidences.map(value=><SelectItem key={value} value={value}>{confidenceLabels[value]}</SelectItem>)}<SelectItem value="unset">Not set</SelectItem></SelectContent>
        </Select>
      </div>
      {kind === "deal" && <div className="space-y-2"><Label htmlFor={`${id}-sponsor`}>Sponsor level</Label>
        <Select value={filters.sponsorLevel} onValueChange={value=>onChange({...filters,sponsorLevel:value})}>
          <SelectTrigger id={`${id}-sponsor`} aria-label="Filter by sponsor level" className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="all">All sponsor levels</SelectItem>{sponsorLevels.map(value=><SelectItem key={value} value={value}>{sponsorLevelLabels[value]}</SelectItem>)}<SelectItem value="unset">Not set</SelectItem></SelectContent>
        </Select>
      </div>}
      <div className="space-y-2"><Label htmlFor={`${id}-assignment`}>Assignment</Label>
        <Select value={filters.assignment} onValueChange={value=>onChange({...filters,assignment:value as PipelineFilterState["assignment"]})}>
          <SelectTrigger id={`${id}-assignment`} aria-label="Filter by assignment" className="w-full"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="all">All assignments</SelectItem><SelectItem value="mine" disabled={!canFilterMine}>Assigned to me</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem></SelectContent>
        </Select>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={!count} onClick={()=>onChange({...defaultPipelineFilters})}>Clear filters</Button>
    </PopoverContent>
  </Popover>;
}
