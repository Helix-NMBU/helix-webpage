import { InvoiceEvidence } from "./InvoiceEvidence";
import { budgetPlanLabel } from "./budget-plan-label";
import { useState } from "react";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Label } from "@libs/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { CommitmentUse } from "./budget-summary";
import type { PublicSystemBudget } from "./types";
const moneyText = (value: string) =>
  value.startsWith("-") ? `${value} Over plan` : value;
export function BudgetsBoard() {
  const session = useFinanceAccess();
  const {budgets}=session;
  const [evidenceDenied,setEvidenceDenied]=useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  if (!budgets || evidenceDenied) return null;
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {budgets.seasonCode
          ? `Season ${budgets.seasonCode}`
          : "No current season"}
        {` · ${budgetPlanLabel(budgets)}`}
      </p>
      <p className="text-sm text-muted-foreground">
        Season budget history is read-only. Make plan changes in the project's
        budget and submit them for both approvals.
      </p>
      {budgets.budgetStatus === "absent" ? (
        <p className="text-sm text-muted-foreground">
          No season budget exists yet.
        </p>
      ) : null}
      {budgets.departments.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            Totals include spending on cancelled items and leave cancelled plan
            amounts out.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-cancelled"
              checked={showCancelled}
              onCheckedChange={(value) => setShowCancelled(value === true)}
            />
            <Label htmlFor="show-cancelled">Show cancelled</Label>
          </div>
          {budgets.departments.map((department) => (
            <section
              key={department.departmentKey}
              className="space-y-4"
              aria-labelledby={`department-${department.departmentKey}`}
            >
              <div className="space-y-1">
                <h2
                  id={`department-${department.departmentKey}`}
                  className="text-xl font-medium"
                >
                  {department.name}
                </h2>
                <AmountLine
                  planned={department.plannedNok}
                  actual={department.actualNok}
                  difference={department.differenceNok}
                  unbudgeted={department.unbudgetedNok}
                />
                <CommitmentUse
                  commitmentNok={department.commitmentNok}
                  usedFraction={department.usedFraction}
                />
              </div>
              {department.systems.map((system) => (
                <SystemBudget
                  key={system.id}
                  system={system}
                  showCancelled={showCancelled}
                  onEvidenceChanged={()=>session.loadPage("budgets")}
                  onAccessEnded={()=>{setEvidenceDenied(true);session.retry();}}
                />
              ))}
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}
function AmountLine({
  planned,
  actual,
  difference,
  unbudgeted,
}: {
  planned: string;
  actual: string;
  difference: string;
  unbudgeted: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      Planned {planned} · Actual {actual} · Difference {moneyText(difference)}
      {unbudgeted !== "0.00" ? ` · Unbudgeted ${unbudgeted}` : ""}
    </p>
  );
}

function SystemBudget({
  system,
  showCancelled,
  onEvidenceChanged,
  onAccessEnded,
}: {
  system: PublicSystemBudget;
  showCancelled: boolean;
  onEvidenceChanged:()=>Promise<void>;
  onAccessEnded:()=>void;
}) {
  const items = system.items.filter(
    (item) => showCancelled || item.status !== "cancelled",
  );
  return (
    <section className="space-y-3" aria-labelledby={`system-${system.id}`}>
      <div className="space-y-1">
        <h3 id={`system-${system.id}`} className="text-base font-medium">
          {system.name}
        </h3>
        <AmountLine
          planned={system.plannedNok}
          actual={system.actualNok}
          difference={system.differenceNok}
          unbudgeted={system.unbudgetedNok}
        />
        <CommitmentUse
          commitmentNok={system.commitmentNok}
          usedFraction={system.usedFraction}
        />
        <p className="text-sm text-muted-foreground">
          Unbudgeted spending {system.unbudgetedNok}
          {system.unbudgetedPublicRef ? ` · ${system.unbudgetedPublicRef}` : ""}
        </p>
        {system.unallocated?.note ? (
          <p className="text-sm text-muted-foreground">
            {system.unallocated.note}
          </p>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Planned</TableHead>
            <TableHead>Effective plan</TableHead>
            <TableHead>Actual</TableHead>
            <TableHead>Difference</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fulfillment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="block font-medium">{item.description}</span>
                <span className="text-muted-foreground">
                  {item.publicRef} · {item.priority}
                  {item.earmarkPurpose ? ` · ${item.earmarkPurpose}` : ""}
                  {item.earmarkAmountNok ? ` · ${item.earmarkAmountNok}` : ""}
                </span>
                {item.projectName ? <span className="block text-muted-foreground">{item.projectName} · {item.approvedVersionId ? "Approved project plan" : "Legacy plan awaiting project approval"}</span> : item.source==="legacy" ? <span className="block text-muted-foreground">Unmapped legacy plan</span> : null}
                {item.invoices?.length ? <ul className="mt-2 space-y-2">{item.invoices.map(invoice=><li key={invoice.documentId}><InvoiceEvidence invoice={invoice} onChanged={onEvidenceChanged} onAccessEnded={onAccessEnded}/></li>)}</ul> : null}
                {item.status === "cancelled" ? (
                  <span className="block">
                    Stored plan {item.plannedNok}. Effective plan{" "}
                    {item.effectivePlanNok}.
                  </span>
                ) : null}
                {item.note ? <span className="block">{item.note}</span> : null}
              </TableCell>
              <TableCell>{item.plannedNok}</TableCell>
              <TableCell>{item.effectivePlanNok}</TableCell>
              <TableCell>{item.actualNok}</TableCell>
              <TableCell>{moneyText(item.differenceNok)}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell>{item.completion==="complete"?"Complete":item.completion==="partial"?"Partially purchased":item.completion==="not_purchased"?"Not purchased":"Fulfillment not recorded"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
