import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  createFundingApplicationRepository,
  type FundingApplicationRepository,
} from "./funding-application-repository";
import type {
  FundingBudgetProposal,
  ProjectFundingProposals,
} from "./funding-application-types";
import type { ProjectBudgetDetail } from "./project-budget-types";
import { useFundingApplicationWrite } from "./useFundingApplicationWrite";
import { projectBudgetMoney } from "./project-budget-diff";
const labels = {
  needs_project_lead: "Needs project lead",
  awaiting_budget_approval: "Awaiting both budget approvals",
  approved: "Budget approved",
};
export function FundingBudgetProposals({
  budget,
  onChanged,
  onDirtyChange,
  repository: provided,
}: {
  budget: ProjectBudgetDetail;
  onChanged: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  repository?: FundingApplicationRepository;
}) {
  const repository = useMemo(
    () => provided ?? createFundingApplicationRepository(),
    [provided],
  );
  const [data, setData] = useState<ProjectFundingProposals | null>(null),
    [selected, setSelected] = useState<FundingBudgetProposal | null>(null);
  const active = useRef(false),
    generation = useRef(0),
    opener = useRef<HTMLButtonElement | null>(null),
    dirty = useRef(false);
  dirty.current = !!selected;
  const notify = useNotify();
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const clear = useCallback(() => {
    generation.current++;
    setData(null);
    setSelected(null);
  }, []);
  const load = useCallback(
    async (force = false) => {
      if (!active.current || (dirty.current && !force)) return;
      const request = ++generation.current;
      try {
        const next = await repository.proposals(budget.id);
        if (active.current && request === generation.current) setData(next);
      } catch (error) {
        if (!active.current || request !== generation.current) return;
        const code =
          error && typeof error === "object" && "status" in error
            ? Number(error.status)
            : 0;
        if (code === 401 || code === 403) clear();
        notify(
          "Could not load funding proposals",
          error instanceof Error ? error.message : "Please try again.",
          { variant: "error", href: null },
        );
      }
    },
    [repository, budget.id, notify, clear],
  );
  const loadRef = useRef(load);
  loadRef.current = load;
  const { busy, save } = useFundingApplicationWrite(
    repository,
    async () => {
      await loadRef.current(true);
      await changed.current();
    },
    clear,
  );
  useEffect(() => {
    active.current = true;
    setData(null);
    setSelected(null);
    void loadRef.current();
    const refresh = () => void loadRef.current();
    window.addEventListener("focus", refresh);
    return () => {
      active.current = false;
      generation.current++;
      window.removeEventListener("focus", refresh);
    };
  }, [repository, budget.id]);
  useEffect(() => {
    void loadRef.current();
  }, [budget.revision]);
  useEffect(() => {
    onDirtyChange?.(!!selected);
    return () => onDirtyChange?.(false);
  }, [selected, onDirtyChange]);
  if (
    !data ||
    data.projectBudgetId !== budget.id ||
    !Array.isArray(data.proposals) ||
    data.proposals.length === 0
  )
    return budget.capabilities.canRecordAward ? (
      <Button asChild variant="outline">
        <a href="/finance/funding-applications">Funding applications</a>
      </Button>
    ) : null;
  const canAdopt =
    budget.capabilities.canDraft &&
    (!budget.pendingVersion || budget.pendingVersion.status === "draft");
  return (
    <section
      aria-label="Funding budget proposals"
      className="space-y-3 border-t pt-4"
    >
      <h4 className="font-medium">Funding budget proposals</h4>
      <p className="text-sm text-muted-foreground">
        Adopting a proposal updates the Draft budget. Approved spending changes
        only after both budget reviews.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Application and entry</TableHead>
            <TableHead>Proposed plan</TableHead>
            <TableHead>Review</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.proposals.map((proposal) => (
            <TableRow key={proposal.id}>
              <TableCell className="whitespace-normal">
                {proposal.applicationTitle}
                <span className="block text-sm text-muted-foreground">
                  {proposal.desiredEntry.description}
                </span>
              </TableCell>
              <TableCell>
                {projectBudgetMoney(proposal.desiredEntry.plannedNok)}
              </TableCell>
              <TableCell>
                {labels[proposal.approvalStatus]}
                {proposal.mandatory && " · Awarded obligation"}
              </TableCell>
              <TableCell>
                {proposal.approvalStatus !== "approved" &&
                  budget.capabilities.canDraft && (
                    <Button
                      variant="outline"
                      disabled={busy || !canAdopt}
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setSelected(proposal);
                      }}
                    >
                      Review {proposal.desiredEntry.description}
                    </Button>
                  )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!canAdopt && budget.capabilities.canDraft && (
        <p className="text-sm text-muted-foreground">
          Return or withdraw the proposed budget to Draft before adopting
          funding proposals.
        </p>
      )}
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setSelected(null);
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Adopt funding proposal</DialogTitle>
              <DialogDescription>
                This adds or updates the entry in the project's Draft budget. It
                does not approve the proposed amount.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p>{selected.applicationTitle}</p>
              <p className="font-medium">
                {selected.desiredEntry.description} ·{" "}
                {projectBudgetMoney(selected.desiredEntry.plannedNok)}
              </p>
              <p className="whitespace-pre-wrap text-sm">{selected.note}</p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void save({
                    action: "adoptFundingProposal",
                    requestId: crypto.randomUUID(),
                    applicationId: selected.applicationId,
                    expectedRevision:
                      data.proposals.find((item) => item.id === selected.id)
                        ?.applicationRevision ?? selected.applicationRevision,
                    proposalId: selected.id,
                    projectBudgetId: budget.id,
                    expectedBudgetRevision: budget.revision,
                  }).then(async (result) => {
                    if (result) {
                      setSelected(null);
                      dirty.current = false;
                      await load(true);
                      await onChanged();
                    }
                  })
                }
              >
                Adopt into Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
