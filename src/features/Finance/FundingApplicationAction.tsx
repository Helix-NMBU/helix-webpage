import { useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { BUDGET_ITEM_CATEGORIES } from "./budget-domain";
import { formatOre, parseIsoDate, parseNokToOre } from "./money";
import type {
  FundingApplicationBudgetContext,
  FundingApplicationDetail,
  FundingApplicationMutation,
} from "./funding-application-types";
import type { ProjectBudgetEntryInput } from "./project-budget-types";
export type FundingAction = "link" | "propose" | "award" | { release: string };
const titles = {
  link: "Link a budget entry",
  propose: "Propose a budget purchase",
  award: "Record funding award",
  release: "Release purchase obligation",
};
export function FundingApplicationAction({
  action,
  application,
  context,
  busy,
  onSave,
  onClose,
  restoreFocus,
}: {
  action: FundingAction;
  application: FundingApplicationDetail;
  context: FundingApplicationBudgetContext;
  busy: boolean;
  onSave: (change: FundingApplicationMutation) => Promise<boolean>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const mode = typeof action === "string" ? action : "release",
    notify = useNotify();
  const [budgetId, setBudgetId] = useState(context.budgets[0]?.id ?? ""),
    [entryId, setEntryId] = useState("new"),
    [entry, setEntry] = useState<ProjectBudgetEntryInput>({
      systemId: context.budgets[0]?.systemIds[0] ?? "",
      description: "",
      plannedNok: "",
      ordinaryPriority: "P1",
      category: "material",
      reuseStatus: "new",
      status: "planned",
    }),
    [note, setNote] = useState(""),
    [date, setDate] = useState(""),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState("");
  const removingPendingLink = mode === "release" && !application.award;
  const budget = context.budgets.find((item) => item.id === budgetId),
    choices = context.entries.filter(
      (item) => item.projectBudgetId === budgetId,
    ),
    systems = context.systems.filter((item) =>
      budget?.systemIds.includes(item.id),
    );
  async function submit() {
    if (busy) return;
    try {
      const base = {
        applicationId: application.id,
        expectedRevision: application.revision,
        requestId: crypto.randomUUID(),
      };
      let change: FundingApplicationMutation;
      if (mode === "award") {
        parseIsoDate(date);
        if (!reference.trim()) throw new Error("Enter an award reference.");
        change = {
          ...base,
          action: "recordFundingAward",
          awardDate: date,
          awardReference: reference.trim(),
        };
      } else if (mode === "release") {
        if (!reason.trim()) throw new Error("Enter a release reason.");
        change = {
          ...base,
          action: "releaseFundingObligation",
          obligationId: typeof action === "object" ? action.release : "",
          reason: reason.trim(),
        };
      } else {
        if (!budget) throw new Error("Choose a project budget.");
        if (mode === "link") {
          const chosen = choices.find((item) => item.entryId === entryId);
          if (!chosen) throw new Error("Choose an existing budget entry.");
          change = {
            ...base,
            action: "linkFundingApplicationEntry",
            entryId: chosen.entryId,
            expectedBudgetRevision: budget.revision,
          };
        } else {
          const amount = parseNokToOre(entry.plannedNok);
          if (
            !entry.description.trim() ||
            !systems.some((system) => system.id === entry.systemId) ||
            amount === null ||
            amount < 0n
          )
            throw new Error(
              "Enter a description, a project system and a valid amount.",
            );
          const existing = choices.find((item) => item.entryId === entryId);
          if (existing && amount <= (parseNokToOre(existing.plannedNok) ?? 0n))
            throw new Error(
              "An increase must exceed the entry's current planned amount.",
            );
          change = {
            ...base,
            action: "proposeFundingBudgetEntry",
            projectBudgetId: budget.id,
            expectedBudgetRevision: budget.revision,
            entry: {
              ...entry,
              description: entry.description.trim(),
              plannedNok: formatOre(amount),
              ...(existing ? { entryId: existing.entryId } : {}),
            },
            note: note.trim(),
          };
        }
      }
      if (await onSave(change)) onClose();
    } catch (error) {
      notify(
        "Check the funding application",
        error instanceof Error
          ? error.message
          : "Check the fields and try again.",
        { variant: "error", href: null },
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {removingPendingLink ? "Remove funding link" : titles[mode]}
          </DialogTitle>
          <DialogDescription>
            {mode === "award"
              ? "Record the award from the funding provider. Linked obligations become mandatory. This does not record cash received or approve budget increases."
              : mode === "release"
                ? removingPendingLink
                  ? "Remove this pending link with a reason. A later award will not make this released link mandatory."
                  : "Release this application's obligation with a reason. Other unreleased awards may still make the entry mandatory."
                : mode === "propose"
                  ? "Project leads must adopt proposed entries or increases into a Draft budget and complete both approval steps before the money becomes approved spend."
                  : "Link a stable budget entry to these purchase conditions. It becomes mandatory when funding is awarded."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {(mode === "link" || mode === "propose") && (
            <>
              <div className="space-y-2">
                <Label htmlFor="funding-project-budget">Project budget</Label>
                <Select
                  value={budgetId}
                  disabled={busy}
                  onValueChange={(value) => {
                    setBudgetId(value);
                    setEntryId("new");
                    setEntry({
                      systemId:
                        context.budgets.find((item) => item.id === value)
                          ?.systemIds[0] ?? "",
                      description: "",
                      plannedNok: "",
                      ordinaryPriority: "P1",
                      category: "material",
                      reuseStatus: "new",
                      status: "planned",
                    });
                  }}
                >
                  <SelectTrigger id="funding-project-budget">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {context.budgets.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.projectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-existing-entry">Budget entry</Label>
                <Select
                  value={entryId}
                  disabled={busy}
                  onValueChange={(value) => {
                    setEntryId(value);
                    const selected = choices.find(
                      (item) => item.entryId === value,
                    );
                    setEntry(
                      selected
                        ? { ...selected.entry, entryId: selected.entryId }
                        : {
                            systemId: systems[0]?.id ?? "",
                            description: "",
                            plannedNok: "",
                            ordinaryPriority: "P1",
                            category: "material",
                            reuseStatus: "new",
                            status: "planned",
                          },
                    );
                  }}
                >
                  <SelectTrigger id="funding-existing-entry">
                    <SelectValue placeholder="Choose an entry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">
                      {mode === "propose"
                        ? "New budget entry"
                        : "Choose an existing entry"}
                    </SelectItem>
                    {choices
                      .filter(
                        (item) =>
                          mode === "propose" ||
                          !application.links.some(
                            (link) =>
                              link.entryId === item.entryId && !link.release,
                          ),
                      )
                      .map((item) => (
                        <SelectItem key={item.entryId} value={item.entryId}>
                          {item.description}
                          {item.approved ? "" : " · Pending budget approval"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {mode === "propose" && (
            <>
              {entryId === "new" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="funding-description">Description</Label>
                    <Input
                      id="funding-description"
                      autoFocus
                      value={entry.description}
                      maxLength={300}
                      disabled={busy}
                      onChange={(event) =>
                        setEntry((previous) => ({
                          ...previous,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="funding-system">System</Label>
                    <Select
                      value={entry.systemId}
                      disabled={busy}
                      onValueChange={(value) =>
                        setEntry((previous) => ({
                          ...previous,
                          systemId: value,
                        }))
                      }
                    >
                      <SelectTrigger id="funding-system">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {systems.map((system) => (
                          <SelectItem key={system.id} value={system.id}>
                            {system.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="funding-priority">
                        Ordinary priority
                      </Label>
                      <Select
                        value={entry.ordinaryPriority}
                        disabled={busy}
                        onValueChange={(value) =>
                          setEntry((previous) => ({
                            ...previous,
                            ordinaryPriority:
                              value as ProjectBudgetEntryInput["ordinaryPriority"],
                          }))
                        }
                      >
                        <SelectTrigger id="funding-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["P1", "P2", "P3", "P4"].map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="funding-category">Category</Label>
                      <Select
                        value={entry.category}
                        disabled={busy}
                        onValueChange={(value) =>
                          setEntry((previous) => ({
                            ...previous,
                            category: value,
                          }))
                        }
                      >
                        <SelectTrigger id="funding-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUDGET_ITEM_CATEGORIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="funding-proposed-amount">
                  {entryId === "new"
                    ? "Proposed amount (NOK)"
                    : "New total planned amount (NOK)"}
                </Label>
                <Input
                  id="funding-proposed-amount"
                  inputMode="decimal"
                  disabled={busy}
                  value={entry.plannedNok}
                  onChange={(event) =>
                    setEntry((previous) => ({
                      ...previous,
                      plannedNok: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-proposal-note">
                  Reason for proposal
                </Label>
                <Textarea
                  id="funding-proposal-note"
                  disabled={busy}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
            </>
          )}
          {mode === "award" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="funding-award-date">Award date</Label>
                <Input
                  id="funding-award-date"
                  type="date"
                  disabled={busy}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-award-reference">Award reference</Label>
                <Input
                  id="funding-award-reference"
                  value={reference}
                  disabled={busy}
                  maxLength={1000}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
            </>
          )}
          {mode === "release" && (
            <div className="space-y-2">
              <Label htmlFor="funding-release-reason">
                {removingPendingLink
                  ? "Reason for removing link"
                  : "Release reason"}
              </Label>
              <Textarea
                id="funding-release-reason"
                autoFocus
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {mode === "link"
                ? "Link entry"
                : mode === "propose"
                  ? "Send proposal"
                  : mode === "award"
                    ? "Record award"
                    : removingPendingLink
                      ? "Remove link"
                      : "Release obligation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
