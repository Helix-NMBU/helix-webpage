import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@libs/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@libs/components/ui/card";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { FinanceContentSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { Switch } from "@libs/components/ui/switch";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { ScenarioList } from "./budget-summary";
import { Badge } from "@libs/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { formatOre, parseNokToOre } from "./money";
import { similarIncomeField } from "./income-receipts";
import { FinanceRequestError } from "./repository";
import {
  FUNDING_CONFIDENCE,
  FUNDING_STATUSES,
  FUNDING_TYPES,
  concurrentFundingRequestMessage,
  deleteWithOtherChangesMessage,
  fundingStatusLabel,
  fundingTypeLabel,
  parseFundingChange,
  statusDeleteHasOtherChanges,
} from "./funding";
import type { FinanceFieldError, FundingPartRecord, FundingRecord, FundingStatus, FundingType } from "./types";

type FundingValues = {
  sourceName: string;
  ownerName: string;
  fundingType: FundingType;
  amountNok: string;
  status: FundingStatus;
  confidence: string;
  expectedDate: string;
  receivedDate: string;
  ownerEmail: string;
  reportingRequired: boolean;
  agreementLink: string;
  note: string;
};

type PartValues = { purpose: string; amountNok: string; spendBy: string; conditions: string };

type Editor =
  | { kind: "funding"; mode: "create" | "edit"; requestId: string; fundingId?: string; expectedRevision?: number; values: FundingValues; errors: Record<string, string> }
  | { kind: "part"; mode: "create" | "edit"; requestId: string; fundingId: string; fundingLabel: string; partId?: string; expectedRevision: number; values: PartValues; errors: Record<string, string> };

const emptyFunding = (): FundingValues => ({
  sourceName: "",
  ownerName: "",
  fundingType: "sponsor_cash",
  amountNok: "",
  status: "applied",
  confidence: "",
  expectedDate: "",
  receivedDate: "",
  ownerEmail: "",
  reportingRequired: false,
  agreementLink: "",
  note: "",
});

function fundingValues(record: FundingRecord): FundingValues {
  return {
    sourceName: record.sourceName,
    ownerName: record.ownerName,
    fundingType: record.fundingType,
    amountNok: record.amountNok,
    status: record.status,
    confidence: record.confidence ?? "",
    expectedDate: record.expectedDate ?? "",
    receivedDate: record.receivedDate ?? "",
    ownerEmail: record.ownerEmail ?? "",
    reportingRequired: record.reportingRequired,
    agreementLink: record.agreementLink ?? "",
    note: record.note ?? "",
  };
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-error`} className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function describedBy(id: string, error?: string) {
  return error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

export function FinancingPage() {
  const session = useFinanceAccess();
  const notify = useNotify();
  const formRef = useRef<HTMLFormElement>(null);
  const seenVersion = useRef<number | null>(null);
  const savedVersion = useRef<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [similarRequest, setSimilarRequest] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const showDeletedId = useId();
  const canEdit = Boolean(session.capabilities?.manageFunding && session.seasonCode);
  const confirmingSimilar = editor?.kind === "funding" && editor.requestId === similarRequest;
  useEffect(() => {
    session.setFormDirty("financing-editor", editor !== null);
    return () => session.setFormDirty("financing-editor", false);
  }, [editor, session.setFormDirty]);
  const records = session.financing?.funding ?? [];
  const active = records.filter(record => record.status !== "deleted");
  const visible = records.filter(record => (showDeleted || record.status !== "deleted")
    && (statusFilter === "all" || record.status === statusFilter)
    && [record.sourceName, record.ownerName, record.publicRef, fundingTypeLabel(record.fundingType)].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const selectedRecord = records.find(record => record.id === selectedId);
  const totalFor = (statuses: FundingStatus[]) => `${formatOre(active.filter(record => statuses.includes(record.status)).reduce((sum, record) => sum + (parseNokToOre(record.amountNok) ?? 0n), 0n))} NOK`;
  function rememberFocus(target: HTMLElement) { returnFocus.current = target; }
  const partsFor = (fundingId: string) => session.financing?.parts.filter((part) => part.fundingId === fundingId) ?? [];

  useEffect(() => {
    const version = session.financing?.viewVersion ?? null;
    if (version === null) return;
    if (seenVersion.current === null || version === savedVersion.current) {
      seenVersion.current = version;
      return;
    }
    if (seenVersion.current !== version) {
      seenVersion.current = version;
      if (editor) {
        notify("Financing was updated", "Your unsaved changes are still in the form.", {
          id: "financing-updated",
          variant: "info",
          href: null,
          action: { label: "Discard changes", onClick: () => setEditor(null) },
        });
      }
    }
  }, [editor, notify, session.financing?.viewVersion]);

  function focusErrors(errors: FinanceFieldError[]) {
    const next: Record<string, string> = {};
    for (const error of errors) next[error.field] = error.message;
    setEditor((current) => current ? { ...current, errors: next } : current);
    queueMicrotask(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
  }

  async function showSavedFinancing(error: unknown): Promise<boolean> {
    if (!(error instanceof FinanceRequestError) || error.status !== 409 || error.message !== concurrentFundingRequestMessage) return false;
    setEditor(null);
    await session.loadPage("financing");
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || saving) return;
    const body = editor.kind === "funding" ? fundingBody(editor) : partBody(editor);
    const parsed = parseFundingChange(body);
    if (!parsed.ok) {
      focusErrors(parsed.errors);
      notify("Could not save financing", parsed.errors.length === 1 ? parsed.errors[0].message : "Check the highlighted fields.", {
        id: "financing-invalid",
        variant: "error",
        href: null,
        action: { label: "Review fields", onClick: () => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus() },
      });
      return;
    }
    if (editor.kind === "funding" && editor.mode === "edit") {
      const record = records.find((item) => item.id === editor.fundingId);
      if (record && statusDeleteHasOtherChanges(fundingValues(record), editor.values)) {
        focusErrors([{ field: "status", message: deleteWithOtherChangesMessage }]);
        notify("Could not save financing", deleteWithOtherChangesMessage, {
          id: "financing-delete-with-changes",
          variant: "error",
          href: null,
          action: { label: "Review fields", onClick: () => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus() },
        });
        return;
      }
    }
    setSaving(true);
    try {
      const result = await session.mutate(confirmingSimilar ? { ...body, [similarIncomeField]: true } : body);
      savedVersion.current = result.viewVersion;
      setEditor(null);
      const warning = result.warnings.map((item) => item.message).join(" ");
      notify(editor.kind === "funding" ? "Funding saved" : "Earmarked part saved", warning || "The financing view will refresh.", {
        id: "financing-saved",
        variant: warning ? "warning" : "success",
        href: null,
      });
      await session.loadPage("financing");
    } catch (error) {
      if (await showSavedFinancing(error)) return;
      const fieldErrors = error instanceof FinanceRequestError ? error.errors ?? [] : [];
      if (editor.kind === "funding" && fieldErrors.some(issue => issue.field === similarIncomeField)) {
        setSimilarRequest(editor.requestId);
        notify("Possible duplicate payment", error instanceof Error ? error.message : "Review the registered payment before continuing.", {
          id: "financing-similar-income", variant: "warning", href: null,
          action: { label: "Review fields", onClick: () => formRef.current?.querySelector<HTMLInputElement>("#funding-source")?.focus() },
        });
        return;
      }
      if (fieldErrors.length) focusErrors(fieldErrors);
      notify("Could not save financing", error instanceof Error ? error.message : "Please try again.", {
        id: "financing-save-failed",
        variant: "error",
        href: null,
        action: { label: "Try again", onClick: () => formRef.current?.requestSubmit() },
      });
    } finally {
      setSaving(false);
    }
  }

  async function runStatus(record: FundingRecord, action: "deleteFunding" | "restoreFunding", requestId = crypto.randomUUID(), confirmed = false) {
    if (saving) return;
    setSaving(true);
    try {
      const result = await session.mutate({ action, requestId, fundingId: record.id, expectedRevision: record.revision, ...(confirmed ? { [similarIncomeField]: true } : {}) });
      savedVersion.current = result.viewVersion;
      const warning = result.warnings.map((item) => item.message).join(" ");
      notify(action === "deleteFunding" ? "Funding deleted" : "Funding restored", warning || (action === "deleteFunding" ? "Show deleted funding to see the record." : "The previous status was restored."), {
        id: `financing-${action}`,
        variant: warning ? "warning" : "success",
        href: null,
        action: action === "deleteFunding" ? { label: "Show deleted", onClick: () => setShowDeleted(true) } : undefined,
      });
      await session.loadPage("financing");
    } catch (error) {
      if (await showSavedFinancing(error)) return;
      if (action === "restoreFunding" && error instanceof FinanceRequestError && error.errors.some(issue => issue.field === similarIncomeField)) {
        notify("Possible duplicate payment", error.message, {
          id: "financing-restore-similar-income", variant: "warning", href: null,
          action: { label: "Restore anyway", onClick: () => { void runStatus(record, action, requestId, true); } },
        });
        return;
      }
      notify(action === "deleteFunding" ? "Could not delete funding" : "Could not restore funding", error instanceof Error ? error.message : "Please try again.", {
        id: `financing-${action}-failed`,
        variant: "error",
        href: null,
        action: { label: "Reload", onClick: () => { void session.loadPage("financing"); } },
      });
    } finally {
      setSaving(false);
    }
  }

  if (!session.financing && session.pageLoading) {
    return (
      <FinanceContentSkeleton page="financing" label="Loading financing" />
    );
  }

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-3">
        {([
          ["Received", totalFor(["received"]), "Money received this season"],
          ["Awaiting payment", totalFor(["secured"]), "Confirmed funding still to arrive"],
          ["Potential funding", totalFor(["prospect", "applied"]), "Prospects and applications"],
        ] as const).map(([label, value, description]) => <div key={label} className="rounded-xl border bg-card p-5">
          <dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd><dd className="mt-1 text-sm text-muted-foreground">{description}</dd>
        </div>)}
      </dl>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-lg font-semibold">Funding sources</h2><p className="text-sm text-muted-foreground">Track payments and open a source to manage its details or earmarked funds.</p></div>
        {canEdit ? <Button type="button" onClick={event => { rememberFocus(event.currentTarget); setEditor({ kind: "funding", mode: "create", requestId: crypto.randomUUID(), values: emptyFunding(), errors: {} }); }} disabled={editor !== null || saving}>Add funding</Button> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search funding" placeholder="Search sources or owners…" className="sm:max-w-xs" value={query} onChange={event => setQuery(event.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="Filter funding by status" className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{FUNDING_STATUSES.filter(status => status !== "deleted").map(status => <SelectItem key={status} value={status}>{fundingStatusLabel(status)}</SelectItem>)}</SelectContent></Select>
        <div className="flex items-center gap-2 sm:ml-auto"><Switch id={showDeletedId} checked={showDeleted} onCheckedChange={setShowDeleted} /><Label htmlFor={showDeletedId}>Show deleted funding</Label></div>
      </div>
      <Dialog open={Boolean(editor || selectedRecord)} onOpenChange={open => { if (!open && !saving) { setEditor(null); setSelectedId(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" onPointerDownOutside={event => { if (editor) event.preventDefault(); }} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}>
          <DialogHeader><DialogTitle>{editor ? editor.kind === "funding" ? editor.mode === "create" ? "Add funding" : "Edit funding" : editor.mode === "create" ? "Add earmarked part" : "Edit earmarked part" : selectedRecord?.sourceName}</DialogTitle><DialogDescription>{editor ? "Save your changes or cancel to return to the funding source." : "Funding details, payment dates and earmarked funds."}</DialogDescription></DialogHeader>
          {editor ? <EditorForm editor={editor} saving={saving} confirmingSimilar={confirmingSimilar} formRef={formRef} onSubmit={submit}
            onChange={next => { setSimilarRequest(null); setEditor(next); }} onCancel={() => setEditor(null)} /> : selectedRecord ? <FundingCard
            record={selectedRecord} parts={partsFor(selectedRecord.id)} canEdit={canEdit && !saving}
            onEdit={() => setEditor({ kind: "funding", mode: "edit", requestId: crypto.randomUUID(), fundingId: selectedRecord.id, expectedRevision: selectedRecord.revision, values: fundingValues(selectedRecord), errors: {} })}
            onAddPart={() => setEditor({ kind: "part", mode: "create", requestId: crypto.randomUUID(), fundingId: selectedRecord.id, fundingLabel: selectedRecord.sourceName, expectedRevision: selectedRecord.revision, values: { purpose: "", amountNok: "", spendBy: "", conditions: "" }, errors: {} })}
            onEditPart={part => setEditor({ kind: "part", mode: "edit", requestId: crypto.randomUUID(), fundingId: selectedRecord.id, fundingLabel: selectedRecord.sourceName, partId: part.id, expectedRevision: part.revision, values: { purpose: part.purpose, amountNok: part.amountNok, spendBy: part.spendBy ?? "", conditions: part.conditions ?? "" }, errors: {} })}
            onDelete={() => { void runStatus(selectedRecord, "deleteFunding"); setSelectedId(null); }}
            onRestore={() => { void runStatus(selectedRecord, "restoreFunding"); setSelectedId(null); }}
          /> : null}
        </DialogContent>
      </Dialog>
      {visible.length === 0 ? (
        <Empty className="min-h-72 border border-solid">
          <EmptyHeader>
            <EmptyTitle>{query || statusFilter !== "all" ? "No matching funding" : records.length > 0 ? "Deleted funding is hidden" : "No funding records yet"}</EmptyTitle>
            <EmptyDescription>
              {query || statusFilter !== "all" ? "Try another search or clear the filters." : session.seasonCode ? `Season ${session.seasonCode} ${records.length > 0 ? "has deleted funding you can reveal." : "has no funding yet. Funding can be recorded before a budget exists."}` : "An operator has not configured the current season."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table aria-label="Funding sources"><TableHeader><TableRow>
            <TableHead className="pl-4">Source</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="hidden text-right lg:table-cell">Earmarked</TableHead><TableHead className="hidden md:table-cell">Expected / received</TableHead><TableHead className="hidden lg:table-cell">Owner</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow></TableHeader><TableBody>{visible.map(record => <TableRow key={record.id}>
            <TableCell className="py-4 pl-4"><div className="font-medium">{record.sourceName}</div><div className="mt-1 text-xs text-muted-foreground">{fundingTypeLabel(record.fundingType)} · {record.publicRef}</div></TableCell>
            <TableCell><Badge variant={record.status === "received" ? "default" : record.status === "rejected" || record.status === "deleted" ? "outline" : "secondary"}>{fundingStatusLabel(record.status)}</Badge></TableCell>
            <TableCell className="text-right tabular-nums">{record.amountNok} NOK</TableCell><TableCell className="hidden text-right tabular-nums lg:table-cell">{record.earmarkedNok} NOK</TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">{record.receivedDate ?? record.expectedDate ?? "No date set"}</TableCell><TableCell className="hidden lg:table-cell">{record.ownerName}</TableCell>
            <TableCell className="text-right"><Button type="button" size="sm" variant="ghost" aria-label={`View funding from ${record.sourceName}`} onClick={event => { rememberFocus(event.currentTarget); setSelectedId(record.id); }}>View funding</Button></TableCell>
          </TableRow>)}</TableBody></Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "source" : "sources"}</p>
        </div>
      )}
      {session.financing && session.financing.scenarios.length > 0 ? <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Funding scenarios</summary><div className="pt-4"><ScenarioList scenarios={session.financing.scenarios} /></div></details> : null}
    </div>
  );
}

function fundingBody(editor: Extract<Editor, { kind: "funding" }>): Record<string, unknown> {
  const funding = {
    ...editor.values,
    confidence: editor.values.confidence || null,
    expectedDate: editor.values.expectedDate || null,
    receivedDate: editor.values.receivedDate || null,
    ownerEmail: editor.values.ownerEmail || null,
    agreementLink: editor.values.agreementLink || null,
    note: editor.values.note || null,
  };
  if (editor.mode === "create") return { action: "addFunding", requestId: editor.requestId, funding };
  return { action: "editFunding", requestId: editor.requestId, fundingId: editor.fundingId, expectedRevision: editor.expectedRevision, patch: funding };
}

function partBody(editor: Extract<Editor, { kind: "part" }>): Record<string, unknown> {
  const part = { fundingId: editor.fundingId, purpose: editor.values.purpose, amountNok: editor.values.amountNok, spendBy: editor.values.spendBy || null, conditions: editor.values.conditions || null };
  if (editor.mode === "create") return { action: "addEarmark", requestId: editor.requestId, expectedRevision: editor.expectedRevision, part };
  return { action: "editEarmark", requestId: editor.requestId, partId: editor.partId, expectedRevision: editor.expectedRevision, patch: { purpose: part.purpose, amountNok: part.amountNok, spendBy: part.spendBy, conditions: part.conditions } };
}

function EditorForm({ editor, saving, confirmingSimilar, formRef, onSubmit, onChange, onCancel }: {
  editor: Editor;
  saving: boolean;
  confirmingSimilar: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (editor: Editor) => void;
  onCancel: () => void;
}) {

  useEffect(() => { formRef.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [formRef]);
  return (
    <Card className="border-0 py-0 shadow-none ring-0">
      <CardHeader className="px-0">
        <CardDescription>
          {editor.kind === "part" ? `This part stays with ${editor.fundingLabel}. Parts are not deleted from here.` : "Record the amount, payment status and person responsible."}
        </CardDescription>
      </CardHeader>
      <form ref={formRef} onSubmit={onSubmit} autoComplete="off">
        <CardContent className="px-0">
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            {editor.kind === "funding" ? <FundingFields editor={editor} onChange={onChange} /> : <PartFields editor={editor} onChange={onChange} />}
          </fieldset>
        </CardContent>
        <CardFooter className="mt-6 flex flex-wrap gap-2 px-0">
          <Button type="submit" disabled={saving} aria-busy={saving}>{confirmingSimilar ? "Save anyway" : editor.kind === "funding" ? "Save funding" : "Save part"}</Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function FundingFields({ editor, onChange }: { editor: Extract<Editor, { kind: "funding" }>; onChange: (editor: Editor) => void }) {
  const values = editor.values;
  const error = editor.errors;
  function set<K extends keyof FundingValues>(key: K, value: FundingValues[K]) {
    onChange({ ...editor, values: { ...values, [key]: value } });
  }
  return (
    <>
      <Field id="funding-source" label="Source" error={error.sourceName}>
        <Input id="funding-source" value={values.sourceName} onChange={(event) => set("sourceName", event.target.value)} {...describedBy("funding-source", error.sourceName)} />
      </Field>
      <Field id="funding-owner" label="Owner" error={error.ownerName}>
        <Input id="funding-owner" value={values.ownerName} onChange={(event) => set("ownerName", event.target.value)} {...describedBy("funding-owner", error.ownerName)} />
      </Field>
      <Field id="funding-type" label="Type" error={error.fundingType}>
        <Select value={values.fundingType} onValueChange={(value) => set("fundingType", value as FundingType)}>
          <SelectTrigger id="funding-type" className="w-full" {...describedBy("funding-type", error.fundingType)}><SelectValue /></SelectTrigger>
          <SelectContent>{FUNDING_TYPES.map((type) => <SelectItem key={type} value={type}>{fundingTypeLabel(type)}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field id="funding-amount" label="Amount (NOK)" error={error.amountNok}>
        <Input id="funding-amount" inputMode="decimal" value={values.amountNok} onChange={(event) => set("amountNok", event.target.value)} {...describedBy("funding-amount", error.amountNok)} />
      </Field>
      <Field id="funding-status" label="Status" error={error.status}>
        <Select value={values.status} onValueChange={(value) => set("status", value as FundingStatus)}>
          <SelectTrigger id="funding-status" className="w-full" {...describedBy("funding-status", error.status)}><SelectValue /></SelectTrigger>
          <SelectContent>{FUNDING_STATUSES.map((status) => <SelectItem key={status} value={status}>{fundingStatusLabel(status)}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {values.status !== "received" || error.expectedDate ? <Field id="funding-expected" label="Expected date" error={error.expectedDate}>
        <Input id="funding-expected" type="date" value={values.expectedDate} onChange={(event) => set("expectedDate", event.target.value)} {...describedBy("funding-expected", error.expectedDate)} />
      </Field> : null}
      {values.status === "received" || error.receivedDate ? <Field id="funding-received" label="Received date" error={error.receivedDate}>
        <Input id="funding-received" type="date" value={values.receivedDate} onChange={(event) => set("receivedDate", event.target.value)} {...describedBy("funding-received", error.receivedDate)} />
      </Field> : null}
      <details className="rounded-lg border p-4 sm:col-span-2" open={["confidence", "ownerEmail", "agreementLink", "note"].some(key => error[key]) ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">Additional details</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="funding-confidence" label="Confidence" error={error.confidence}>
            <Select value={values.confidence || "none"} onValueChange={(value) => set("confidence", value === "none" ? "" : value)}>
              <SelectTrigger id="funding-confidence" className="w-full" {...describedBy("funding-confidence", error.confidence)}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {FUNDING_CONFIDENCE.map((confidence) => <SelectItem key={confidence} value={confidence}>{fundingStatusLabel(confidence)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field id="funding-email" label="Owner email" error={error.ownerEmail}>
            <Input id="funding-email" type="email" value={values.ownerEmail} onChange={(event) => set("ownerEmail", event.target.value)} {...describedBy("funding-email", error.ownerEmail)} />
          </Field>
          <Field id="funding-link" label="Agreement link" error={error.agreementLink}>
            <Input id="funding-link" type="url" value={values.agreementLink} onChange={(event) => set("agreementLink", event.target.value)} {...describedBy("funding-link", error.agreementLink)} />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Checkbox id="funding-reporting" checked={values.reportingRequired} onCheckedChange={(checked) => set("reportingRequired", checked === true)} />
            <Label htmlFor="funding-reporting">Reporting required</Label>
          </div>
          <div className="sm:col-span-2">
            <Field id="funding-note" label="Note" error={error.note}>
              <Textarea id="funding-note" value={values.note} onChange={(event) => set("note", event.target.value)} {...describedBy("funding-note", error.note)} />
            </Field>
          </div>
        </div>
      </details>
    </>
  );
}

function PartFields({ editor, onChange }: { editor: Extract<Editor, { kind: "part" }>; onChange: (editor: Editor) => void }) {
  const values = editor.values;
  const error = editor.errors;
  function set<K extends keyof PartValues>(key: K, value: string) {
    onChange({ ...editor, values: { ...values, [key]: value } });
  }
  return (
    <>
      <div className="sm:col-span-2">
        <Field id="part-purpose" label="Purpose" error={error.purpose}>
          <Input id="part-purpose" value={values.purpose} onChange={(event) => set("purpose", event.target.value)} {...describedBy("part-purpose", error.purpose)} />
        </Field>
      </div>
      <Field id="part-amount" label="Amount (NOK)" error={error.amountNok}>
        <Input id="part-amount" inputMode="decimal" value={values.amountNok} onChange={(event) => set("amountNok", event.target.value)} {...describedBy("part-amount", error.amountNok)} />
      </Field>
      <Field id="part-spend-by" label="Spend by" error={error.spendBy}>
        <Input id="part-spend-by" type="date" value={values.spendBy} onChange={(event) => set("spendBy", event.target.value)} {...describedBy("part-spend-by", error.spendBy)} />
      </Field>
      <div className="sm:col-span-2">
        <Field id="part-conditions" label="Conditions" error={error.conditions}>
          <Textarea id="part-conditions" value={values.conditions} onChange={(event) => set("conditions", event.target.value)} {...describedBy("part-conditions", error.conditions)} />
        </Field>
      </div>
    </>
  );
}

function FundingCard({ record, parts, canEdit, onEdit, onAddPart, onEditPart, onDelete, onRestore }: {
  record: FundingRecord;
  parts: FundingPartRecord[];
  canEdit: boolean;
  onEdit: () => void;
  onAddPart: () => void;
  onEditPart: (part: FundingPartRecord) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const negative = record.unrestrictedNok.startsWith("-");
  return (
    <Card>
      <CardHeader>
        <CardDescription>{record.publicRef} · {fundingTypeLabel(record.fundingType)} · {fundingStatusLabel(record.status)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Amount</dt><dd>{record.amountNok} NOK</dd></div>
          <div><dt className="text-muted-foreground">Earmarked</dt><dd>{record.earmarkedNok} NOK</dd></div>
          <div><dt className="text-muted-foreground">Unrestricted remainder</dt><dd>{record.unrestrictedNok} NOK{negative ? ". Unrestricted remainder is negative." : ""}</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd>{record.ownerName}{record.ownerEmail ? ` · ${record.ownerEmail}` : ""}</dd></div>
          <div><dt className="text-muted-foreground">Confidence</dt><dd>{record.confidence ? fundingStatusLabel(record.confidence) : "None"}</dd></div>
          <div><dt className="text-muted-foreground">Reporting required</dt><dd>{record.reportingRequired ? "Yes" : "No"}</dd></div>
          <div><dt className="text-muted-foreground">Expected date</dt><dd>{record.expectedDate ?? "None"}</dd></div>
          <div><dt className="text-muted-foreground">Received date</dt><dd>{record.receivedDate ?? "None"}</dd></div>
        </dl>
        {record.agreementLink ? <p><a className="underline" href={record.agreementLink}>Agreement</a></p> : null}
        {record.note ? <p>{record.note}</p> : null}
        {record.linkedItemCount > 0 ? <p>Pays for {record.linkedItemCount} budget {record.linkedItemCount === 1 ? "item that is not cancelled" : "items that are not cancelled"}.</p> : null}
        <div className="space-y-3">
          <h2 className="font-medium">Earmarked parts</h2>
          {parts.length === 0 ? <p className="text-muted-foreground">No earmarked parts yet.</p> : parts.map((part) => (
            <div key={part.id} className="space-y-1 border-t pt-3">
              <p className="font-medium">{part.purpose}</p>
              <p className="text-muted-foreground">{part.publicRef} · {part.amountNok} NOK · Used {part.usedNok} · Left {part.leftNok}</p>
              <p>{part.systemName ? `System ${part.systemName}` : "Unassigned"}{part.spendBy ? ` · Spend by ${part.spendBy}` : ""}{part.overdue ? ` · Must return ${part.mustReturnNok} NOK` : ""}</p>
              {part.conditions ? <p>Conditions: {part.conditions}</p> : null}
              {part.linkedItems.length > 0 ? (
                <ul className="list-disc pl-5">
                  {part.linkedItems.map((item) => <li key={item.id}>{item.description} ({item.publicRef})</li>)}
                </ul>
              ) : <p className="text-muted-foreground">No budget items linked yet.</p>}
              {canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => onEditPart(part)}>Edit part</Button> : null}
            </div>
          ))}
        </div>
      </CardContent>
      {canEdit ? (
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>Edit funding</Button>
          <Button type="button" variant="outline" onClick={onAddPart}>Add earmarked part</Button>
          {record.status === "deleted"
            ? <Button type="button" variant="outline" onClick={onRestore}>Restore funding</Button>
            : <Button type="button" variant="outline" onClick={onDelete}>Delete funding</Button>}
        </CardFooter>
      ) : null}
    </Card>
  );
}
