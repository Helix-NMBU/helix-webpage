import { invoiceEvidenceMessage } from "./InvoiceEvidence";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import { Badge } from "@libs/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type {
  ProjectBudgetDetail,
  ProjectBudgetEntry,
} from "./project-budget-types";
import type {
  ProjectPurchaseBinding,
  ProjectPurchaseContext,
} from "./project-purchase-types";
import {
  createProjectPurchaseRepository,
  type ProjectPurchaseRepository,
} from "./project-purchase-repository";
import type { PurchaseInput, PurchaseLineInput } from "./types";
import {
  allowedUpload,
  MAX_PURCHASE_FILE_BYTES,
  MAX_PURCHASE_FILES,
} from "./purchase-domain";
import { osloToday } from "./money";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";
const emptyLine = (): PurchaseLineInput => ({
  systemId: "",
  budgetItemId: null,
  unbudgeted: false,
  description: "",
  quantity: "1",
  amountNok: "",
});
function PurchaseForm({
  context,
  repository,
  onSaved,
  onClose,
  onLockChange,
  onAccessLost,
}: {
  context: ProjectPurchaseContext;
  repository: ProjectPurchaseRepository;
  onSaved: () => Promise<void>;
  onClose: () => void;
  onLockChange: (locked: boolean) => void;
  onAccessLost: () => void;
}) {
  const notify = useNotify();
  const [purchase, setPurchase] = useState<PurchaseInput>(() => ({
    buyerName: "",
    supplierName: "",
    paymentMethod: "team_account",
    purchaseDate: osloToday(),
    justification: "",
    documentKind: "invoice",
    invoiceDueDate: "",
    lines: [emptyLine()],
    uploadIds: [],
  }));
  const [files, setFiles] = useState<Array<{ file: File; uploadId?: string }>>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const submitted = useRef<{
    requestId: string;
    purchase: PurchaseInput;
  } | null>(null);
  const [locked, setLocked] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    onLockChange(busy || locked);
  }, [busy, locked, onLockChange]);
  const binding: ProjectPurchaseBinding = {
    projectId: context.scope.projectId,
    responsibleDepartmentId: context.scope.responsibleDepartmentId!,
  };
  function line(index: number, update: Partial<PurchaseLineInput>) {
    setPurchase((current) => ({
      ...current,
      lines: current.lines.map((row, i) =>
        i === index ? { ...row, ...update } : row,
      ),
    }));
  }
  function selectFiles(input: FileList | null) {
    if (!input) return;
    const additions = Array.from(input);
    if (
      files.length + additions.length > MAX_PURCHASE_FILES ||
      additions.some(
        (file) =>
          !allowedUpload(file.name, file.type) ||
          file.size <= 0 ||
          file.size > MAX_PURCHASE_FILE_BYTES,
      )
    ) {
      notify(
        "Check supporting files",
        "Attach up to 15 PDF or image files, each up to 10 MB.",
        { variant: "error", href: null },
      );
      return;
    }
    setFiles((current) => [...current, ...additions.map((file) => ({ file }))]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      if (!submitted.current) {
        const uploaded = [...files];
        for (let index = 0; index < uploaded.length; index++) {
          if (!uploaded[index].uploadId)
            uploaded[index] = {
              ...uploaded[index],
              uploadId: await repository.upload(binding, uploaded[index].file),
            };
          if (!active.current) return;
          setFiles([...uploaded]);
        }
        const snapshot = {
          ...purchase,
          uploadIds: uploaded.flatMap((file) =>
            file.uploadId ? [file.uploadId] : [],
          ),
        };
        const checked = await repository.mutate({
          action: "checkProjectPurchase",
          ...binding,
          purchase: snapshot,
        });
        if (!active.current) return;
        if (checked.errors.length) throw new Error(checked.errors[0].message);
        submitted.current = {
          requestId: crypto.randomUUID(),
          purchase: snapshot,
        };
        setLocked(true);
      }
      const saved = await repository.mutate({
        action: "registerProjectPurchase",
        ...binding,
        ...submitted.current!,
      });
      if (!active.current) return;
      notify(
        "Purchase registered",
        `${saved.publicRef ?? "Purchase"} saved.${saved.invoiceEvidence ? " " + invoiceEvidenceMessage(saved.invoiceEvidence) : ""}${saved.warnings.length ? " " + saved.warnings.map((w) => w.message).join(" ") : ""}`,
        { variant: saved.warnings.length || saved.invoiceEvidence?.needsAttention ? "warning" : "success", href: null },
      );
      onClose();
      await onSaved();
    } catch (error) {
      if (!active.current) return;
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : null;
      if (status === 401 || status === 403) {
        // Stop every continuation before unmounting the private form and files.
        active.current = false;
        submitted.current = null;
        saving.current = false;
        onLockChange(false);
        onAccessLost();
      } else if (status && [400, 404, 409, 429].includes(status)) {
        submitted.current = null;
        setLocked(false);
      }
      notify("Could not register purchase", message(error), {
        variant: "error",
        href: null,
      });
    } finally {
      saving.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="space-y-4"
    >
      <fieldset disabled={busy || locked} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="project-purchase-buyer">Buyer</Label>
            <Input
              id="project-purchase-buyer"
              value={purchase.buyerName}
              onChange={(e) =>
                setPurchase({ ...purchase, buyerName: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-purchase-supplier">Supplier</Label>
            <Input
              id="project-purchase-supplier"
              value={purchase.supplierName}
              onChange={(e) =>
                setPurchase({ ...purchase, supplierName: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-purchase-date">Purchase date</Label>
            <Input
              id="project-purchase-date"
              type="date"
              max={osloToday()}
              value={purchase.purchaseDate}
              onChange={(e) =>
                setPurchase({ ...purchase, purchaseDate: e.target.value })
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-purchase-payment">Payment method</Label>
            <Select
              value={purchase.paymentMethod}
              onValueChange={(value) =>
                setPurchase({
                  ...purchase,
                  paymentMethod: value as PurchaseInput["paymentMethod"],
                })
              }
            >
              <SelectTrigger id="project-purchase-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team_account">Team account</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="outlay">Personal outlay</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-purchase-document">Document type</Label>
            <Select
              value={purchase.documentKind}
              onValueChange={(value) =>
                setPurchase({
                  ...purchase,
                  documentKind: value as PurchaseInput["documentKind"],
                })
              }
            >
              <SelectTrigger id="project-purchase-document">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(purchase.documentKind === "invoice" ||
            purchase.paymentMethod === "invoice") && (
            <div className="space-y-2">
              <Label htmlFor="project-purchase-due">Invoice due date</Label>
              <Input
                id="project-purchase-due"
                type="date"
                required
                value={purchase.invoiceDueDate ?? ""}
                onChange={(e) =>
                  setPurchase({ ...purchase, invoiceDueDate: e.target.value })
                }
              />
            </div>
          )}
          {purchase.paymentMethod === "outlay" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="project-purchase-account">Refund account</Label>
                <Input
                  id="project-purchase-account"
                  value={purchase.refundAccount ?? ""}
                  onChange={(e) =>
                    setPurchase({ ...purchase, refundAccount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-purchase-phone">Refund phone</Label>
                <Input
                  id="project-purchase-phone"
                  value={purchase.refundPhone ?? ""}
                  onChange={(e) =>
                    setPurchase({ ...purchase, refundPhone: e.target.value })
                  }
                />
              </div>
            </>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-purchase-reason">Purpose</Label>
          <Textarea
            id="project-purchase-reason"
            value={purchase.justification}
            minLength={10}
            required
            onChange={(e) =>
              setPurchase({ ...purchase, justification: e.target.value })
            }
          />
        </div>
        {purchase.lines.map((row, index) => (
          <fieldset key={index} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Purchase line {index + 1}
            </legend>
            <div className="space-y-2">
              <Label htmlFor={`project-purchase-entry-${index}`}>
                Approved entry or incurred cost
              </Label>
              <Select
                value={row.unbudgeted ? "unbudgeted" : (row.budgetItemId ?? "")}
                onValueChange={(value) => {
                  const entry = context.entries.find(
                    (e) => e.budgetItemId === value,
                  );
                  line(
                    index,
                    entry
                      ? {
                          budgetItemId: entry.budgetItemId,
                          systemId: entry.systemId,
                          unbudgeted: false,
                          description: entry.description,
                        }
                      : { budgetItemId: null, unbudgeted: true, systemId: "" },
                  );
                }}
              >
                <SelectTrigger id={`project-purchase-entry-${index}`}>
                  <SelectValue placeholder="Choose an entry" />
                </SelectTrigger>
                <SelectContent>
                  {context.entries.map((entry) => (
                    <SelectItem key={entry.entryId} value={entry.budgetItemId}>
                      {entry.publicRef} · {entry.description}
                    </SelectItem>
                  ))}
                  <SelectItem value="unbudgeted">
                    Not in the approved budget (Finance review)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {row.unbudgeted && (
              <div className="space-y-2">
                <Label htmlFor={`project-purchase-system-${index}`}>
                  System
                </Label>
                <Select
                  value={row.systemId}
                  onValueChange={(value) => line(index, { systemId: value })}
                >
                  <SelectTrigger id={`project-purchase-system-${index}`}>
                    <SelectValue placeholder="Choose a system" />
                  </SelectTrigger>
                  <SelectContent>
                    {context.systems.map((system) => (
                      <SelectItem key={system.id} value={system.id}>
                        {system.code} · {system.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`project-purchase-description-${index}`}>
                Description
              </Label>
              <Input
                id={`project-purchase-description-${index}`}
                value={row.description}
                onChange={(e) => line(index, { description: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`project-purchase-quantity-${index}`}>
                  Quantity
                </Label>
                <Input
                  id={`project-purchase-quantity-${index}`}
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(e) => line(index, { quantity: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`project-purchase-amount-${index}`}>
                  Line total (NOK)
                </Label>
                <Input
                  id={`project-purchase-amount-${index}`}
                  inputMode="decimal"
                  value={row.amountNok}
                  onChange={(e) => line(index, { amountNok: e.target.value })}
                  required
                />
              </div>
            </div>
            {purchase.lines.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setPurchase((current) => ({
                    ...current,
                    lines: current.lines.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove line {index + 1}
              </Button>
            )}
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setPurchase((current) => ({
              ...current,
              lines: [...current.lines, emptyLine()],
            }))
          }
        >
          Add purchase line
        </Button>
        <div className="space-y-2">
          <Label htmlFor="project-purchase-files">
            Invoices and supporting files
          </Label>
          <Input
            id="project-purchase-files"
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
            onChange={(e) => {
              selectFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-sm text-muted-foreground">
            Up to 15 PDF or image files, each up to 10 MB.
          </p>
          {files.map(({ file }, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="break-all">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy || locked}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : locked
              ? "Retry saving purchase"
              : "Register purchase"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ProjectBudgetPurchases({
  budget,
  projectId,
  responsibleDepartmentId,
  onChanged,
  onEvidenceChanged,
  repository: provided,
  onDirtyChange,
  onAccessLost,
}: {
  budget?: ProjectBudgetDetail;
  projectId?: string;
  responsibleDepartmentId?: string;
  onChanged: () => Promise<void>;
  onEvidenceChanged?: () => Promise<void>;
  repository?: ProjectPurchaseRepository;
  onDirtyChange?: (dirty: boolean) => void;
  /** Discard the enclosing cached budget when its purchase authority is revoked. */
  onAccessLost?: () => void;
}) {
  const repository = useMemo(
    () => provided ?? createProjectPurchaseRepository(),
    [provided],
  );
  const notify = useNotify();
  const invoiceChanged = useRef(onEvidenceChanged);
  invoiceChanged.current = onEvidenceChanged;
  const [context, setContext] = useState<ProjectPurchaseContext | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [reload, setReload] = useState(0);
  const accessFallback = useRef<HTMLButtonElement | null>(null);
  const accessLostCallback = useRef(onAccessLost);
  accessLostCallback.current = onAccessLost;
  const [open, setOpen] = useState(false);
  const [purchaseLocked, setPurchaseLocked] = useState(false);
  const [target, setTarget] = useState<ProjectBudgetEntry | null>(null);
  useEffect(() => {
    onDirtyChange?.(open || target !== null);
    return () => onDirtyChange?.(false);
  }, [open, target, onDirtyChange]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const id = budget?.projectId ?? projectId,
    department = budget?.responsibleDepartmentId ?? responsibleDepartmentId;
  const purchaseOpener = useRef<HTMLButtonElement | null>(null);
  const completionOpener = useRef<HTMLButtonElement | null>(null);
  const generation = useRef(0);
  const loading = useRef(0);
  const completionSaving = useRef(false);
  const completionWrite = useRef<
    Parameters<ProjectPurchaseRepository["complete"]>[0] | null
  >(null);
  const [completionLocked, setCompletionLocked] = useState(false);
  const clearPrivateAccess = useCallback(() => {
    generation.current++;
    loading.current++;
    completionSaving.current = false;
    completionWrite.current = null;
    setContext(null);
    setOpen(false);
    setTarget(null);
    setReason("");
    setBusy(false);
    setPurchaseLocked(false);
    setCompletionLocked(false);
    setAccessLost(true);
    accessLostCallback.current?.();
  }, []);
  useEffect(() => {
    if (accessLost) accessFallback.current?.focus();
  }, [accessLost]);
  useEffect(() => {
    generation.current++;
    setAccessLost(false);
    setBusy(false);
    completionSaving.current = false;
    setContext(null);
    setOpen(false);
    setTarget(null);
    setReason("");
    setPurchaseLocked(false);
    setCompletionLocked(false);
    completionWrite.current = null;
    const invoiceScope = generation.current;
    const stop = repository.watchSession?.(clearPrivateAccess, result => {
      if (generation.current !== invoiceScope) return;
      void invoiceChanged.current?.().catch(() => { /* Parent refresh owns its recovery notification. */ });
      const evidence = result.invoiceEvidence;
      if (evidence && evidence.pending + evidence.transferring === 0) notify("Invoice evidence updated", evidence.needsAttention ? "Some invoice transfers need Finance attention. Open Recovery to continue." : "Invoice evidence is confirmed in Drive.", {variant:evidence.needsAttention ? "warning" : "success",href:null});
    });
    return () => {
      generation.current++;
      loading.current++;
      stop?.();
    };
  }, [id, department, notify, repository, clearPrivateAccess]);
  useEffect(() => {
    const current = ++loading.current;
    if (!id || !department) return;
    void repository
      .load({ projectId: id, responsibleDepartmentId: department })
      .then(
        (result) => {
          if (current === loading.current) {
            setContext(result);
            setAccessLost(false);
          }
        },
        (error) => {
          if (current !== loading.current) return;
          const status =
            error && typeof error === "object" && "status" in error
              ? Number(error.status)
              : null;
          if (status === 401 || status === 403) {
            clearPrivateAccess();
          }
          notify("Could not load purchase entries", message(error), {
            variant: "error",
            href: null,
          });
        },
      );
    return () => {
      loading.current++;
    };
  }, [id, department, budget?.revision, repository, notify, reload, clearPrivateAccess]);
  async function completion(event: FormEvent) {
    event.preventDefault();
    if (!target || !budget || completionSaving.current) return;
    completionSaving.current = true;
    setBusy(true);
    const current = generation.current;
    completionWrite.current ??= {
      action: "setProjectBudgetCompletion",
      requestId: crypto.randomUUID(),
      projectBudgetId: budget.id,
      expectedRevision: budget.revision,
      entryId: target.entryId,
      complete: target.completion !== "complete",
      reason,
    };
    setCompletionLocked(true);
    try {
      await repository.complete(completionWrite.current);
      if (current !== generation.current) return;
      notify(
        "Entry updated",
        target.completion === "complete"
          ? "The entry is open for further purchases."
          : "The entry is marked complete.",
        { variant: "success", href: null },
      );
      completionWrite.current = null;
      setCompletionLocked(false);
      setTarget(null);
      setReason("");
      await onChanged();
    } catch (error) {
      if (current !== generation.current) return;
      const status =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : null;
      if (status === 401 || status === 403) {
        clearPrivateAccess();
      } else if (status && [400, 404, 409, 429].includes(status)) {
        completionWrite.current = null;
        setCompletionLocked(false);
      }
      notify("Could not update completion", message(error), {
        variant: "error",
        href: null,
      });
    } finally {
      if (current === generation.current) {
        completionSaving.current = false;
        setBusy(false);
      }
    }
  }
  if (!context) return accessLost ? (
    <Button ref={accessFallback} variant="outline" onClick={() => setReload((value) => value + 1)}>
      Refresh purchase access
    </Button>
  ) : null;
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Purchases</h3>
        <Button ref={purchaseOpener} onClick={() => setOpen(true)}>
          Register a purchase
        </Button>
      </div>
      {budget?.approvedVersion?.entries
        .filter((entry) => !entry.removed && entry.status !== "cancelled")
        .map((entry) => (
          <div
            key={entry.entryId}
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <div>
              <span>{entry.description}</span>{" "}
              <Badge variant="secondary">
                {entry.completion === "not_purchased"
                  ? "Not purchased"
                  : entry.completion === "complete"
                    ? "Complete"
                    : "Partial"}
              </Badge>
              <span className="ml-2 text-muted-foreground">
                NOK {entry.actualNok} purchased
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={entry.completion === "not_purchased"}
              onClick={(event) => {
                completionOpener.current = event.currentTarget;
                completionWrite.current = null;
                setCompletionLocked(false);
                setTarget(entry);
                setReason("");
              }}
            >
              {entry.completion === "complete"
                ? "Reopen entry"
                : "Mark complete"}
            </Button>
          </div>
        ))}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!purchaseLocked) setOpen(value);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (purchaseOpener.current?.isConnected ? purchaseOpener.current : accessFallback.current)?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (purchaseLocked) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (purchaseLocked) event.preventDefault();
          }}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Register a purchase</DialogTitle>
            <DialogDescription>
              Record the actual line totals and attach the invoice. Each order
              keeps its own evidence. Completion and payment are tracked
              separately.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <PurchaseForm
              context={context}
              repository={repository}
              onSaved={onChanged}
              onClose={() => setOpen(false)}
              onLockChange={setPurchaseLocked}
              onAccessLost={clearPrivateAccess}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={target !== null}
        onOpenChange={(value) => {
          if (!value && !busy && !completionLocked) setTarget(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (completionOpener.current?.isConnected
              ? completionOpener.current
              : purchaseOpener.current?.isConnected
                ? purchaseOpener.current
                : accessFallback.current
            )?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy || completionLocked) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy || completionLocked) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {target?.completion === "complete"
                ? "Reopen entry"
                : "Mark entry complete"}
            </DialogTitle>
            <DialogDescription>
              {target?.description}. Record why this entry is complete or needs
              further purchases.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              void completion(event);
            }}
            className="space-y-4"
          >
            <Label htmlFor="project-purchase-completion-reason">Reason</Label>
            <Textarea
              id="project-purchase-completion-reason"
              value={reason}
              maxLength={500}
              required
              disabled={busy || completionLocked}
              onChange={(e) => setReason(e.target.value)}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy || completionLocked}
                onClick={() => setTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !reason.trim()}>
                {busy
                  ? "Saving…"
                  : completionLocked
                    ? "Retry completion"
                    : "Save completion"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
