import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@libs/components/ui/collapsible";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import type { DepartmentBudgetPlanVersion } from "./department-budget-types";
import { InvoiceEvidence } from "./InvoiceEvidence";
import {
  PROJECT_BUDGET_FIELD_LABELS,
  projectBudgetDiff,
  projectBudgetMoney,
  type ProjectBudgetDiffField,
} from "./project-budget-diff";
import type {
  ProjectBudgetEntry,
  ProjectBudgetSystemChoice,
} from "./project-budget-types";

/** Plan versions are pinned package facts. Fulfillment and evidence are a separate, refreshable projection. */
export function DepartmentProjectBudgetReview({
  approved,
  proposed,
  systems,
  evidence,
  onEvidenceChanged,
  onAccessEnded,
}: {
  approved: DepartmentBudgetPlanVersion | null;
  proposed: DepartmentBudgetPlanVersion | null;
  systems: ProjectBudgetSystemChoice[];
  evidence: ProjectBudgetEntry[];
  onEvidenceChanged?: () => Promise<void>;
  onAccessEnded?: () => void;
}) {
  const comparison = projectBudgetDiff(approved, proposed),
    live = new Map(evidence.map((entry) => [entry.entryId, entry]));
  const planSystems = new Map(
    [...(approved?.entries ?? []), ...(proposed?.entries ?? [])].map(
      (entry) => [entry.systemId, entry.systemName ?? entry.systemId],
    ),
  );
  const label = {
    added: "New",
    changed: "Changed",
    removed: "Removed",
    unchanged: "Unchanged",
  };
  const value = (field: ProjectBudgetDiffField, text: string | null) => {
    if (text === null || text === "") return "None";
    if (field === "systemId")
      return (
        systems.find((system) => system.id === text)?.name ??
        planSystems.get(text) ??
        text
      );
    return field === "plannedNok"
      ? projectBudgetMoney(text)
      : text.replace(/_/g, " ");
  };
  return (
    <div className="min-w-0 space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Last approved</dt>
          <dd>
            {approved
              ? projectBudgetMoney(comparison.approvedTotalNok)
              : "No approved budget"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Package allocation</dt>
          <dd>{projectBudgetMoney(comparison.proposedTotalNok)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Net change</dt>
          <dd>{projectBudgetMoney(comparison.netTotalNok)}</dd>
        </div>
      </dl>
      {comparison.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approved or included entries.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>System</TableHead>
              <TableHead>Current priority</TableHead>
              <TableHead className="text-right">Package plan</TableHead>
              <TableHead className="text-right">Current actual</TableHead>
              <TableHead>Fulfillment and invoices</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.entries.map((change) => {
              const entry = change.after ?? change.before!,
                actual = live.get(change.entryId);
              const fields =
                change.changes.length > 0 ? (
                  <dl className="mt-3 space-y-2 text-xs">
                    {change.changes.map((field) => (
                      <div key={field.field}>
                        <dt className="font-medium">
                          {PROJECT_BUDGET_FIELD_LABELS[field.field]}
                        </dt>
                        <dd className="mt-1 break-words">
                          <span className="text-muted-foreground">
                            Previous:
                          </span>{" "}
                          {value(field.field, field.before)}
                          <br />
                          <span className="text-muted-foreground">
                            Package:
                          </span>{" "}
                          {value(field.field, field.after)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null;
              return (
                <TableRow key={change.entryId}>
                  <TableCell className="max-w-sm whitespace-normal">
                    <span className="font-medium">{entry.description}</span>
                    {fields &&
                    (change.kind === "added" || change.kind === "removed") ? (
                      <Collapsible className="mt-2">
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto whitespace-normal px-0 text-xs"
                            aria-label={`View ${change.kind === "added" ? "new" : "removed"} entry details for ${entry.description}`}
                          >
                            View {change.kind === "added" ? "new" : "removed"}{" "}
                            entry details
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>{fields}</CollapsibleContent>
                      </Collapsible>
                    ) : (
                      fields
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{label[change.kind]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {systems.find((system) => system.id === entry.systemId)
                      ?.name ??
                      entry.systemName ??
                      entry.systemId}
                  </TableCell>
                  <TableCell>
                    {actual?.priority ?? entry.priority}
                    {actual && actual.priority !== entry.priority ? (
                      <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">
                        Submitted priority {entry.priority}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {change.after ? (
                      change.after.status === "cancelled" ? (
                        <>
                          <span>Cancelled</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Stored {projectBudgetMoney(change.after.plannedNok)}
                          </span>
                        </>
                      ) : (
                        projectBudgetMoney(change.after.plannedNok)
                      )
                    ) : (
                      <>
                        <span>Removed</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Previous{" "}
                          {projectBudgetMoney(change.before!.plannedNok)}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {actual
                      ? projectBudgetMoney(actual.actualNok)
                      : "Unavailable"}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {actual ? (
                      <>
                        <span>
                          {actual.completion === "complete"
                            ? "Complete"
                            : actual.completion === "partial"
                              ? "Partially purchased"
                              : "Not purchased"}
                        </span>
                        {actual.invoices?.length ? (
                          <ul className="mt-2 space-y-2">
                            {actual.invoices.map((invoice) => (
                              <li key={invoice.documentId}>
                                <InvoiceEvidence
                                  invoice={invoice}
                                  onChanged={onEvidenceChanged}
                                  onAccessEnded={onAccessEnded}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      "No purchase facts available"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
