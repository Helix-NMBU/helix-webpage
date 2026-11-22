import { Badge } from "@libs/components/ui/badge";
import {
  Table,
  TableBody,
  TableFooter,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import type { DepartmentBudgetPlanVersion } from "./department-budget-types";
import { InvoiceLinks } from "./InvoiceEvidence";
import { formatOre } from "./money";
import {
  canonicalNokOre,
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
  const rows = comparison.entries.map(change => {
    const previousAmount = change.before && change.before.status !== "cancelled" ? canonicalNokOre(change.before.plannedNok) : 0n;
    const nextAmount = change.after && change.after.status !== "cancelled" ? canonicalNokOre(change.after.plannedNok) : 0n;
    return { ...change, previousAmount, amountChange: nextAmount - previousAmount };
  }).sort((a, b) => Number(a.kind === "unchanged") - Number(b.kind === "unchanged"));
  const totalAmountChange = rows.reduce((sum, row) => sum + row.amountChange, 0n);
  const signedMoney = (amount: bigint) => `${amount > 0n ? "+ " : amount < 0n ? "− " : ""}${projectBudgetMoney(formatOre(amount < 0n ? -amount : amount))}`;
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
    if (text === null || text === "") return "—";
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
              <TableHead>Current priority</TableHead>
              <TableHead className="text-right">Previous amount</TableHead>
              <TableHead className="text-right">Amount change</TableHead>
              <TableHead className="text-right">Current actual</TableHead>
              <TableHead>Fulfillment</TableHead>
              <TableHead>Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((change) => {
              const entry = change.after ?? change.before!,
                actual = live.get(change.entryId);
              const { previousAmount, amountChange } = change;
              const detailChanges = change.kind === "changed" ? change.changes.filter(field => field.field !== "plannedNok") : [];
              const fields = detailChanges.length ? (
                <dl className="mt-2 space-y-2 text-xs">
                  {detailChanges.map((field) => (
                    <div key={field.field}>
                      <dt className="font-medium">{PROJECT_BUDGET_FIELD_LABELS[field.field]}</dt>
                      <dd className="mt-1 break-words"><span className="text-muted-foreground">{value(field.field, field.before)}</span>{" → "}{value(field.field, field.after)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null;
              return (
                <TableRow key={change.entryId} data-change={change.kind} className={change.kind !== "unchanged" ? "bg-[var(--warning)]/10" : undefined}>
                  <TableCell className="min-w-56 max-w-sm whitespace-normal">
                    <span className="font-medium">{entry.description}</span>
                    {(change.kind === "added" || change.kind === "removed") && entry.note ? <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p> : null}
                  </TableCell>
                  <TableCell className="min-w-28 max-w-xs whitespace-normal">
                    <Badge variant="outline" className={change.kind === "changed" ? "border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]" : change.kind === "added" ? "border-transparent bg-[var(--success)] text-[var(--success-foreground)]" : change.kind === "removed" ? "border-destructive/30 bg-destructive/10 text-destructive" : undefined}>{label[change.kind]}</Badge>
                    {fields}
                  </TableCell>

                  <TableCell>
                    {actual?.priority ?? entry.priority}
                    {actual && actual.priority !== entry.priority ? (
                      <span className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">
                        Submitted priority {entry.priority}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {change.before ? projectBudgetMoney(formatOre(previousAmount)) : "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">
                    {amountChange === 0n ? <span className="text-muted-foreground">—</span> : signedMoney(amountChange)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {actual
                      ? projectBudgetMoney(actual.actualNok)
                      : "Unavailable"}
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">
                    {actual ? actual.completion === "complete" ? "Complete" : actual.completion === "partial" ? "Partially purchased" : "Not purchased" : "No purchase facts available"}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {actual?.invoices?.length ? <InvoiceLinks invoices={actual.invoices} onChanged={onEvidenceChanged} onAccessEnded={onAccessEnded} /> : actual && (actual.completion !== "not_purchased" || canonicalNokOre(actual.actualNok) > 0n) ? <span className="text-xs text-muted-foreground">Invoice not found</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="border-t-2 border-foreground/30 [&_td]:pt-3 [&_th]:pt-3">
            <TableRow>
              <TableHead scope="row" colSpan={4}>Total amount change</TableHead>
              <TableCell className="text-right whitespace-nowrap font-semibold tabular-nums">{signedMoney(totalAmountChange)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}
