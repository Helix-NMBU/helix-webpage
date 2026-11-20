import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@libs/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@libs/components/ui/select";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { MEMBER_ACCESS_CHANGED } from "../MemberPlatform/member-access-api";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { DepartmentProjectBudgetReview } from "./DepartmentProjectBudgetReview";
import {
  createDepartmentBudgetRepository,
  type DepartmentBudgetRepository,
} from "./department-budget-repository";
import {
  DEPARTMENT_BUDGET_READINESS_LABELS,
  type DepartmentBudgetPackageDetail,
  type DepartmentBudgetPackageMutation,
  type DepartmentBudgetPackageStatus,
  type DepartmentBudgetPackageQueue,
  type DepartmentBudgetPreview,
  type DepartmentBudgetSnapshot,
} from "./department-budget-types";
import { projectBudgetMoney } from "./project-budget-diff";
import type {
  ProjectBudgetEntry,
  ProjectBudgetSystemChoice,
} from "./project-budget-types";

const errorStatus = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : null;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Try again.";
const statusLabel = {
  finance_pending: "Awaiting Finance approval",
  approved: "Approved",
  returned: "Returned",
  withdrawn: "Withdrawn",
};

export function DepartmentBudgetSnapshotView({
  snapshot,
  systems,
  evidence = [],
  onEvidenceChanged,
  onAccessEnded,
}: {
  snapshot: DepartmentBudgetSnapshot;
  systems: ProjectBudgetSystemChoice[];
  evidence?: ProjectBudgetEntry[];
  onEvidenceChanged?: () => Promise<void>;
  onAccessEnded?: () => void;
}) {
  const members = useWorkspace()?.data?.members ?? [];
  const name = (id: string) =>
    members.find((member) => member.id === id)?.name ?? id;
  return (
    <div className="min-w-0 space-y-6">
      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">
            Department approved allocation
          </dt>
          <dd className="mt-1 font-medium">
            {projectBudgetMoney(snapshot.approvedTotalNok)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Department package total</dt>
          <dd className="mt-1 font-medium">
            {projectBudgetMoney(snapshot.proposedTotalNok)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Net change</dt>
          <dd className="mt-1 font-medium">
            {projectBudgetMoney(snapshot.deltaNok)}
          </dd>
        </div>
      </dl>
      <section aria-label="Project readiness" className="space-y-3">
        <h4 className="font-medium">All associated projects</h4>
        <p className="text-sm text-muted-foreground">
          Unfinished projects do not block submission. Only included changes and
          last approved allocations contribute to this package.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Project leads</TableHead>
              <TableHead>Budget department</TableHead>
              <TableHead>Readiness</TableHead>
              <TableHead className="text-right">Last approved</TableHead>
              <TableHead className="text-right">Package allocation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.projects.map((project) => (
              <TableRow key={project.projectId}>
                <TableCell className="max-w-xs whitespace-normal">
                  {project.projectName}
                  {project.included ? (
                    <span className="mt-1 block text-xs font-medium">
                      Changes included
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  {project.projectLeadIds.length
                    ? project.projectLeadIds.map(name).join(", ")
                    : "No project lead assigned"}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  {project.responsibleDepartmentName ?? "Not selected"}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  {DEPARTMENT_BUDGET_READINESS_LABELS[project.readiness]}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {project.approvedVersion
                    ? projectBudgetMoney(project.approvedTotalNok)
                    : "No approved budget"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {projectBudgetMoney(project.proposedTotalNok)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      {snapshot.projects.map((project) => (
        <section
          key={project.projectId}
          aria-label={`${project.projectName} package entries`}
          className="min-w-0 space-y-4 border-t pt-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="font-medium">{project.projectName}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {project.included
                  ? "Included project changes"
                  : project.approvedVersion
                    ? "Last approved baseline; no changes included"
                    : DEPARTMENT_BUDGET_READINESS_LABELS[project.readiness]}
              </p>
            </div>
            <p className="whitespace-nowrap font-medium">
              Project subtotal {projectBudgetMoney(project.proposedTotalNok)}
            </p>
          </div>
          {project.approvedVersion || project.proposedVersion ? (
            <DepartmentProjectBudgetReview
              approved={project.approvedVersion}
              proposed={
                project.included
                  ? project.proposedVersion
                  : project.approvedVersion
              }
              systems={systems}
              evidence={evidence}
              onEvidenceChanged={onEvidenceChanged}
              onAccessEnded={onAccessEnded}
            />
          ) : null}
        </section>
      ))}
      <section
        aria-label="Unmapped legacy allocation"
        className="space-y-3 border-t pt-4"
      >
        <h4 className="font-medium">Unmapped legacy allocation</h4>
        <p className="text-sm text-muted-foreground">
          Legacy approved subtotal {projectBudgetMoney(snapshot.legacyTotalNok)}
          ; package subtotal{" "}
          {projectBudgetMoney(snapshot.proposedLegacyTotalNok)}. These entries
          retain their existing system department until an approved project
          replacement.
        </p>
        {snapshot.legacyEntries.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entry</TableHead>
                <TableHead>System</TableHead>
                <TableHead className="text-right">Approved plan</TableHead>
                <TableHead className="text-right">Package plan</TableHead>
                <TableHead>Project replacement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.legacyEntries.map((entry) => (
                <TableRow key={entry.entryId}>
                  <TableCell className="max-w-xs whitespace-normal">
                    {entry.publicRef} · {entry.description}
                  </TableCell>
                  <TableCell>{entry.systemName}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {projectBudgetMoney(entry.plannedNok)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {projectBudgetMoney(entry.proposedNok)}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    {entry.replacementProjectId
                      ? (snapshot.projects.find(
                          (project) =>
                            project.projectId === entry.replacementProjectId,
                        )?.projectName ?? entry.replacementProjectId)
                      : "Unmapped"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </div>
  );
}

type ReasonAction =
  | "returnDepartmentBudgetPackage"
  | "withdrawDepartmentBudgetPackage";
function DepartmentPackageReasonDialog({
  action,
  permitted,
  open,
  busy,
  reason,
  onReasonChange,
  onOpenChange,
  onSubmit,
}: {
  action: ReasonAction;
  permitted: boolean;
  open: boolean;
  busy: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const returning = action === "returnDepartmentBudgetPackage",
    label = returning
      ? "Return department package"
      : "Withdraw department package";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {permitted ? (
        <DialogTrigger asChild>
          <Button variant="outline" disabled={busy}>
            {label}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            The whole active package becomes unavailable for approval. Included
            candidates return to Draft and must pass both reviews again.
            Previous approved budgets stay usable.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && permitted) onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="department-package-reason">Reason</Label>
            <Textarea
              id="department-package-reason"
              autoFocus
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(event) => onReasonChange(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !permitted}>
              {returning ? "Return to Draft" : "Withdraw to Draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentBudgetsPanel({
  departmentId,
  repository: provided,
  systems = [],
}: {
  departmentId?: string;
  repository?: DepartmentBudgetRepository;
  systems?: ProjectBudgetSystemChoice[];
}) {
  const repository = useMemo(
    () => provided ?? createDepartmentBudgetRepository(),
    [provided],
  );
  const identity = useMemo(
    () => Symbol("department-budget-scope"),
    [repository, departmentId],
  );
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const epoch = useRef(0),
    alive = useRef(false),
    busyRef = useRef(false),
    deniedRef = useRef(false),
    selectedRef = useRef<string | null>(null),
    dirtyRef = useRef(false),
    readGeneration = useRef(0),
    detailGeneration = useRef(0),
    previewGeneration = useRef(0),
    mutationGeneration = useRef(0);
  const [queue, setQueue] = useState<DepartmentBudgetPackageQueue | null>(null),
    [detail, setDetail] = useState<DepartmentBudgetPackageDetail | null>(null),
    [preview, setPreview] = useState<DepartmentBudgetPreview | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false),
    [departmentSelection, setDepartmentSelection] = useState(
      departmentId ?? "all",
    ),
    [packageStage, setPackageStage] = useState<
      DepartmentBudgetPackageStatus | "all"
    >("finance_pending"),
    [previewOpen, setPreviewOpen] = useState(false),
    [reasonAction, setReasonAction] = useState<
      "returnDepartmentBudgetPackage" | "withdrawDepartmentBudgetPackage" | null
    >(null),
    [reason, setReason] = useState("");
  const reasonTarget = useRef<{ id: string; revision: number } | null>(null),
    attempt = useRef<{
      fingerprint: string;
      change: DepartmentBudgetPackageMutation;
    } | null>(null);
  const notify = useNotify();
  dirtyRef.current = previewOpen || reasonAction !== null;
  const valid = (captured: symbol, authorization: number) =>
    alive.current &&
    currentIdentity.current === captured &&
    epoch.current === authorization &&
    !deniedRef.current;
  const clearPrivate = useCallback(() => {
    epoch.current++;
    deniedRef.current = true;
    readGeneration.current++;
    detailGeneration.current++;
    previewGeneration.current++;
    mutationGeneration.current++;
    busyRef.current = false;
    setBusy(false);
    selectedRef.current = null;
    attempt.current = null;
    reasonTarget.current = null;
    setQueue(null);
    setDetail(null);
    setPreview(null);
    setReason("");
    setReasonAction(null);
    setPreviewOpen(false);
    setDenied(true);
    setLoading(false);
  }, []);
  const handleError = useCallback(
    (error: unknown, title: string, retry?: () => void) => {
      if ([401, 403].includes(errorStatus(error) ?? 0)) {
        clearPrivate();
        notify(
          "Department budget access ended",
          "Your private department budget view has been cleared.",
          { variant: "error", href: null },
        );
        return;
      }
      notify(title, errorMessage(error), {
        variant: "error",
        href: null,
        ...(retry ? { action: { label: "Try again", onClick: retry } } : {}),
      });
    },
    [clearPrivate, notify],
  );
  const refreshDetail = useCallback(
    async (id = selectedRef.current) => {
      if (!id || deniedRef.current) return;
      const captured = identity,
        authorization = epoch.current,
        generation = ++detailGeneration.current;
      try {
        const next = await repository.detail(id);
        if (
          !valid(captured, authorization) ||
          generation !== detailGeneration.current ||
          selectedRef.current !== id
        )
          return;
        setDetail((previous) =>
          previous?.id === next.id
            ? { ...next, snapshot: previous.snapshot }
            : next,
        );
      } catch (error) {
        if (
          valid(captured, authorization) &&
          generation === detailGeneration.current
        )
          handleError(error, "Could not load department package", () => {
            if (valid(captured, authorization)) void refreshDetail(id);
          });
      }
    },
    [handleError, identity, repository],
  );
  const load = useCallback(async () => {
    if (deniedRef.current) return;
    const captured = identity,
      authorization = epoch.current,
      generation = ++readGeneration.current;
    setLoading(true);
    try {
      const next = await repository.queue(departmentId);
      if (
        !valid(captured, authorization) ||
        generation !== readGeneration.current
      )
        return;
      setQueue(next);
      setDepartmentSelection(
        (current) =>
          departmentId ??
          (current === "all" ||
          next.departments.some((department) => department.id === current)
            ? current
            : "all"),
      );
      await refreshDetail();
    } catch (error) {
      if (
        valid(captured, authorization) &&
        generation === readGeneration.current
      )
        handleError(error, "Could not load department budgets", () => {
          if (valid(captured, authorization)) void load();
        });
    } finally {
      if (
        valid(captured, authorization) &&
        generation === readGeneration.current
      )
        setLoading(false);
    }
  }, [departmentId, handleError, identity, refreshDetail, repository]);
  useEffect(() => {
    alive.current = true;
    deniedRef.current = false;
    epoch.current++;
    previewGeneration.current++;
    mutationGeneration.current++;
    busyRef.current = false;
    setBusy(false);
    selectedRef.current = null;
    attempt.current = null;
    reasonTarget.current = null;
    setQueue(null);
    setDetail(null);
    setPreview(null);
    setReason("");
    setReasonAction(null);
    setPreviewOpen(false);
    setDenied(false);
    void load();
    const stop = repository.watchSession?.(clearPrivate);
    const onFocus = () => {
      if (!busyRef.current) void load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("helix-workspace-updated", onFocus);
    const onAccessChanged = () => void load();
    window.addEventListener(MEMBER_ACCESS_CHANGED, onAccessChanged);
    const timer = window.setInterval(onFocus, 30000);
    return () => {
      alive.current = false;
      epoch.current++;
      readGeneration.current++;
      detailGeneration.current++;
      stop?.();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("helix-workspace-updated", onFocus);
      window.removeEventListener(MEMBER_ACCESS_CHANGED, onAccessChanged);
      window.clearInterval(timer);
    };
  }, [clearPrivate, load, repository]);
  const selectedDepartment = departmentId ?? departmentSelection;
  const available = queue?.departments.find(
    (department) => department.id === selectedDepartment,
  );
  function closePreview() {
    previewGeneration.current++;
    dirtyRef.current = false;
    setPreviewOpen(false);
    setPreview(null);
  }
  async function openPreview() {
    if (busyRef.current || !available?.canSubmit || deniedRef.current) return;
    const captured = identity,
      authorization = epoch.current;
    const request = ++previewGeneration.current;
    dirtyRef.current = true;
    setPreview(null);
    setPreviewOpen(true);
    try {
      const next = await repository.preview(selectedDepartment);
      if (
        valid(captured, authorization) &&
        request === previewGeneration.current
      ) {
        setPreview(next);
        if (next.activePackageId)
          notify(
            "Department submission already pending",
            "Review or withdraw the active package before sending another.",
            { variant: "info", href: null },
          );
        else if (!next.projects.some((project) => project.included))
          notify(
            "No submitted project changes",
            "Project leads need to submit a candidate before this department can send new changes.",
            { variant: "info", href: null },
          );
      }
    } catch (error) {
      if (
        valid(captured, authorization) &&
        request === previewGeneration.current
      )
        handleError(error, "Could not preview department submission", () => {
          if (
            valid(captured, authorization) &&
            request === previewGeneration.current
          )
            void openPreview();
        });
    }
  }
  async function mutate(change: DepartmentBudgetPackageMutation) {
    if (busyRef.current || deniedRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const captured = identity,
      authorization = epoch.current;
    const mutation = ++mutationGeneration.current;
    const fingerprint = JSON.stringify({ ...change, requestId: undefined });
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, change };
    const submitted = attempt.current.change;
    try {
      const result = await repository.mutate(submitted);
      if (!result.ok || !result.id)
        throw new Error(
          "The decision response could not be confirmed. Retry the same action.",
        );
      if (!valid(captured, authorization)) return;
      attempt.current = null;
      closePreview();
      setReasonAction(null);
      setReason("");
      reasonTarget.current = null;
      if (result.id) {
        selectedRef.current = result.id;
        setDetail(null);
      }
      notify(
        change.action === "sendDepartmentBudgetPackage"
          ? "Department budget sent"
          : change.action === "approveDepartmentBudgetPackage"
            ? "Department budget approved"
            : change.action === "returnDepartmentBudgetPackage"
              ? "Department budget returned"
              : "Department submission withdrawn",
        change.action === "approveDepartmentBudgetPackage"
          ? "All included project changes were approved together."
          : change.action === "sendDepartmentBudgetPackage"
            ? "The fixed department package is ready for Head of Finance."
            : "Included candidates return to Draft. Previous approvals remain available for purchases.",
        { variant: "success", href: null },
      );
      await load();
    } catch (error) {
      if (valid(captured, authorization))
        handleError(error, "Could not save department decision");
    } finally {
      if (mutation === mutationGeneration.current) {
        busyRef.current = false;
        if (valid(captured, authorization)) setBusy(false);
      }
    }
  }
  if (denied) return null;
  return (
    <section
      aria-label="Department budget submissions"
      aria-busy={loading || busy}
      className="min-w-0 space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">Department budget submissions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review a fixed department package. Head of Finance approves all
            included project changes together.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Refresh submissions
        </Button>
      </div>
      {!departmentId && queue?.departments.length ? (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="package-department">Department</Label>
          <Select
            value={departmentSelection}
            disabled={busy || dirtyRef.current}
            onValueChange={(value) => {
              detailGeneration.current++;
              selectedRef.current = null;
              attempt.current = null;
              setDetail(null);
              setDepartmentSelection(value);
            }}
          >
            <SelectTrigger id="package-department" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {queue.departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name} · {department.seasonCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {queue ? (
        <div className="max-w-sm space-y-2">
          <Label htmlFor="department-package-stage">Submission status</Label>
          <Select
            value={packageStage}
            disabled={busy || dirtyRef.current}
            onValueChange={(value) =>
              setPackageStage(value as DepartmentBudgetPackageStatus | "all")
            }
          >
            <SelectTrigger id="department-package-stage" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finance_pending">
                Awaiting Finance approval
              </SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
              <SelectItem value="all">All submissions</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!busyRef.current) {
            if (open) setPreviewOpen(true);
            else closePreview();
          }
        }}
      >
        {available?.canSubmit ? (
          <DialogTrigger asChild>
            <Button disabled={busy} onClick={() => void openPreview()}>
              Preview department submission
            </Button>
          </DialogTrigger>
        ) : null}
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {preview?.departmentName ?? available?.name ?? "Department"}{" "}
              submission preview
            </DialogTitle>
            <DialogDescription>
              Sending approves the included project candidates at department
              level. Missing and unfinished projects remain visible and do not
              block submission.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <DepartmentBudgetSnapshotView
              snapshot={preview}
              systems={systems}
            />
          ) : (
            <p>Loading submission preview…</p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={closePreview}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void openPreview()}
            >
              Load latest preview
            </Button>
            <Button
              disabled={
                busy ||
                !preview?.capabilities.canSubmit ||
                !!preview.activePackageId ||
                !preview.projects.some((project) => project.included)
              }
              onClick={() =>
                preview &&
                void mutate({
                  action: "sendDepartmentBudgetPackage",
                  requestId: crypto.randomUUID(),
                  departmentId: preview.departmentId,
                  previewToken: preview.previewToken,
                })
              }
            >
              Send department budget to Finance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {loading && !queue ? (
        <p className="text-sm text-muted-foreground">
          Loading department submissions…
        </p>
      ) : null}
      {queue ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Fixed total</TableHead>
              <TableHead>
                <span className="sr-only">Review</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.packages
              .filter(
                (packet) =>
                  (selectedDepartment === "all" ||
                    !selectedDepartment ||
                    packet.snapshot.departmentId === selectedDepartment) &&
                  (packageStage === "all" || packet.status === packageStage),
              )
              .map((packet) => (
                <TableRow key={packet.id}>
                  <TableCell>{packet.snapshot.departmentName}</TableCell>
                  <TableCell>
                    {new Date(packet.submittedAt).toLocaleString("en-GB")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {statusLabel[packet.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {projectBudgetMoney(packet.snapshot.proposedTotalNok)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || dirtyRef.current}
                      onClick={() => {
                        selectedRef.current = packet.id;
                        setDetail(null);
                        void refreshDetail(packet.id);
                      }}
                    >
                      Review package
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      ) : null}
      {queue &&
      !queue.packages.some(
        (packet) =>
          (selectedDepartment === "all" ||
            !selectedDepartment ||
            packet.snapshot.departmentId === selectedDepartment) &&
          (packageStage === "all" || packet.status === packageStage),
      ) ? (
        <p className="text-sm text-muted-foreground">
          {queue.packages.length
            ? "No department submissions match this view."
            : "No department submissions yet."}
        </p>
      ) : null}
      {detail ? (
        <section
          aria-label="Fixed department package"
          className="min-w-0 space-y-6 rounded-lg border p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium">
                {detail.snapshot.departmentName} · {detail.snapshot.seasonCode}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Submitted {new Date(detail.submittedAt).toLocaleString("en-GB")}{" "}
                · {statusLabel[detail.status]}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Plan and readiness are fixed at submission. Current actuals and
                invoices can refresh independently.
              </p>
            </div>
            {detail.status === "finance_pending" &&
            detail.capabilities.canApproveFinance ? (
              <Button
                disabled={busy || dirtyRef.current}
                onClick={() =>
                  void mutate({
                    action: "approveDepartmentBudgetPackage",
                    packageId: detail.id,
                    expectedRevision: detail.revision,
                    requestId: crypto.randomUUID(),
                  })
                }
              >
                Approve whole department budget
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "returnDepartmentBudgetPackage",
                "withdrawDepartmentBudgetPackage",
              ] as const
            ).map((action) => (
              <DepartmentPackageReasonDialog
                key={action}
                action={action}
                permitted={
                  detail.status === "finance_pending" &&
                  (action === "returnDepartmentBudgetPackage"
                    ? detail.capabilities.canReturn
                    : detail.capabilities.canWithdraw)
                }
                open={reasonAction === action}
                busy={busy}
                reason={reason}
                onReasonChange={setReason}
                onOpenChange={(open) => {
                  if (busyRef.current) return;
                  if (open) {
                    reasonTarget.current = {
                      id: detail.id,
                      revision: detail.revision,
                    };
                    setReasonAction(action);
                    setReason("");
                  } else {
                    setReasonAction(null);
                    setReason("");
                    reasonTarget.current = null;
                  }
                }}
                onSubmit={() => {
                  if (!reason.trim()) {
                    notify(
                      "Enter a reason",
                      "Explain why this department package needs to return to Draft.",
                      { variant: "error", href: null },
                    );
                    return;
                  }
                  if (reasonTarget.current)
                    void mutate({
                      action,
                      requestId: crypto.randomUUID(),
                      packageId: reasonTarget.current.id,
                      expectedRevision: reasonTarget.current.revision,
                      reason: reason.trim(),
                    });
                }}
              />
            ))}
          </div>
          <DepartmentBudgetSnapshotView
            snapshot={detail.snapshot}
            systems={systems}
            evidence={detail.evidence}
            onEvidenceChanged={() => refreshDetail(detail.id)}
            onAccessEnded={clearPrivate}
          />
          {detail.decisions.length ? (
            <section
              aria-label="Department package history"
              className="space-y-2 border-t pt-4"
            >
              <h4 className="font-medium">Decision history</h4>
              <ul className="space-y-2 text-sm">
                {detail.decisions.map((decision) => (
                  <li key={decision.id}>
                    {decision.action === "sendDepartmentBudgetPackage"
                      ? "Submitted"
                      : decision.action === "approveDepartmentBudgetPackage"
                        ? "Approved"
                        : decision.action === "returnDepartmentBudgetPackage"
                          ? "Returned"
                          : "Withdrawn"}{" "}
                    · {new Date(decision.createdAt).toLocaleString("en-GB")} ·{" "}
                    {decision.actorMemberId}
                    {decision.reason ? ` · ${decision.reason}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
