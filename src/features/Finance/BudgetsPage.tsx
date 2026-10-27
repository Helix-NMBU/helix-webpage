import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { CommitmentUse } from "./budget-summary";
import { BudgetImport } from "./BudgetImport";
import { BUDGET_ITEM_CATEGORIES, MANUAL_ITEM_DEFAULTS } from "./budget-domain";
import type { BudgetChoiceSystem, BudgetEarmarkChoice, BudgetItemInput, BudgetItemPriority, BudgetItemReuse, FinanceMutation, PublicBudgetItem, PublicSystemBudget } from "./types";

const CATEGORY_LABELS: Record<(typeof BUDGET_ITEM_CATEGORIES)[number], string> = {
  material: "Material",
  component: "Component",
  tooling: "Tooling",
  manufacturing_service: "Manufacturing service",
  travel: "Travel",
  fees: "Fees",
  marketing: "Marketing",
  other: "Other",
};

const OPEN_STATUSES = ["planned", "active", "done"] as const;

function moneyText(value: string): string {
  return value.startsWith("-") ? `${value} Over plan` : value;
}

function useRequestIds() {
  const pending = useRef<{ key: string; id: string } | null>(null);
  return {
    idFor(key: string) {
      if (pending.current?.key === key) return pending.current.id;
      const id = crypto.randomUUID();
      pending.current = { key, id };
      return id;
    },
    finish() {
      pending.current = null;
    },
  };
}

export function BudgetsBoard() {
  const session = useFinanceAccess();
  const budgets = session.budgets;
  const notify = useNotify();
  const requests = useRequestIds();
  const [saving, setSaving] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  if (!budgets) return null;
  const canEdit = Boolean(session.capabilities?.draftBudgetItems) && budgets.budgetStatus !== "absent";
  const approved = budgets.budgetStatus === "approved";
  const choices = budgets.choices ?? { systems: [], items: [] };

  async function run(key: string, action: FinanceMutation, success: string) {
    setSaving(true);
    try {
      await session.mutate({ ...action, requestId: requests.idFor(key) });
      requests.finish();
      notify("Budget saved", success, { id: "budget-saved", variant: "success" });
      await session.loadPage("budgets");
      return true;
    } catch (error) {
      requests.finish();
      notify("Could not save the budget change", error instanceof Error ? error.message : "Please try again.", {
        id: "budget-save",
        variant: "error",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {budgets.seasonCode ? `Season ${budgets.seasonCode}` : "No current season"}
          {budgets.budgetStatus === "approved" && budgets.approvedOn ? ` · Approved ${budgets.approvedOn}` : ""}
          {budgets.budgetStatus === "draft" ? " · Draft" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {session.capabilities?.createBudget && budgets.budgetStatus === "absent" ? (
            <Button type="button" disabled={saving} onClick={() => void run("create", { action: "createBudget", requestId: "" }, "The season budget was created.")}>
              Create season budget
            </Button>
          ) : null}
          {session.capabilities?.approveBudget && budgets.budgetStatus === "draft" ? (
            <Button type="button" disabled={saving} onClick={() => setConfirmApprove(true)}>Approve budget</Button>
          ) : null}
        </div>
      </div>
      {budgets.budgetStatus === "absent" ? (
        <p className="text-sm text-muted-foreground">No season budget exists yet.</p>
      ) : null}
      {budgets.budgetStatus === "draft" && !canEdit ? (
        <p className="text-sm text-muted-foreground">This season budget is still a draft.</p>
      ) : null}
      {budgets.departments.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">Totals include spending on cancelled items and leave cancelled plan amounts out.</p>
          <div className="flex items-center gap-2">
            <Checkbox id="show-cancelled" checked={showCancelled} onCheckedChange={(value) => setShowCancelled(value === true)} />
            <Label htmlFor="show-cancelled">Show cancelled</Label>
          </div>
          {budgets.departments.map((department) => (
            <section key={department.departmentKey} className="space-y-4" aria-labelledby={`department-${department.departmentKey}`}>
              <div className="space-y-1">
                <h2 id={`department-${department.departmentKey}`} className="text-xl font-medium">{department.name}</h2>
                <AmountLine planned={department.plannedNok} actual={department.actualNok} difference={department.differenceNok} unbudgeted={department.unbudgetedNok} />
                <CommitmentUse commitmentNok={department.commitmentNok} usedFraction={department.usedFraction} />
              </div>
              {department.systems.map((system) => (
                <SystemBudget
                  key={system.id}
                  system={system}
                  systems={choices.systems}
                  showCancelled={showCancelled}
                  canEdit={canEdit}
                  approved={approved}
                  saving={saving}
                  earmarks={budgets.earmarkChoices ?? []}
                  onSave={run}
                />
              ))}
            </section>
          ))}
        </>
      ) : null}
      {canEdit && session.capabilities?.permittedImports ? <BudgetImport departments={budgets.departments} /> : null}
      {canEdit ? (
        <ItemForm
          key="add-item"
          title="Add budget item"
          submitLabel="Add item"
          systems={choices.systems}
          earmarks={budgets.earmarkChoices ?? []}
          approved={approved}
          saving={saving}
          onSubmit={(payload, reason) => run(`add:${JSON.stringify(payload)}:${reason}`, {
            action: "addItem",
            requestId: "",
            expectedRevision: budgets.revision ?? 0,
            item: payload as BudgetItemInput,
            reason,
          }, "The budget item was added.")}
        />
      ) : null}
      <Dialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve season budget</DialogTitle>
            <DialogDescription>This approves the draft once. Later plan, priority, and earmark changes need the Head of Finance and a reason.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmApprove(false)}>Keep draft</Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                void run(`approve:${budgets.revision ?? 0}`, {
                  action: "approveBudget",
                  requestId: "",
                  expectedRevision: budgets.revision ?? 0,
                }, "The season budget was approved.").then((saved) => { if (saved) setConfirmApprove(false); });
              }}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AmountLine({ planned, actual, difference, unbudgeted }: { planned: string; actual: string; difference: string; unbudgeted: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Planned {planned} · Actual {actual} · Difference {moneyText(difference)}
      {unbudgeted !== "0.00" ? ` · Unbudgeted ${unbudgeted}` : ""}
    </p>
  );
}

function SystemBudget({
  system,
  systems,
  showCancelled,
  canEdit,
  approved,
  saving,
  earmarks,
  onSave,
}: {
  system: PublicSystemBudget;
  systems: BudgetChoiceSystem[];
  showCancelled: boolean;
  canEdit: boolean;
  approved: boolean;
  saving: boolean;
  earmarks: BudgetEarmarkChoice[];
  onSave: (key: string, action: FinanceMutation, success: string) => Promise<boolean>;
}) {
  const items = system.items.filter((item) => showCancelled || item.status !== "cancelled");
  const [editing, setEditing] = useState<{ id: string; revision: number } | null>(null);
  const editSystems = systems.some((entry) => entry.id === system.id) ? systems : [
    { id: system.id, code: system.code, name: system.name, departmentKey: "", active: system.active, unbudgetedItemId: system.unbudgetedItemId, unbudgetedPublicRef: system.unbudgetedPublicRef },
    ...systems,
  ];
  const [note, setNote] = useState(system.unallocated?.note ?? "");
  const [reason, setReason] = useState("");
  return (
    <section className="space-y-3" aria-labelledby={`system-${system.id}`}>
      <div className="space-y-1">
        <h3 id={`system-${system.id}`} className="text-base font-medium">{system.name}</h3>
        <AmountLine planned={system.plannedNok} actual={system.actualNok} difference={system.differenceNok} unbudgeted={system.unbudgetedNok} />
        <CommitmentUse commitmentNok={system.commitmentNok} usedFraction={system.usedFraction} />
        <p className="text-sm text-muted-foreground">
          Unbudgeted spending {system.unbudgetedNok}
          {system.unbudgetedPublicRef ? ` · ${system.unbudgetedPublicRef}` : ""}
        </p>
      </div>
      {canEdit && system.active && !system.unbudgetedItemId ? (
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void onSave(`ensure:${system.id}`, { action: "ensureUnallocated", requestId: "", systemId: system.id }, "The unallocated item was created.")}>
          Create unallocated item
        </Button>
      ) : null}
      {canEdit && system.unallocated ? (
        <form
          className="grid max-w-xl gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(`note:${system.unallocated?.id}:${note}`, {
              action: "editItem",
              requestId: "",
              itemId: system.unallocated?.id ?? "",
              expectedRevision: system.unallocated?.revision ?? 0,
              patch: { note },
            }, "The unallocated note was saved.");
          }}
        >
          <Label htmlFor={`unallocated-note-${system.id}`}>Unallocated note</Label>
          <Textarea id={`unallocated-note-${system.id}`} value={note} onChange={(event) => setNote(event.target.value)} />
          <Button type="submit" variant="outline" size="sm" className="justify-self-start" disabled={saving}>Save note</Button>
        </form>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Planned</TableHead>
            <TableHead>Effective plan</TableHead>
            <TableHead>Actual</TableHead>
            <TableHead>Difference</TableHead>
            <TableHead>Status</TableHead>
            {canEdit ? <TableHead>Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="block font-medium">{item.description}</span>
                <span className="text-muted-foreground">{item.publicRef} · {item.priority}{item.earmarkPurpose ? ` · ${item.earmarkPurpose}` : ""}{item.earmarkAmountNok ? ` · ${item.earmarkAmountNok}` : ""}</span>
                {item.status === "cancelled" ? <span className="block">Stored plan {item.plannedNok}. Effective plan {item.effectivePlanNok}.</span> : null}
                {item.note ? <span className="block">{item.note}</span> : null}
              </TableCell>
              <TableCell>{item.plannedNok}</TableCell>
              <TableCell>{item.effectivePlanNok}</TableCell>
              <TableCell>{item.actualNok}</TableCell>
              <TableCell>{moneyText(item.differenceNok)}</TableCell>
              <TableCell>{item.status}</TableCell>
              {canEdit ? (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {item.status !== "cancelled" ? <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ id: item.id, revision: item.revision })}>Edit</Button> : null}
                    {item.status === "cancelled" ? (
                      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void onSave(`restore:${item.id}:${reason}`, { action: "restoreItem", requestId: "", itemId: item.id, expectedRevision: item.revision, reason }, "The item was restored.")}>Restore item</Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void onSave(`cancel:${item.id}:${reason}`, { action: "cancelItem", requestId: "", itemId: item.id, expectedRevision: item.revision, reason }, "The item was cancelled.")}>Cancel item</Button>
                    )}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {canEdit && approved ? (
        <div className="grid max-w-xl gap-2">
          <Label htmlFor={`reason-${system.id}`}>Reason</Label>
          <Input id={`reason-${system.id}`} value={reason} onChange={(event) => setReason(event.target.value)} />
          <p className="text-sm text-muted-foreground">A reason is required to cancel, restore, or change the planned amount, priority, or earmark on an approved budget.</p>
        </div>
      ) : null}
      {canEdit && editing ? (
        <ItemForm
          key={editing.id}
          title="Edit budget item"
          submitLabel="Save item"
          systems={editSystems}
          item={system.items.find((entry) => entry.id === editing.id) ?? null}
          earmarks={earmarks}
          approved={approved}
          saving={saving}
          onSubmit={(payload, itemReason) => onSave(`edit:${editing.id}:${JSON.stringify(payload)}:${itemReason}`, {
            action: "editItem",
            requestId: "",
            itemId: editing.id,
            expectedRevision: editing.revision,
            patch: payload as Partial<BudgetItemInput>,
            reason: itemReason,
          }, "The budget item was saved.")}
        />
      ) : null}
    </section>
  );
}

type ItemDraft = {
  systemId: string;
  description: string;
  category: string;
  plannedNok: string;
  priority: BudgetItemPriority;
  reuseStatus: BudgetItemReuse;
  status: "planned" | "active" | "done";
  expectedPurchaseDate: string;
  ownerEmail: string;
  note: string;
  earmarkId: string;
};

function changedFields(next: ItemDraft, previous: ItemDraft): Partial<ItemDraft> {
  const patch: Partial<ItemDraft> = {};
  if (next.systemId !== previous.systemId) patch.systemId = next.systemId;
  if (next.description !== previous.description) patch.description = next.description;
  if (next.category !== previous.category) patch.category = next.category;
  if (next.plannedNok !== previous.plannedNok) patch.plannedNok = next.plannedNok;
  if (next.priority !== previous.priority) patch.priority = next.priority;
  if (next.reuseStatus !== previous.reuseStatus) patch.reuseStatus = next.reuseStatus;
  if (next.status !== previous.status) patch.status = next.status;
  if (next.expectedPurchaseDate !== previous.expectedPurchaseDate) patch.expectedPurchaseDate = next.expectedPurchaseDate;
  if (next.ownerEmail !== previous.ownerEmail) patch.ownerEmail = next.ownerEmail;
  if (next.note !== previous.note) patch.note = next.note;
  if (next.earmarkId !== previous.earmarkId) patch.earmarkId = next.earmarkId;
  return patch;
}

function draftFrom(item: PublicBudgetItem | null, systems: BudgetChoiceSystem[]): ItemDraft {
  return {
    systemId: item?.systemId ?? systems[0]?.id ?? "",
    description: item?.description ?? "",
    category: item?.category ?? MANUAL_ITEM_DEFAULTS.category,
    plannedNok: item?.plannedNok ?? "",
    priority: item?.priority ?? MANUAL_ITEM_DEFAULTS.priority,
    reuseStatus: item?.reuseStatus ?? MANUAL_ITEM_DEFAULTS.reuseStatus,
    status: item && item.status !== "cancelled" ? item.status : MANUAL_ITEM_DEFAULTS.status,
    expectedPurchaseDate: item?.expectedPurchaseDate ?? "",
    ownerEmail: item?.ownerEmail ?? "",
    note: item?.note ?? "",
    earmarkId: item?.earmarkId ?? "",
  };
}

function ItemForm({
  title,
  submitLabel,
  systems,
  item = null,
  earmarks,
  approved,
  saving,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  systems: BudgetChoiceSystem[];
  item?: PublicBudgetItem | null;
  earmarks: BudgetEarmarkChoice[];
  approved: boolean;
  saving: boolean;
  onSubmit: (item: Partial<ItemDraft>, reason: string) => Promise<boolean>;
}) {
  const setDirty = useFinanceAccess().setFormDirty;
  const notify = useNotify();
  const [draft, setDraft] = useState<ItemDraft>(() => draftFrom(item, systems));
  const baseline = useRef(draft);
  const [reason, setReason] = useState("");
  const formId = `budget-item:${item?.id ?? "new"}`;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline.current) || Boolean(reason);
  useEffect(() => {
    setDirty?.(formId, isDirty);
    return () => setDirty?.(formId, false);
  }, [formId, isDirty, setDirty]);
  function update(patch: Partial<ItemDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = item ? changedFields(draft, baseline.current) : draft;
    if (item && Object.keys(payload).length === 0) {
      notify("Could not save the budget change", "Enter the fields to change.", { id: "budget-save", variant: "error" });
      return;
    }
    void onSubmit(payload, reason).then((saved) => {
      if (saved && !item) {
        const next = draftFrom(null, systems);
        baseline.current = next;
        setDraft(next);
        setReason("");
      }
      if (saved && item) baseline.current = draft;
    });
  }
  return (
    <form className="grid max-w-xl gap-3" onSubmit={submit} aria-label={title}>
      <h2 className="text-lg font-medium">{title}</h2>
      {approved ? <p className="text-sm text-muted-foreground">A reason is required to add an item or to change the planned amount, priority, or earmark on an approved budget.</p> : null}
      <Field label="System" htmlFor={`${title}-system`}>
        <Select value={draft.systemId || undefined} onValueChange={(value) => update({ systemId: value })}>
          <SelectTrigger id={`${title}-system`} className="w-full"><SelectValue placeholder="Choose a system" /></SelectTrigger>
          <SelectContent>
            {systems.map((system) => <SelectItem key={system.id} value={system.id}>{system.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Description" htmlFor={`${title}-description`}>
        <Input id={`${title}-description`} value={draft.description} onChange={(event) => update({ description: event.target.value })} />
      </Field>
      <Field label="Planned amount" htmlFor={`${title}-amount`}>
        <Input id={`${title}-amount`} inputMode="decimal" value={draft.plannedNok} onChange={(event) => update({ plannedNok: event.target.value })} />
      </Field>
      <Field label="Category" htmlFor={`${title}-category`}>
        <Select value={draft.category} onValueChange={(value) => update({ category: value })}>
          <SelectTrigger id={`${title}-category`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BUDGET_ITEM_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{CATEGORY_LABELS[category]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Priority" htmlFor={`${title}-priority`}>
        <Select value={draft.priority} onValueChange={(value) => update({ priority: value as BudgetItemPriority, earmarkId: value === "EM" ? draft.earmarkId : "" })}>
          <SelectTrigger id={`${title}-priority`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["P1", "P2", "P3", "P4", "EM"] as const).map((priority) => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {draft.priority === "EM" ? (
        <Field label="Earmarked part" htmlFor={`${title}-earmark`}>
          <Select value={draft.earmarkId || "none"} onValueChange={(value) => update({ earmarkId: value === "none" ? "" : value })}>
            <SelectTrigger id={`${title}-earmark`} className="w-full"><SelectValue placeholder="Choose an earmarked part" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Choose an earmarked part</SelectItem>
              {earmarks.map((earmark) => <SelectItem key={earmark.id} value={earmark.id}>{earmark.publicRef} · {earmark.purpose}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <Field label="Reuse" htmlFor={`${title}-reuse`}>
        <Select value={draft.reuseStatus} onValueChange={(value) => update({ reuseStatus: value as BudgetItemReuse })}>
          <SelectTrigger id={`${title}-reuse`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["new", "reuse", "inspect", "consumable"] as const).map((reuse) => <SelectItem key={reuse} value={reuse}>{reuse}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Status" htmlFor={`${title}-status`}>
        <Select value={draft.status} onValueChange={(value) => update({ status: value as ItemDraft["status"] })}>
          <SelectTrigger id={`${title}-status`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPEN_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Expected date" htmlFor={`${title}-date`}>
        <Input id={`${title}-date`} value={draft.expectedPurchaseDate} onChange={(event) => update({ expectedPurchaseDate: event.target.value })} placeholder="YYYY-MM-DD" />
      </Field>
      <Field label="Owner email" htmlFor={`${title}-owner`}>
        <Input id={`${title}-owner`} type="email" value={draft.ownerEmail} onChange={(event) => update({ ownerEmail: event.target.value })} />
      </Field>
      <Field label="Note" htmlFor={`${title}-note`}>
        <Textarea id={`${title}-note`} value={draft.note} onChange={(event) => update({ note: event.target.value })} />
      </Field>
      {approved ? (
        <Field label="Reason" htmlFor={`${title}-reason`}>
          <Input id={`${title}-reason`} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      ) : null}
      <Button type="submit" className="justify-self-start" disabled={saving}>{submitLabel}</Button>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
