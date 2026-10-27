import { useEffect, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { BudgetImportPreview, PublicDepartmentBudget } from "./types";

export function BudgetImport({ departments }: { departments: PublicDepartmentBudget[] }) {
  const session = useFinanceAccess();
  const notify = useNotify();
  const [department, setDepartment] = useState("");
  const [csv, setCsv] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<BudgetImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const setDirty = session.setFormDirty;
  useEffect(() => { setDirty?.("budget-import", Boolean(csv)); return () => setDirty?.("budget-import", false); }, [csv, setDirty]);
  function fail(error: unknown) {
    notify("Could not import the budget", error instanceof Error ? error.message : "Please try again.", { id: "budget-import", variant: "error" });
  }
  async function previewImport() {
    if (!department || !csv.trim()) { fail(new Error("Choose a department and enter CSV text.")); return; }
    setBusy(true);
    try {
      const result = await session.mutate({ action: "previewImport", requestId: crypto.randomUUID(), departmentKey: department, csv });
      if (!result.importPreview) throw new Error("The preview could not be prepared.");
      setPreview(result.importPreview);
      if (result.importPreview.errors.length) notify("Check the CSV", "Correct the listed rows and preview again.", { id: "budget-import", variant: "error" });
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function applyImport() {
    if (!preview || preview.errors.length || preview.departmentKey !== department) return;
    const key = JSON.stringify({ department, csv, reason, version: preview.viewVersion });
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    try {
      await session.mutate({ action: "importItems", requestId: pending.current.id, departmentKey: department, csv, reason, expectedRevision: preview.viewVersion, previewToken: preview.previewToken });
      pending.current = null; setPreview(null); setCsv(""); setReason("");
      notify("Budget imported", "The department budget was updated.", { id: "budget-import", variant: "success" });
      await session.loadPage("budgets");
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  return (
    <section className="space-y-4" aria-labelledby="budget-import-heading">
      <h2 id="budget-import-heading" className="text-lg font-medium">Import department budget</h2>
      <p className="text-sm text-muted-foreground">Import replaces the department's ordinary budget items. Descriptions identify items; changing one can add a new item and cancel the old one.</p>
      <div className="grid max-w-xl gap-3">
        <Label htmlFor="budget-import-department">Department</Label>
        <Select value={department || undefined} onValueChange={(value) => { setDepartment(value); setPreview(null); }}>
          <SelectTrigger id="budget-import-department"><SelectValue placeholder="Choose a department" /></SelectTrigger>
          <SelectContent>{departments.map((item) => <SelectItem key={item.departmentKey} value={item.departmentKey}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
        <Label htmlFor="budget-import-file">CSV file</Label>
        <Input id="budget-import-file" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 1_500_000) { fail(new Error("The CSV is too large.")); return; }
          void file.text().then((text) => { setCsv(text); setPreview(null); }).catch(fail);
        }} />
        <Label htmlFor="budget-import-csv">CSV text</Label>
        <Textarea id="budget-import-csv" rows={7} value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} placeholder="system_id;description;planned_nok;priority;category;reuse_status;expected_purchase_date;note;earmark_id" />
        <Button type="button" className="justify-self-start" disabled={busy} onClick={() => void previewImport()}>Preview import</Button>
      </div>
      {preview ? (
        <div className="space-y-4">
          <p>Added {preview.counts.added} · Changed {preview.counts.changed} · Unchanged {preview.counts.unchanged} · Removed {preview.counts.removed}</p>
          {preview.errors.length ? <div><h3 className="font-medium">Rows to correct</h3><ul className="list-disc pl-5">{preview.errors.map((error, index) => <li key={`${error.field}-${index}`}>{error.message}</li>)}</ul></div> : null}
          <ul className="list-disc pl-5 text-sm text-muted-foreground">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
          <Table><TableHeader><TableRow><TableHead>System</TableHead><TableHead>Item</TableHead><TableHead>Change</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead><TableHead>Actual</TableHead></TableRow></TableHeader>
            <TableBody>{preview.rows.map((row, index) => <TableRow key={`${row.systemCode}-${row.line ?? `removed-${index}`}`}>
              <TableCell>{row.systemName} ({row.systemCode})</TableCell><TableCell>{row.after?.description ?? row.before?.description}</TableCell><TableCell>{row.kind}</TableCell>
              <TableCell>{row.before ? Object.entries(row.before).map(([field, value]) => <div key={field}>{field}: {value ?? "—"}</div>) : "—"}</TableCell>
              <TableCell>{row.after ? Object.entries(row.after).map(([field, value]) => <div key={field}>{field}: {value ?? "—"}</div>) : "—"}</TableCell><TableCell>{row.actualNok}</TableCell>
            </TableRow>)}</TableBody></Table>
          <div><h3 className="font-medium">Planned totals</h3>{preview.subtotals.map((item) => <p key={item.systemCode}>{item.systemName}: {item.plannedNok} NOK</p>)}<p>Total: {preview.totalNok} NOK</p></div>
          <div className="grid max-w-xl gap-2"><Label htmlFor="budget-import-reason">Reason for approved budget changes</Label><Input id="budget-import-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button type="button" className="justify-self-start" disabled={busy || preview.errors.length > 0} onClick={() => void applyImport()}>Import budget</Button></div>
        </div>
      ) : null}
    </section>
  );
}
