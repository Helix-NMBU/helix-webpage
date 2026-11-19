import { FundingBudgetProposals } from "./FundingBudgetProposals";
import { ProjectBudgetComparison } from "./ProjectBudgetComparison";
import { ProjectBudgetImport } from "./ProjectBudgetImport";
import { ProjectBudgetPurchases } from "./ProjectBudgetPurchases";
import { canonicalDepartment } from "../ProjectManagement/departments";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@libs/components/ui/empty";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { BUDGET_ITEM_CATEGORIES } from "./budget-domain";
import { parseNokToOre } from "./money";
import {
  PROJECT_BUDGET_STAGE_LABELS,
  type ProjectBudgetDetail,
  type ProjectBudgetEntryInput,
  type ProjectBudgetMutation,
  type ProjectBudgetScope,
} from "./project-budget-types";
import {
  createProjectBudgetRepository,
  type ProjectBudgetRepository,
  type ProjectBudgetSystemChoice,
  type ProjectBudgetWorkspaceView,
} from "./project-budget-repository";

const money = (value: string) => {
  const [whole, fraction = "00"] = value.split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
};
const status = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : null;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Please try again.";
const emptyEntry = (): ProjectBudgetEntryInput => ({
  systemId: "",
  description: "",
  category: "material",
  plannedNok: "",
  ordinaryPriority: "P1",
  reuseStatus: "new",
  status: "planned",
});

function EntryEditor({
  entry,
  systems,
  busy,
  onSave,
  onClose,
  restoreFocus,
}: {
  entry: ProjectBudgetEntryInput;
  systems: ProjectBudgetSystemChoice[];
  busy: boolean;
  onSave: (entry: ProjectBudgetEntryInput) => Promise<boolean>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [draft, setDraft] = useState<ProjectBudgetEntryInput>(() => ({
    ...entry,
    systemId: entry.systemId || systems[0]?.id || "",
  }));
  const notify = useNotify();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    try {
      const amount = parseNokToOre(draft.plannedNok);
      if (
        !draft.description.trim() ||
        !draft.systemId ||
        amount === null ||
        amount < 0n
      )
        throw new Error(
          "Enter a description, a project system and an amount of zero or more.",
        );
      await onSave(draft);
    } catch (error) {
      notify("Check the budget entry", message(error), {
        variant: "error",
        href: null,
      });
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
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {draft.entryId ? "Edit budget entry" : "Add budget entry"}
          </DialogTitle>
          <DialogDescription>
            Plan the total cost including VAT. Choose P1 for the highest
            ordinary priority.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void submit(event)}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="budget-entry-description">Description</Label>
            <Input
              id="budget-entry-description"
              autoFocus
              maxLength={300}
              value={draft.description}
              disabled={busy}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budget-entry-system">System</Label>
              <Select
                value={draft.systemId}
                onValueChange={(systemId) =>
                  setDraft((previous) => ({ ...previous, systemId }))
                }
                disabled={busy}
              >
                <SelectTrigger id="budget-entry-system" className="w-full">
                  <SelectValue placeholder="Choose a system" />
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
            <div className="space-y-2">
              <Label htmlFor="budget-entry-amount">Planned amount (NOK)</Label>
              <Input
                id="budget-entry-amount"
                inputMode="decimal"
                value={draft.plannedNok}
                disabled={busy}
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    plannedNok: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-entry-priority">Priority</Label>
              <Select
                value={draft.ordinaryPriority}
                onValueChange={(ordinaryPriority) =>
                  setDraft((previous) => ({
                    ...previous,
                    ordinaryPriority:
                      ordinaryPriority as ProjectBudgetEntryInput["ordinaryPriority"],
                  }))
                }
                disabled={busy}
              >
                <SelectTrigger id="budget-entry-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["P1", "P2", "P3", "P4"] as const).map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority === "P1" ? "P1 · Highest priority" : priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-entry-category">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(category) =>
                  setDraft((previous) => ({ ...previous, category }))
                }
                disabled={busy}
              >
                <SelectTrigger id="budget-entry-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_ITEM_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-entry-reuse">Purchase type</Label>
              <Select
                value={draft.reuseStatus}
                onValueChange={(reuseStatus) =>
                  setDraft((previous) => ({
                    ...previous,
                    reuseStatus:
                      reuseStatus as ProjectBudgetEntryInput["reuseStatus"],
                  }))
                }
                disabled={busy}
              >
                <SelectTrigger id="budget-entry-reuse" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["new", "reuse", "inspect", "consumable"] as const).map(
                    (reuse) => (
                      <SelectItem key={reuse} value={reuse}>
                        {reuse[0].toUpperCase() + reuse.slice(1)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-entry-note">Note</Label>
            <Textarea
              id="budget-entry-note"
              value={draft.note ?? ""}
              maxLength={2000}
              disabled={busy}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  note: event.target.value,
                }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateBudget({
  scopes,
  busy,
  onCreate,
  onClose,
  restoreFocus,
}: {
  scopes: ProjectBudgetScope[];
  busy: boolean;
  onCreate: (scope: ProjectBudgetScope, departmentId: string) => Promise<void>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [projectId, setProjectId] = useState(scopes[0]?.projectId ?? "");
  const scope = scopes.find((item) => item.projectId === projectId);
  const [departmentId, setDepartmentId] = useState(
    scope?.departments.length === 1 ? scope.departments[0].id : "",
  );
  const notify = useNotify();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create project budget</DialogTitle>
          <DialogDescription>
            Choose the project and the department responsible for its first
            approval.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !scope ||
              !scope.departments.some(
                (department) => department.id === departmentId,
              )
            ) {
              notify(
                "Choose a responsible department",
                "Select one of the project's departments before creating its budget.",
                { variant: "error", href: null },
              );
              return;
            }
            if (!busy) void onCreate(scope, departmentId);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="budget-project">Project</Label>
            <Select
              value={projectId}
              disabled={busy}
              onValueChange={(id) => {
                setProjectId(id);
                const next = scopes.find((item) => item.projectId === id);
                setDepartmentId(
                  next?.departments.length === 1 ? next.departments[0].id : "",
                );
              }}
            >
              <SelectTrigger id="budget-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopes.map((item) => (
                  <SelectItem key={item.projectId} value={item.projectId}>
                    {item.projectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget-department">Responsible department</Label>
            <Select
              value={departmentId}
              disabled={busy}
              onValueChange={setDepartmentId}
            >
              <SelectTrigger id="budget-department" className="w-full">
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent>
                {scope?.departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  action,
  busy,
  onSubmit,
  onClose,
  restoreFocus,
}: {
  action:
    | "returnProjectBudget"
    | "withdrawProjectBudget"
    | "requestProjectBudgetChanges";
  busy: boolean;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const [reason, setReason] = useState("");
  const notify = useNotify();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {action === "requestProjectBudgetChanges"
              ? "Request budget changes"
              : action === "returnProjectBudget"
                ? "Return for correction"
                : "Withdraw submission"}
          </DialogTitle>
          <DialogDescription>
            {action === "requestProjectBudgetChanges"
              ? "The project lead can revise the Draft proposal. An existing proposal is reused and its approvals reset. The approved version remains available for purchases."
              : "The budget will return to Draft and need both approvals after resubmission."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason.trim()) {
              notify(
                "Enter a reason",
                "Explain why the budget needs to return to Draft.",
                { variant: "error", href: null },
              );
              return;
            }
            if (!busy) void onSubmit(reason.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="budget-return-reason">Reason</Label>
            <Textarea
              id="budget-return-reason"
              autoFocus
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {action === "requestProjectBudgetChanges"
                ? "Request changes"
                : action === "returnProjectBudget"
                  ? "Return to Draft"
                  : "Withdraw to Draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectBudgetsPanel({
  projectId,
  departmentId,
  title = "Project budgets",
  repository: provided,
}: {
  projectId?: string;
  departmentId?: string;
  title?: string;
  repository?: ProjectBudgetRepository;
}) {
  const repository = useMemo(
    () => provided ?? createProjectBudgetRepository(),
    [provided],
  );
  const scopeIdentity = useMemo(
    () => Symbol("project-budget-scope"),
    [repository, projectId, departmentId],
  );
  const currentScope = useRef(scopeIdentity);
  currentScope.current = scopeIdentity;
  const authorizationEpoch = useRef(0);
  const [workspace, setWorkspace] = useState<ProjectBudgetWorkspaceView | null>(
    null,
  );
  const [detail, setDetail] = useState<ProjectBudgetDetail | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false);
  const [entry, setEntry] = useState<ProjectBudgetEntryInput | null>(null),
    [createOpen, setCreateOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<
    | "returnProjectBudget"
    | "withdrawProjectBudget"
    | "requestProjectBudgetChanges"
    | null
  >(null);
  const [stage, setStage] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [proposalDirty, setProposalDirty] = useState(false);
  const [versionView, setVersionView] = useState("proposed");
  const [purchaseDirty, setPurchaseDirty] = useState(false);
  const [purchaseScopeId, setPurchaseScopeId] = useState("");
  const notify = useNotify();
  const alive = useRef(false),
    generation = useRef(0),
    saving = useRef(false),
    mutationGeneration = useRef(0),
    selected = useRef<string | null>(null),
    dirty = useRef(false),
    version = useRef<number | null>(null);
  dirty.current =
    entry !== null || createOpen || reasonAction !== null || importOpen || purchaseDirty || proposalDirty;
  const dialogOpener = useRef<HTMLButtonElement | null>(null);
  const focusFallback = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef(false);
  const restoreFocus = useCallback(() => {
    const target = dialogOpener.current?.isConnected
      ? dialogOpener.current
      : focusFallback.current;
    if (target?.disabled) {
      pendingFocus.current = true;
      return;
    }
    pendingFocus.current = false;
    target?.focus();
  }, []);
  useEffect(() => {
    if (
      !busy &&
      !entry &&
      !createOpen &&
      !reasonAction &&
      !importOpen &&
      !proposalDirty &&
      pendingFocus.current
    )
      restoreFocus();
  }, [busy, entry, createOpen, reasonAction, importOpen, proposalDirty, restoreFocus]);
  const clearPrivate = useCallback(() => {
    authorizationEpoch.current++;
    generation.current++;
    mutationGeneration.current++;
    saving.current = false;
    setBusy(false);
    setLoading(false);
    setWorkspace(null);
    setDetail(null);
    setEntry(null);
    setReasonAction(null);
    setCreateOpen(false);
    setImportOpen(false);
    setProposalDirty(false);
    selected.current = null;
    setDenied(true);
  }, []);
  const load = useCallback(
    async (force = false) => {
      if (saving.current || currentScope.current !== scopeIdentity) return;
      const noticeEpoch = authorizationEpoch.current;
      const request = ++generation.current;
      try {
        const next = await repository.load({ projectId, departmentId });
        if (!alive.current || request !== generation.current) return;
        const changed =
          version.current !== null && version.current !== next.viewVersion;
        version.current = next.viewVersion;
        setWorkspace(next);
        setDenied(false);
        if (
          selected.current &&
          !next.budgets.some((budget) => budget.id === selected.current)
        ) {
          selected.current = null;
          setDetail(null);
          setEntry(null);
          setReasonAction(null);
          setImportOpen(false);
          dirty.current = false;
        }
        if (!selected.current && next.budgets.length === 1)
          selected.current = next.budgets[0].id;
        if (dirty.current && !force) {
          if (changed)
            notify(
              "Budget updated",
              "Your form is kept. Load the latest budget before saving.",
              {
                variant: "warning",
                href: null,
                id: "project-budget-update",
                action: {
                  label: "Load latest",
                  onClick: () => {
                    if (
                      currentScope.current === scopeIdentity &&
                      authorizationEpoch.current === noticeEpoch
                    )
                      void load(true);
                  },
                },
              },
            );
        } else if (selected.current) {
          const loaded = await repository.detail(selected.current);
          if (alive.current && request === generation.current)
            setDetail(loaded);
        }
      } catch (error) {
        if (!alive.current || request !== generation.current) return;
        if ([401, 403].includes(status(error) ?? 0)) clearPrivate();
        notify("Could not load project budgets", message(error), {
          variant: "error",
          href: null,
          action: {
            label: "Try again",
            onClick: () => {
              if (
                currentScope.current === scopeIdentity &&
                authorizationEpoch.current === noticeEpoch
              )
                void load(true);
            },
          },
        });
      } finally {
        if (alive.current && request === generation.current) setLoading(false);
      }
    },
    [repository, projectId, departmentId, notify, clearPrivate, scopeIdentity],
  );
  useEffect(() => {
    alive.current = true;
    mutationGeneration.current++;
    saving.current = false;
    setBusy(false);
    setLoading(true);
    setWorkspace(null);
    setDetail(null);
    setEntry(null);
    setReasonAction(null);
    setCreateOpen(false);
    setImportOpen(false);
    setProposalDirty(false);
    setVersionView("proposed");
    dirty.current = false;
    selected.current = null;
    version.current = null;
    void load();
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30000);
    const stop = repository.watchSession?.(() => {
      generation.current++;
      clearPrivate();
      notify("Session ended", "Sign in again to continue.", {
        variant: "error",
        href: null,
      });
    });
    return () => {
      alive.current = false;
      generation.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      stop?.();
    };
  }, [repository, load, clearPrivate, notify]);
  const pendingRequest = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  async function mutate(change: ProjectBudgetMutation): Promise<boolean> {
    if (saving.current || currentScope.current !== scopeIdentity) return false;
    const noticeEpoch = authorizationEpoch.current;
    const fingerprint = JSON.stringify({ ...change, requestId: "" });
    const requestId =
      pendingRequest.current?.fingerprint === fingerprint
        ? pendingRequest.current.id
        : crypto.randomUUID();
    pendingRequest.current = { fingerprint, id: requestId };
    saving.current = true;
    setBusy(true);
    const operation = ++generation.current;
    const mutation = ++mutationGeneration.current;
    try {
      const result = await repository.mutate({ ...change, requestId });
      if (!alive.current || operation !== generation.current) return false;
      selected.current = result.id;
      pendingRequest.current = null;
      setEntry(null);
      setCreateOpen(false);
      setReasonAction(null);
      if (change.action === "requestProjectBudgetChanges")
        setVersionView("proposed");
      dirty.current = false;
      notify("Budget saved", "The project budget has been updated.", {
        variant: "success",
        href: null,
      });
      saving.current = false;
      await load(true);
      return true;
    } catch (error) {
      if (!alive.current || operation !== generation.current) return false;
      if ([401, 403].includes(status(error) ?? 0)) clearPrivate();
      notify(
        "Could not save the budget",
        `${message(error)}${status(error) === 409 ? " Your form is kept." : ""}`,
        {
          variant: "error",
          href: null,
          action:
            status(error) === 409
              ? {
                  label: "Load latest",
                  onClick: () => {
                    if (
                      currentScope.current === scopeIdentity &&
                      authorizationEpoch.current === noticeEpoch
                    )
                      void load(true);
                  },
                }
              : {
                  label: "Try again",
                  onClick: () => {
                    if (
                      currentScope.current === scopeIdentity &&
                      authorizationEpoch.current === noticeEpoch
                    )
                      void mutate(change);
                  },
                },
        },
      );
      return false;
    } finally {
      if (mutation === mutationGeneration.current) {
        saving.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function selectBudget(id: string) {
    if (dirty.current || saving.current) {
      notify(
        "Finish the open form",
        "Save or cancel your current form before opening another budget.",
        { variant: "warning", href: null },
      );
      return;
    }
    selected.current = id;
    setVersionView("proposed");
    await load(true);
  }
  const candidate = detail?.pendingVersion,
    displayed =
      versionView === "approved"
        ? (detail?.approvedVersion ?? candidate)
        : versionView.startsWith("history:")
          ? (detail?.historyVersions?.find(
              (version) => `history:${version.id}` === versionView,
            ) ??
            candidate ??
            detail?.approvedVersion)
          : (candidate ?? detail?.approvedVersion);
  const viewingCandidate = Boolean(candidate && displayed?.id === candidate.id);
  const entries = displayed?.entries.filter((item) => !item.removed) ?? [];
  const authorScopes =
    workspace?.scopes.filter(
      (scope) =>
        scope.capabilities.canDraft &&
        !workspace.budgets.some(
          (budget) => budget.projectId === scope.projectId,
        ),
    ) ?? [];
  const matching =
    workspace?.budgets.filter(
      (budget) =>
        stage === "all" || (budget.pendingStage ?? "approved") === stage,
    ) ?? [];
  const canEdit = Boolean(
    detail?.capabilities.canDraft &&
    candidate?.status === "draft" &&
    viewingCandidate,
  );
  const canDepartmentApprove = Boolean(
    detail?.capabilities.canReviewDepartment &&
    candidate?.status === "department_pending" &&
    viewingCandidate,
  );
  const canFinanceApprove = Boolean(
    detail?.capabilities.canApproveFinance &&
    candidate?.status === "finance_pending" &&
    viewingCandidate,
  );
  const systems =
    workspace?.systems?.filter((system) =>
      workspace.scopes
        .find((scope) => scope.projectId === detail?.projectId)
        ?.departments.some(
          (department) =>
            canonicalDepartment(department.name) !== null &&
            canonicalDepartment(department.name) ===
              canonicalDepartment(system.departmentName),
        ),
    ) ?? [];
  const incurredScopes = workspace?.scopes.filter(scope => scope.capabilities.canRegisterPurchase && scope.responsibleDepartmentId && !workspace.budgets.some(header => header.projectId === scope.projectId)) ?? [];
  const incurredScope = incurredScopes.find(scope => scope.projectId === purchaseScopeId) ?? incurredScopes[0];
  const write = (
    action:
      | "submitProjectBudget"
      | "approveDepartmentBudget"
      | "approveProjectBudget",
  ) =>
    detail &&
    mutate({
      action,
      projectBudgetId: detail.id,
      expectedRevision: detail.revision,
      requestId: crypto.randomUUID(),
    });
  return (
    <section
      aria-label={title}
      aria-busy={loading || busy}
      className="min-w-0 space-y-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Project budgets pass through their department lead and then Head of
            Finance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || busy}
            ref={focusFallback}
            onClick={() => void load(true)}
          >
            Refresh budgets
          </Button>
          {authorScopes.length > 0 && (
            <Button
              disabled={busy}
              onClick={(event) => {
                dialogOpener.current = event.currentTarget;
                setCreateOpen(true);
              }}
            >
              Create budget
            </Button>
          )}
        </div>
      </div>
      {loading && !workspace ? (
        <p className="text-sm text-muted-foreground">Loading budgets…</p>
      ) : !workspace || workspace.budgets.length === 0 ? (
        <Empty className="min-h-40 border">
          <EmptyHeader>
            <EmptyTitle>
              {denied ? "Budget access required" : "No project budgets yet"}
            </EmptyTitle>
            <EmptyDescription>
              {denied
                ? "Your current assignments do not give access to these budgets."
                : authorScopes.length
                  ? "Create a budget for a project you lead."
                  : "Submitted and approved budgets will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {!projectId && (
            <div className="max-w-sm space-y-2">
              <Label htmlFor="budget-stage-filter">Approval stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger id="budget-stage-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {Object.entries(PROJECT_BUDGET_STAGE_LABELS).map(
                    ([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Responsible department</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Proposed</TableHead>
                <TableHead>
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matching.map((budget) => (
                <TableRow
                  key={budget.id}
                  data-state={detail?.id === budget.id ? "selected" : undefined}
                >
                  <TableCell className="font-medium">
                    {budget.projectName}
                  </TableCell>
                  <TableCell>{budget.responsibleDepartmentName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {
                        PROJECT_BUDGET_STAGE_LABELS[
                          budget.pendingStage ?? "approved"
                        ]
                      }
                    </Badge>
                    {budget.approvedVersionId && budget.pendingVersionId && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Approved version remains available
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {budget.approvedVersionId
                      ? money(budget.approvedTotalNok)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {budget.pendingTotalNok === null
                      ? "—"
                      : money(budget.pendingTotalNok)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Open ${budget.projectName} budget`}
                      onClick={() => void selectBudget(budget.id)}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {matching.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No budgets match this stage.
            </p>
          )}
        </>
      )}
      {detail && displayed && (
        <section
          aria-label={`${detail.projectName} budget details`}
          className="space-y-4 rounded-xl border p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 className="text-lg font-medium">{detail.projectName}</h3>
              <p className="text-sm text-muted-foreground">
                {detail.responsibleDepartmentName} · {detail.seasonCode} ·
                Version {displayed.versionNumber}
              </p>
              <Badge variant="secondary">
                {PROJECT_BUDGET_STAGE_LABELS[displayed.status]}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.approvedVersion &&
                detail.capabilities.canRequestChanges && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={(event) => {
                      dialogOpener.current = event.currentTarget;
                      setReasonAction("requestProjectBudgetChanges");
                    }}
                  >
                    Request changes
                  </Button>
                )}
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={(event) => {
                      dialogOpener.current = event.currentTarget;
                      setImportOpen(true);
                    }}
                  >
                    Import CSV
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || systems.length === 0}
                    onClick={(event) => {
                      dialogOpener.current = event.currentTarget;
                      setEntry(emptyEntry());
                    }}
                  >
                    Add entry
                  </Button>
                  <Button
                    disabled={
                      busy || (entries.length === 0 && !detail.approvedVersion)
                    }
                    onClick={() => void write("submitProjectBudget")}
                  >
                    Send to department lead
                  </Button>
                </>
              )}
              {canDepartmentApprove && (
                <Button
                  disabled={busy}
                  onClick={() => void write("approveDepartmentBudget")}
                >
                  Approve and send to Finance
                </Button>
              )}
              {canFinanceApprove && (
                <Button
                  disabled={busy}
                  onClick={() => void write("approveProjectBudget")}
                >
                  Approve budget
                </Button>
              )}
              {(canDepartmentApprove || canFinanceApprove) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={(event) => {
                    dialogOpener.current = event.currentTarget;
                    setReasonAction("returnProjectBudget");
                  }}
                >
                  Return for correction
                </Button>
              )}
              {detail.capabilities.canDraft &&
                candidate &&
                candidate.status !== "draft" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={(event) => {
                      dialogOpener.current = event.currentTarget;
                      setReasonAction("withdrawProjectBudget");
                    }}
                  >
                    Withdraw submission
                  </Button>
                )}
            </div>
          </div>
          {detail.approvedVersion && (
            <div className="max-w-md space-y-2">
              <Label htmlFor="project-budget-version">Budget version</Label>
              <Select
                value={
                  viewingCandidate
                    ? "proposed"
                    : displayed.id === detail.approvedVersion.id
                      ? "approved"
                      : `history:${displayed.id}`
                }
                disabled={busy || dirty.current}
                onValueChange={setVersionView}
              >
                <SelectTrigger id="project-budget-version" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">
                    Approved version {detail.approvedVersion.versionNumber}
                  </SelectItem>
                  {candidate && (
                    <SelectItem value="proposed">
                      Proposed version {candidate.versionNumber}
                    </SelectItem>
                  )}
                  {detail.historyVersions
                    ?.filter(
                      (version) => version.id !== detail.approvedVersion?.id,
                    )
                    .map((version) => (
                      <SelectItem
                        key={version.id}
                        value={`history:${version.id}`}
                      >
                        Earlier approved version {version.versionNumber}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {detail.approvedVersion && candidate && (
            <ProjectBudgetComparison
              approved={detail.approvedVersion}
              proposed={candidate}
              systems={workspace?.systems ?? []}
            />
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>System</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                {canEdit && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((item) => (
                <TableRow key={item.entryId}>
                  <TableCell className="max-w-sm whitespace-normal">
                    {item.description}
                  </TableCell>
                  <TableCell>
                    {workspace?.systems?.find(
                      (system) => system.id === item.systemId,
                    )?.name ?? "System"}
                  </TableCell>
                  <TableCell>{item.priority}</TableCell>
                  <TableCell>{item.category.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {money(item.plannedNok)}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Edit ${item.description}`}
                          onClick={(event) => {
                            dialogOpener.current = event.currentTarget;
                            setEntry(item);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`Remove ${item.description}`}
                          onClick={() =>
                            void mutate({
                              action: "removeProjectBudgetEntry",
                              projectBudgetId: detail.id,
                              expectedRevision: detail.revision,
                              entryId: item.entryId,
                              requestId: crypto.randomUUID(),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-right font-medium">
            Total {money(displayed.totalNok)}
          </p>
          <FundingBudgetProposals budget={detail} onChanged={() => load(true)} onDirtyChange={setProposalDirty} />
          {detail.capabilities.canRegisterPurchase && (
            <ProjectBudgetPurchases budget={detail} onChanged={() => load(true)} onDirtyChange={setPurchaseDirty} />
          )}
          {detail.decisions.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-medium">Approval history</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {detail.decisions.map((decision) => (
                  <li key={decision.id}>
                    {(
                      {
                        createProjectBudget: "Budget created",
                        saveProjectBudgetEntry: "Entry saved",
                        removeProjectBudgetEntry: "Entry removed",
                        submitProjectBudget: "Sent to department lead",
                        approveDepartmentBudget: "Department approved",
                        approveProjectBudget: "Head of Finance approved",
                        requestProjectBudgetChanges: "Budget changes requested",
                        importProjectBudgetEntries:
                          "Candidate entries imported",
                        adoptProjectBudgetEntries: "Historical entries adopted",
                        returnProjectBudget: "Returned for correction",
                        withdrawProjectBudget: "Submission withdrawn",
                      } as Record<string, string>
                    )[decision.action] ?? "Budget updated"}
                    {decision.reason ? ` · ${decision.reason}` : ""} ·{" "}
                    {new Date(decision.createdAt).toLocaleString("en-GB")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {importOpen && detail && (
        <ProjectBudgetImport
          budget={detail}
          repository={repository}
          systems={systems}
          restoreFocus={restoreFocus}
          onClose={() => setImportOpen(false)}
          onRefresh={() => load(true)}
          onAccessEnded={clearPrivate}
          onImported={async () => {
            setImportOpen(false);
            dirty.current = false;
            setVersionView("proposed");
            await load(true);
          }}
        />
      )}
      {incurredScope && (
        <section aria-label="Project purchases" className="space-y-4 rounded-xl border p-4 sm:p-6">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="incurred-purchase-project">Project</Label>
            <Select value={incurredScope.projectId} disabled={purchaseDirty} onValueChange={setPurchaseScopeId}>
              <SelectTrigger id="incurred-purchase-project"><SelectValue /></SelectTrigger>
              <SelectContent>
                {incurredScopes.map(scope => (
                  <SelectItem key={scope.projectId} value={scope.projectId}>{scope.projectName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ProjectBudgetPurchases
            projectId={incurredScope.projectId}
            responsibleDepartmentId={incurredScope.responsibleDepartmentId!}
            onChanged={() => load(true)}
            onDirtyChange={setPurchaseDirty}
          />
        </section>
      )}
      {createOpen && (
        <CreateBudget
          scopes={authorScopes}
          busy={busy}
          restoreFocus={restoreFocus}
          onClose={() => setCreateOpen(false)}
          onCreate={async (scope, responsibleDepartmentId) => {
            await mutate({
              action: "createProjectBudget",
              projectId: scope.projectId,
              responsibleDepartmentId,
              requestId: crypto.randomUUID(),
            });
          }}
        />
      )}
      {entry && detail && (
        <EntryEditor
          entry={entry}
          systems={systems}
          busy={busy}
          restoreFocus={restoreFocus}
          onClose={() => setEntry(null)}
          onSave={(draft) =>
            mutate({
              action: "saveProjectBudgetEntry",
              projectBudgetId: detail.id,
              expectedRevision: detail.revision,
              entry: draft,
              requestId: crypto.randomUUID(),
            })
          }
        />
      )}
      {reasonAction && detail && (
        <ReasonDialog
          action={reasonAction}
          busy={busy}
          restoreFocus={restoreFocus}
          onClose={() => setReasonAction(null)}
          onSubmit={async (reason) => {
            await mutate({
              action: reasonAction,
              projectBudgetId: detail.id,
              expectedRevision: detail.revision,
              reason,
              requestId: crypto.randomUUID(),
            });
          }}
        />
      )}
    </section>
  );
}
