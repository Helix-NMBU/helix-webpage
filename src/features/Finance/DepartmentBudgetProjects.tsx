import { IconChevronDown } from "@tabler/icons-react";
import { Badge } from "@libs/components/ui/badge";
import { Button } from "@libs/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@libs/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import type { WorkspaceProject } from "../Workspace/types";
import { DepartmentBudgetDecision } from "./DepartmentBudgetDecision";
import { DepartmentProjectBudgetReview } from "./DepartmentProjectBudgetReview";
import { InvoiceLinks } from "./InvoiceEvidence";
import { canonicalNokOre, projectBudgetDiff, projectBudgetMoney } from "./project-budget-diff";
import { formatOre } from "./money";
import type { DepartmentBudgetPackage, DepartmentBudgetPlanEntry, DepartmentBudgetProject } from "./department-budget-types";
import type { ProjectBudgetDetail, ProjectBudgetEntry, ProjectBudgetSummary, ProjectBudgetSystemChoice } from "./project-budget-types";
import type { PublicBudgetItem } from "./types";

type ProjectGroup = { id: string; name: string; entries: PublicBudgetItem[]; packet?: DepartmentBudgetProject; summary?: ProjectBudgetSummary; detail?: ProjectBudgetDetail };
const total = (entries: PublicBudgetItem[]) => formatOre(entries.reduce((sum, entry) => sum + canonicalNokOre(entry.effectivePlanNok), 0n));
const awaitingApproval = (group: ProjectGroup) => group.packet?.included === true || group.summary?.pendingStage === "department_pending" || group.summary?.pendingStage === "finance_pending";

function ApprovedEntries({ entries, onChanged, onAccessEnded }: { entries: PublicBudgetItem[]; onChanged: () => Promise<void>; onAccessEnded: () => void }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">No approved allocation in this department yet.</p>;
  return <Table><TableHeader><TableRow><TableHead>Entry</TableHead><TableHead>Priority</TableHead><TableHead className="text-right">Approved</TableHead><TableHead className="text-right">Spent</TableHead><TableHead>Fulfillment</TableHead><TableHead>Invoice</TableHead></TableRow></TableHeader><TableBody>{entries.map(entry => <TableRow key={entry.id}>
    <TableCell className="whitespace-normal font-medium">{entry.description}</TableCell>
    <TableCell>{entry.priority}</TableCell><TableCell className="text-right tabular-nums">{projectBudgetMoney(entry.effectivePlanNok)}</TableCell><TableCell className="text-right tabular-nums">{projectBudgetMoney(entry.actualNok)}</TableCell>
    <TableCell className="whitespace-normal text-xs text-muted-foreground">{entry.status === "cancelled" ? "Removed" : entry.completion === "complete" ? "Purchased" : entry.completion === "partial" ? "Partially purchased" : "Not purchased"}</TableCell>
    <TableCell>{entry.invoices?.length ? <InvoiceLinks invoices={entry.invoices} onChanged={onChanged} onAccessEnded={onAccessEnded} /> : (entry.completion && entry.completion !== "not_purchased") || canonicalNokOre(entry.actualNok) > 0n ? <span className="text-xs text-muted-foreground">Invoice not found</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
  </TableRow>)}</TableBody></Table>;
}

/** Package plans stay pinned; current public entries supply purchase facts independently. */
export function DepartmentBudgetProjects({ departmentId, departmentName, seasonCode, projects, entries, systems, summaries = [], details = [], pendingPackage, loadingChanges = false, canReviewDecision = false, onChanged, onAccessEnded }: {
  departmentId?: string;
  departmentName: string;
  seasonCode: string;
  projects: WorkspaceProject[];
  entries: PublicBudgetItem[];
  systems: ProjectBudgetSystemChoice[];
  summaries?: ProjectBudgetSummary[];
  details?: ProjectBudgetDetail[];
  pendingPackage?: DepartmentBudgetPackage;
  loadingChanges?: boolean;
  canReviewDecision?: boolean;
  onChanged: () => Promise<void>;
  onAccessEnded: () => void;
}) {
  const groups = new Map<string, ProjectGroup>();
  const ensure = (id: string, name: string) => {
    if (!groups.has(id)) groups.set(id, { id, name, entries: [] });
    return groups.get(id)!;
  };
  for (const project of projects) if (project.season === seasonCode && project.departments.includes(departmentName)) ensure(project.id, project.name);
  for (const entry of entries) ensure(entry.projectId ?? `system:${entry.systemId}`, entry.projectName ?? systems.find(system => system.id === entry.systemId)?.name ?? "Department entries").entries.push(entry);
  for (const summary of summaries) if (summary.responsibleDepartmentId === departmentId && summary.seasonCode === seasonCode) ensure(summary.projectId, summary.projectName).summary = summary;
  for (const detail of details) if (detail.responsibleDepartmentId === departmentId && detail.seasonCode === seasonCode) ensure(detail.projectId, detail.projectName).detail = detail;
  if (pendingPackage?.status === "finance_pending" && pendingPackage.snapshot.departmentId === departmentId && pendingPackage.snapshot.seasonCode === seasonCode) {
    for (const project of pendingPackage.snapshot.projects) ensure(project.projectId, project.projectName).packet = project;
  }
  const ordered = [...groups.values()].sort((a, b) => Number(awaitingApproval(b)) - Number(awaitingApproval(a)) || a.name.localeCompare(b.name));
  return <section aria-labelledby="department-project-budgets-title" className="space-y-4">
    <div><h2 id="department-project-budgets-title" className="text-xl font-medium">Project budgets</h2><p className="mt-1 text-sm text-muted-foreground">Expand a project to see its entries. Pending changes are highlighted and stay separate from approved allocations.</p></div>
    {loadingChanges ? <p className="text-sm text-muted-foreground">Loading budget changes…</p> : null}
    {ordered.map(group => {
      const requested = awaitingApproval(group);
      // A submitted department package takes precedence over a live project candidate.
      const approved = group.packet?.included ? group.packet.approvedVersion : group.detail?.approvedVersion ?? null;
      const proposed = group.packet?.included ? group.packet.proposedVersion : group.detail?.pendingVersion ?? null;
      const comparison = proposed ? projectBudgetDiff<DepartmentBudgetPlanEntry>(approved, proposed) : null;
      const netOre = comparison ? canonicalNokOre(comparison.netTotalNok) : null;
      const netLabel = netOre === null ? null : `${netOre > 0n ? "+ " : netOre < 0n ? "− " : ""}${projectBudgetMoney(formatOre(netOre < 0n ? -netOre : netOre))}`;
      const approvedNok = group.packet?.included ? group.packet.approvedTotalNok : total(group.entries);
      const amounts = comparison?.counts;
      const changes = amounts ? ([['added', 'new'], ['changed', 'changed'], ['removed', 'removed']] as const).filter(([kind]) => amounts[kind] > 0).map(([kind, label]) => `${amounts[kind]} ${label}`).join(" · ") : "";
      const sources = [...(approved?.entries ?? []), ...(proposed?.entries ?? [])];
      const publicById = new Map(group.entries.map(entry => [entry.id, entry]));
      const liveById = new Map([...(group.detail?.approvedVersion?.entries ?? []), ...(group.detail?.pendingVersion?.entries ?? [])].map(entry => [entry.entryId, entry]));
      const evidence = sources.flatMap(plan => {
        const current = publicById.get(plan.budgetItemId ?? plan.entryId) ?? publicById.get(plan.entryId);
        const live = liveById.get(plan.entryId);
        return current ? [{ ...plan, priority: current.priority, actualNok: current.actualNok, completion: current.completion ?? "not_purchased", invoices: current.invoices } satisfies ProjectBudgetEntry] : live ? [live] : [];
      });
      return <Collapsible key={group.id} className="group/project overflow-hidden rounded-xl border">
        <h3><CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between gap-4 rounded-none p-5 text-left whitespace-normal [&[data-state=open]>svg]:rotate-180">
          <span className="min-w-0 space-y-2"><span className="flex flex-wrap items-center gap-3"><span className="text-base font-medium">{group.name}</span>{!requested && group.summary?.pendingStage === "draft" ? <Badge variant="secondary">Draft</Badge> : !requested && !group.entries.length ? <Badge variant="secondary">No approved allocation</Badge> : null}</span><span className="block text-xs font-normal text-muted-foreground">{changes || `${group.entries.length} approved ${group.entries.length === 1 ? "entry" : "entries"}`}</span></span>
          <span className="ml-auto shrink-0 text-right"><span className="block text-xs font-normal text-muted-foreground">Approved</span><span className="block font-medium tabular-nums">{projectBudgetMoney(approvedNok)}</span>{!requested && proposed ? <span className="mt-1 block text-xs font-normal tabular-nums">Draft {projectBudgetMoney(proposed.totalNok)}</span> : null}</span>{requested ? <Badge className="h-auto gap-2 bg-[var(--warning)] px-3 py-1.5 text-sm text-[var(--warning-foreground)]"><span>Requested change</span>{netLabel !== null ? <span className="font-semibold tabular-nums">{netLabel}</span> : null}</Badge> : netLabel !== null ? <span className="shrink-0 border-l pl-5 text-right"><span className="block text-xs font-normal text-muted-foreground">Net change</span><span className="mt-1 block text-lg font-semibold tabular-nums">{netLabel}</span></span> : null}<IconChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform" />
        </Button></CollapsibleTrigger></h3>
        <CollapsibleContent><div className="space-y-4 border-t p-5">
          {proposed ? <DepartmentProjectBudgetReview approved={approved} proposed={proposed} systems={systems} evidence={evidence} onEvidenceChanged={onChanged} onAccessEnded={onAccessEnded} /> : <ApprovedEntries entries={group.entries} onChanged={onChanged} onAccessEnded={onAccessEnded} />}
          {canReviewDecision && group.packet?.included && pendingPackage && departmentId ? <div className="flex justify-end"><DepartmentBudgetDecision packageId={pendingPackage.id} departmentId={departmentId} departmentName={departmentName} systems={systems} onChanged={onChanged} /></div> : null}
          {group.packet?.readiness === "other_department" ? <p className="text-sm text-muted-foreground">The full project budget belongs to {group.packet.responsibleDepartmentName}.</p> : null}
        </div></CollapsibleContent>
      </Collapsible>;
    })}
    {!ordered.length ? <p className="text-sm text-muted-foreground">No projects or budget entries in this department yet.</p> : null}
  </section>;
}
