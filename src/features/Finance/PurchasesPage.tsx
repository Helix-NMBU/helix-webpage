import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Checkbox } from "@libs/components/ui/checkbox";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@libs/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@libs/components/ui/table";
import { Textarea } from "@libs/components/ui/textarea";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import type { BudgetChoiceItem, BudgetChoiceSystem, PurchaseInput, PurchaseLineInput } from "./types";

type UploadState = { uploadId: string; name: string; status: "uploading" | "ready" | "failed" };

function emptyLine(): PurchaseLineInput {
  return { systemId: "", description: "", quantity: "1", amountNok: "", unbudgeted: false };
}

function emptyPurchase(today: string, buyerName: string): PurchaseInput {
  return {
    buyerName,
    supplierName: "",
    paymentMethod: "team_account",
    purchaseDate: today,
    justification: "",
    documentKind: "receipt",
    documentNumber: "",
    invoiceDueDate: "",
    refundAccount: "",
    refundPhone: "",
    lines: [emptyLine()],
    uploadIds: [],
  };
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

export function PurchasesBoard() {
  const session = useFinanceAccess();
  const notify = useNotify();
  const requests = useRequestIds();
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const buyerDefault = "Member Example";
  const [purchase, setPurchase] = useState<PurchaseInput>(() => emptyPurchase(session.today ?? "", buyerDefault));
  const budgetsLoaded = session.budgets?.budgetStatus === "approved";
  const choices = session.budgets?.choices ?? { systems: [], items: [] };
  const systems = choices.systems.filter((row) => row.active);
  const canRegister = Boolean(session.capabilities?.registerActual);

  const itemsBySystem = useMemo(() => {
    const map = new Map<string, BudgetChoiceItem[]>();
    for (const item of choices.items) {
      if (item.status === "cancelled") continue;
      const list = map.get(item.systemId) ?? [];
      list.push(item);
      map.set(item.systemId, list);
    }
    return map;
  }, [choices.items]);

  function updateLine(index: number, patch: Partial<PurchaseLineInput>) {
    setPurchase((current) => {
      const lines = current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line));
      const next = lines[index];
      if (patch.systemId && patch.systemId !== current.lines[index]?.systemId) {
        lines[index] = { ...next, budgetItemId: undefined, unbudgeted: false };
      }
      return { ...current, lines };
    });
  }

  async function uploadFile(file: File) {
    if (uploads.length >= 15) {
      notify("Too many files", "You can attach at most 15 files.", { id: "purchase-files", variant: "error" });
      return;
    }
    const entry: UploadState = { uploadId: "", name: file.name, status: "uploading" };
    setUploads((current) => [...current, entry]);
    try {
      const authorized = await session.mutate({
        action: "authorizeUpload",
        requestId: crypto.randomUUID(),
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
      });
      const uploadId = authorized.id;
      if (!authorized.uploadUrl || !uploadId) throw new Error("Upload authorization failed.");
      const response = await fetch(authorized.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!response.ok) throw new Error("Upload failed.");
      await session.mutate({ action: "finalizeUpload", requestId: crypto.randomUUID(), uploadId });
      setUploads((current) => current.map((row) => (row.name === file.name && row.status === "uploading" ? { uploadId, name: file.name, status: "ready" as const } : row)));
      setPurchase((current) => ({ ...current, uploadIds: [...current.uploadIds, uploadId] }));
      notify("File uploaded", `${file.name} is ready to submit.`, { id: "purchase-upload", variant: "success" });
    } catch (error) {
      setUploads((current) => current.filter((row) => row !== entry));
      notify("Upload failed", error instanceof Error ? error.message : "Try again.", { id: "purchase-upload", variant: "error" });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canRegister) return;
    setSaving(true);
    const payload: PurchaseInput = {
      ...purchase,
      uploadIds: uploads.filter((row) => row.status === "ready").map((row) => row.uploadId),
    };
    try {
      const check = await session.mutate({ action: "checkPurchase", requestId: crypto.randomUUID(), purchase: payload });
      if (check.errors.length) {
        notify("Check the form", check.errors[0]?.message ?? "Fix the highlighted fields.", { id: "purchase-check", variant: "error" });
        return;
      }
      for (const warning of check.warnings) notify("Purchase warning", warning.message, { id: `purchase-warning-${warning.message}`, variant: "warning" });
      const saved = await session.mutate({
        action: "registerPurchase",
        requestId: requests.idFor("register"),
        purchase: payload,
      });
      requests.finish();
      for (const warning of saved.warnings) notify("Purchase saved", warning.message, { id: `purchase-saved-${warning.message}`, variant: "warning" });
      notify("Purchase registered", saved.id ? `Reference saved.` : "Your purchase was saved.", { id: "purchase-saved", variant: "success" });
      setPurchase(emptyPurchase(session.today ?? "", purchase.buyerName));
      setUploads([]);
      await session.loadPage("purchases");
      if (!budgetsLoaded) await session.loadPage("budgets");
    } catch (error) {
      requests.finish();
      notify("Could not register purchase", error instanceof Error ? error.message : "Please try again.", { id: "purchase-save", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const register = session.purchases?.register ?? [];
  const ownRequests = session.purchases?.ownRequests ?? [];

  return (
    <div className="space-y-10">
      {canRegister ? (
        <form className="space-y-6 rounded-lg border p-6" onSubmit={submit}>
          <div>
            <h2 className="text-xl font-medium">Register a purchase</h2>
            <p className="text-sm text-muted-foreground">Line amount is the total in NOK including VAT; quantity is descriptive only.</p>
          </div>
          {!budgetsLoaded ? (
            <p className="text-sm text-muted-foreground">An approved season budget is required before you can register purchases.</p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Buyer name" value={purchase.buyerName} onChange={(value) => setPurchase((current) => ({ ...current, buyerName: value }))} />
            <Field label="Supplier name" value={purchase.supplierName} onChange={(value) => setPurchase((current) => ({ ...current, supplierName: value }))} />
            <Field label="Purchase date" type="date" value={purchase.purchaseDate} onChange={(value) => setPurchase((current) => ({ ...current, purchaseDate: value }))} />
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={purchase.paymentMethod} onValueChange={(value) => setPurchase((current) => ({ ...current, paymentMethod: value as PurchaseInput["paymentMethod"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team_account">Team account</SelectItem>
                  <SelectItem value="outlay">Outlay</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Justification</Label>
              <Textarea value={purchase.justification} onChange={(event) => setPurchase((current) => ({ ...current, justification: event.target.value }))} rows={3} />
            </div>
            {purchase.paymentMethod === "outlay" ? (
              <>
                <Field label="Refund account (11 digits)" value={purchase.refundAccount ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, refundAccount: value, refundPhone: "" }))} />
                <Field label="Refund phone (8 digits)" value={purchase.refundPhone ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, refundPhone: value, refundAccount: "" }))} />
              </>
            ) : null}
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={purchase.documentKind} onValueChange={(value) => setPurchase((current) => ({ ...current, documentKind: value as PurchaseInput["documentKind"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {purchase.documentKind === "invoice" ? (
              <Field label="Invoice due date" type="date" value={purchase.invoiceDueDate ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, invoiceDueDate: value }))} />
            ) : null}
            <Field label="Document number (optional)" value={purchase.documentNumber ?? ""} onChange={(value) => setPurchase((current) => ({ ...current, documentNumber: value }))} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Lines</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setPurchase((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add line</Button>
            </div>
            {purchase.lines.map((line, index) => (
              <LineEditor
                key={index}
                index={index}
                line={line}
                systems={systems}
                items={line.systemId ? itemsBySystem.get(line.systemId) ?? [] : []}
                onChange={(patch) => updateLine(index, patch)}
                onRemove={() => setPurchase((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }))}
                removable={purchase.lines.length > 1}
              />
            ))}
          </div>
          <div className="space-y-3">
            <Label>Supporting files (1 to 15, max 10 MB each)</Label>
            <Input type="file" accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file);
            }} />
            {uploads.length ? (
              <ul className="text-sm text-muted-foreground">
                {uploads.map((file) => <li key={`${file.name}-${file.uploadId}`}>{file.name} — {file.status}</li>)}
              </ul>
            ) : null}
          </div>
          <Button type="submit" disabled={saving || !budgetsLoaded}>{saving ? "Saving…" : "Register purchase"}</Button>
        </form>
      ) : null}
      {ownRequests.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-medium">Your requests</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {ownRequests.map((row) => <TableRow key={row.id}><TableCell>{row.publicRef}</TableCell><TableCell>{row.status}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </section>
      ) : null}
      {register.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-medium">Purchase register</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Supplier</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {register.map((row) => <TableRow key={row.id}><TableCell>{row.publicRef}</TableCell><TableCell>{row.supplierName}</TableCell><TableCell>{row.totalNok}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function LineEditor({
  index,
  line,
  systems,
  items,
  onChange,
  onRemove,
  removable,
}: {
  index: number;
  line: PurchaseLineInput;
  systems: BudgetChoiceSystem[];
  items: BudgetChoiceItem[];
  onChange: (patch: Partial<PurchaseLineInput>) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
      <p className="md:col-span-2 text-sm font-medium">Line {index + 1}</p>
      <div className="space-y-2">
        <Label>System</Label>
        <Select value={line.systemId} onValueChange={(value) => onChange({ systemId: value })}>
          <SelectTrigger><SelectValue placeholder="Choose system" /></SelectTrigger>
          <SelectContent>
            {systems.map((system) => <SelectItem key={system.id} value={system.id}>{system.code} — {system.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Budget item</Label>
        <Select
          value={line.unbudgeted ? "__unbudgeted" : line.budgetItemId ?? ""}
          onValueChange={(value) => onChange(value === "__unbudgeted" ? { unbudgeted: true, budgetItemId: undefined } : { unbudgeted: false, budgetItemId: value })}
          disabled={!line.systemId}
        >
          <SelectTrigger><SelectValue placeholder="Choose item" /></SelectTrigger>
          <SelectContent>
            {items.map((item) => <SelectItem key={item.id} value={item.id}>{item.publicRef} — {item.description}</SelectItem>)}
            <SelectItem value="__unbudgeted">Not in the budget</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Field label="Description" value={line.description} onChange={(value) => onChange({ description: value })} />
      <Field label="Quantity (descriptive)" value={line.quantity} onChange={(value) => onChange({ quantity: value })} />
      <Field label="Line total (NOK)" value={line.amountNok} onChange={(value) => onChange({ amountNok: value })} />
      <div className="flex items-center gap-2 md:col-span-2">
        <Checkbox checked={line.unbudgeted === true} onCheckedChange={(checked) => onChange({ unbudgeted: checked === true, budgetItemId: checked === true ? undefined : line.budgetItemId })} id={`unbudgeted-${index}`} />
        <Label htmlFor={`unbudgeted-${index}`}>Not in the budget</Label>
        {removable ? <Button type="button" variant="ghost" size="sm" onClick={onRemove}>Remove line</Button> : null}
      </div>
    </div>
  );
}
