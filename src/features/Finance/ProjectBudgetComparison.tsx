import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import type {
  ProjectBudgetSystemChoice,
  ProjectBudgetVersion,
} from "./project-budget-types";
import {
  PROJECT_BUDGET_FIELD_LABELS,
  projectBudgetDiff,
  projectBudgetMoney,
  type ProjectBudgetDiffField,
} from "./project-budget-diff";
export function ProjectBudgetComparison({
  approved,
  proposed,
  systems,
}: {
  approved: ProjectBudgetVersion;
  proposed: ProjectBudgetVersion;
  systems: ProjectBudgetSystemChoice[];
}) {
  const diff = projectBudgetDiff(approved, proposed);
  function value(field: ProjectBudgetDiffField, text: string | null) {
    if (text === null || text === "") return "None";
    if (field === "systemId")
      return systems.find((system) => system.id === text)?.name ?? text;
    if (field === "plannedNok") return projectBudgetMoney(text);
    return text.replace(/_/g, " ");
  }
  return (
    <section
      aria-label="Changes from approved budget"
      className="space-y-4 border-y py-4"
    >
      <div>
        <h4 className="font-medium">
          Changes from approved version {approved.versionNumber}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          The approved version remains available for purchases until this
          proposal completes both approval steps.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Approved total</TableHead>
            <TableHead>Proposed total</TableHead>
            <TableHead>Net change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{projectBudgetMoney(diff.approvedTotalNok)}</TableCell>
            <TableCell>{projectBudgetMoney(diff.proposedTotalNok)}</TableCell>
            <TableCell>{projectBudgetMoney(diff.netTotalNok)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="text-sm">
        Added {diff.counts.added} · Changed {diff.counts.changed} · Removed{" "}
        {diff.counts.removed} · Unchanged {diff.counts.unchanged}
      </p>
      {diff.entries.some((entry) => entry.kind !== "unchanged") ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Proposed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {diff.entries
              .filter((entry) => entry.kind !== "unchanged")
              .flatMap((entry) =>
                entry.changes.map((change, index) => (
                  <TableRow key={`${entry.entryId}-${change.field}`}>
                    <TableCell className="max-w-xs whitespace-normal">
                      {index === 0
                        ? (entry.after?.description ??
                          entry.before?.description)
                        : null}
                    </TableCell>
                    <TableCell>
                      {index === 0
                        ? entry.kind[0].toUpperCase() + entry.kind.slice(1)
                        : null}
                    </TableCell>
                    <TableCell>
                      {PROJECT_BUDGET_FIELD_LABELS[change.field]}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      {value(change.field, change.before)}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      {value(change.field, change.after)}
                    </TableCell>
                  </TableRow>
                )),
              )}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No entry changes yet.</p>
      )}
    </section>
  );
}
