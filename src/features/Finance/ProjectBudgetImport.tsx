import { useEffect, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Textarea } from "@libs/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@libs/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@libs/components/ui/table";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "./budget-import";
import { projectBudgetMoney } from "./project-budget-diff";
import type { ProjectBudgetRepository } from "./project-budget-repository";
import type {
  ProjectBudgetDetail,
  ProjectBudgetImportPreview,
  ProjectBudgetMutation,
  ProjectBudgetSystemChoice,
} from "./project-budget-types";
const FIELD_LABELS: Record<string, string> = {
  system_id: "System",
  description: "Description",
  planned_nok: "Planned amount",
  priority: "Priority",
  category: "Category",
  reuse_status: "Purchase type",
  expected_purchase_date: "Expected purchase date",
  note: "Note",
  earmark_id: "Restricted funding",
  status: "Status",
};
export function ProjectBudgetImport({
  budget,
  repository,
  systems,
  onImported,
  onRefresh,
  onClose,
  restoreFocus,
  onAccessEnded,
}: {
  budget: ProjectBudgetDetail;
  repository: ProjectBudgetRepository;
  systems: ProjectBudgetSystemChoice[];
  onImported: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  restoreFocus: () => void;
  onAccessEnded: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ProjectBudgetImportPreview | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const alive = useRef(false),
    generation = useRef(0),
    working = useRef(false),
    fileRead = useRef(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  const notify = useNotify();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      fileRead.current++;
    };
  }, []);
  useEffect(() => {
    setPreview(null);
    generation.current++;
    fileRead.current++;
    working.current = false;
    setBusy(false);
  }, [budget.id, budget.revision, repository]);
  async function run(
    action: "previewProjectBudgetImport" | "importProjectBudgetEntries",
  ) {
    if (working.current || !alive.current) return;
    const source = csv,
      candidate = budget.revision;
    if (!source.trim()) {
      notify(
        "Choose a CSV",
        "Upload a CSV file or paste its contents before previewing.",
        { variant: "error", href: null },
      );
      return;
    }
    if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) {
      notify("CSV is too large", "Use a CSV of 256 KiB or smaller.", {
        variant: "error",
        href: null,
      });
      return;
    }
    if (
      action === "importProjectBudgetEntries" &&
      (!preview ||
        preview.errors.length ||
        preview.projectBudgetId !== budget.id ||
        preview.candidateRevision !== candidate)
    )
      return;
    const change = {
      action,
      projectBudgetId: budget.id,
      expectedRevision: candidate,
      csv: source,
      ...(action === "importProjectBudgetEntries"
        ? { previewToken: preview!.previewToken }
        : {}),
    };
    const key = JSON.stringify(change);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    const operation = ++generation.current;
    working.current = true;
    setBusy(true);
    try {
      const result = await repository.mutate({
        ...change,
        requestId: request.current.id,
      } as ProjectBudgetMutation);
      if (!alive.current || operation !== generation.current) return;
      if (action === "previewProjectBudgetImport") {
        if (
          !result.importPreview ||
          result.importPreview.projectBudgetId !== budget.id ||
          result.importPreview.candidateRevision !== candidate
        )
          throw new Error(
            "The preview no longer matches this proposed version. Refresh the budget and preview again.",
          );
        setPreview(result.importPreview);
        if (result.importPreview.errors.length)
          notify(
            "Check the CSV",
            result.importPreview.errors
              .slice(0, 5)
              .map((error) => error.message)
              .join("\n"),
            { variant: "error", href: null },
          );
        else if (result.importPreview.warnings.length)
          notify(
            "Review the import",
            result.importPreview.warnings.join("\n"),
            { variant: "warning", href: null },
          );
      } else {
        if (result.errors.length)
          throw new Error(
            result.errors.map((error) => error.message).join("\n"),
          );
        request.current = null;
        notify(
          "Budget entries imported",
          "The proposed version was updated. It still needs both approvals.",
          { variant: "success", href: null },
        );
        await onImported();
      }
    } catch (error) {
      if (!alive.current || operation !== generation.current) return;
      const code =
        error && typeof error === "object" && "status" in error
          ? Number(error.status)
          : 0;
      if (code === 401 || code === 403) {
        onAccessEnded();
        notify(
          "Budget access ended",
          "Your current assignments no longer allow this import.",
          { variant: "error", href: null },
        );
        return;
      }
      const stale = code === 409;
      if (stale) setPreview(null);
      notify(
        "Could not import budget entries",
        `${error instanceof Error ? error.message : "Try again."} Your CSV is kept.`,
        {
          variant: "error",
          href: null,
          action: {
            label: stale ? "Refresh budget" : "Try again",
            onClick: () => {
              if (alive.current && operation === generation.current) {
                if (stale) void onRefresh();
                else void run(action);
              }
            },
          },
        },
      );
    } finally {
      if (alive.current && operation === generation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  function previewValue(
    field: string,
    value: string | null,
    row: ProjectBudgetImportPreview["rows"][number],
  ): string {
    if (!value) return "None";
    if (field === "planned_nok") return projectBudgetMoney(value);
    if (field === "system_id") {
      const system = systems.find(
        (item) => item.id === value || item.code === value,
      );
      return system
        ? `${system.name} (${system.code})`
        : `${row.systemName} (${row.systemCode})`;
    }
    return value;
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
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
          <DialogTitle>Import project budget entries</DialogTitle>
          <DialogDescription>
            Replace this Draft proposal with one CSV for the whole project.
            Descriptions and systems match existing entries. The approved
            version stays available for purchases.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Use up to {MAX_IMPORT_ROWS} rows and 256 KiB. Priority choices are P1
          to P4. Omitted optional columns keep existing values.
        </p>
        <div className="text-sm text-muted-foreground">
          <p>Use one of these system codes in system_id:</p>
          <ul className="mt-1 list-disc pl-5">
            {systems.map((system) => (
              <li key={system.id}>
                <code>{system.code}</code> · {system.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-budget-csv-file">CSV file</Label>
          <Input
            id="project-budget-csv-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              if (file.size > MAX_IMPORT_BYTES) {
                notify("CSV is too large", "Use a CSV of 256 KiB or smaller.", {
                  variant: "error",
                  href: null,
                });
                return;
              }
              const operation = ++fileRead.current;
              working.current = true;
              setBusy(true);
              void file
                .text()
                .then((text) => {
                  if (alive.current && operation === fileRead.current) {
                    generation.current++;
                    setCsv(text);
                    setPreview(null);
                  }
                })
                .catch((error) => {
                  if (alive.current && operation === fileRead.current)
                    notify(
                      "Could not read the CSV",
                      error instanceof Error
                        ? error.message
                        : "Choose the file again.",
                      { variant: "error", href: null },
                    );
                })
                .finally(() => {
                  if (alive.current && operation === fileRead.current) {
                    working.current = false;
                    setBusy(false);
                  }
                });
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-budget-csv">CSV text</Label>
          <Textarea
            id="project-budget-csv"
            rows={6}
            value={csv}
            disabled={busy}
            onChange={(event) => {
              generation.current++;
              setCsv(event.target.value);
              setPreview(null);
            }}
            placeholder="system_id;description;planned_nok;priority;category;reuse_status;expected_purchase_date;note;earmark_id"
          />
        </div>
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={busy}
          onClick={() => void run("previewProjectBudgetImport")}
        >
          Preview import
        </Button>
        {preview && (
          <section
            aria-label="Project budget import preview"
            className="space-y-3"
          >
            <h3 className="font-medium">Proposed entry changes</h3>
            <p className="text-sm">
              Added {preview.counts.added} · Changed {preview.counts.changed} ·
              Removed {preview.counts.removed} · Unchanged{" "}
              {preview.counts.unchanged}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Current proposal</TableHead>
                  <TableHead>After import</TableHead>
                  <TableHead>Actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, index) => (
                  <TableRow key={`${row.line}-${index}`}>
                    <TableCell className="max-w-xs whitespace-normal">
                      {row.after?.description ?? row.before?.description}
                      <span className="block text-xs text-muted-foreground">
                        {row.systemName}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.kind[0].toUpperCase() + row.kind.slice(1)}
                    </TableCell>
                    {[row.before, row.after].map((record, side) => (
                      <TableCell
                        key={side}
                        className="max-w-xs whitespace-normal"
                      >
                        {record
                          ? Object.entries(record)
                              .filter(([field]) => field !== "description")
                              .map(([field, value]) => (
                                <div key={field}>
                                  {FIELD_LABELS[field] ??
                                    field.replace(/_/g, " ")}
                                  : {previewValue(field, value, row)}
                                </div>
                              ))
                          : "None"}
                      </TableCell>
                    ))}
                    <TableCell>{projectBudgetMoney(row.actualNok)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="font-medium">
              Proposed total after import {projectBudgetMoney(preview.totalNok)}
            </p>
          </section>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !preview ||
              preview.errors.length > 0 ||
              preview.candidateRevision !== budget.revision
            }
            onClick={() => void run("importProjectBudgetEntries")}
          >
            Import into Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
