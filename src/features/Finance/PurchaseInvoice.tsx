import { useState, type FormEvent } from "react";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Label } from "@libs/components/ui/label";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { confirmedDriveUrl, InvoiceLinks } from "./InvoiceEvidence";
import { normalizeInvoiceDriveUrl } from "./invoice-link";
import type { InvoiceEvidenceActions } from "./invoice-repository";
import { purchaseInvoiceReferences, type PurchaseActionRunner } from "./purchase-presentation";
import type { FinancePurchaseSummary } from "./types";

type Props = { row: FinancePurchaseSummary; canLink: boolean; busy: boolean; onRun: PurchaseActionRunner; actions: InvoiceEvidenceActions; onChanged: () => Promise<void>; onAccessEnded: () => void };
export function PurchaseInvoice({ row, canLink, busy, onRun, actions, onChanged, onAccessEnded }: Props) {
  const [open, setOpen] = useState(false), [url, setUrl] = useState("");
  const [editingRevision, setEditingRevision] = useState(row.revision);
  const notify = useNotify();
  const invoices = purchaseInvoiceReferences(row);
  const currentUrl = invoices.find(invoice => invoice.documentId.startsWith("purchase:") && confirmedDriveUrl(invoice))?.viewerUrl ?? invoices.map(confirmedDriveUrl).find(Boolean) ?? "";
  const editable = canLink && row.status === "registered";
  async function save(event: FormEvent) {
    event.preventDefault();
    let viewerUrl: string;
    try { viewerUrl = normalizeInvoiceDriveUrl(url); } catch(error) { notify("Check invoice link", (error as Error).message, { variant: "error", href: null }); return; }
    if (await onRun(`link-invoice-${row.id}`, `${editingRevision}:${viewerUrl}`, { action: "linkPurchaseInvoice", requestId: "", purchaseId: row.id, expectedRevision: editingRevision, viewerUrl }, currentUrl ? "Invoice link updated" : "Invoice linked", "Could not save invoice link")) { setOpen(false); setUrl(""); }
  }
  if (!editable) return currentUrl ? <InvoiceLinks invoices={invoices} actions={actions} onChanged={onChanged} onAccessEnded={onAccessEnded} /> : <span className="text-xs text-muted-foreground">Invoice not found</span>;
  return <Dialog open={open} onOpenChange={value => { if (!busy) { if (value) { setUrl(currentUrl); setEditingRevision(row.revision); } setOpen(value); } }}>
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {currentUrl && <InvoiceLinks invoices={invoices} actions={actions} onChanged={onChanged} onAccessEnded={onAccessEnded} />}
      <DialogTrigger asChild><button type="button" disabled={busy} className="rounded-sm text-xs font-medium text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{currentUrl ? "Edit link" : "Link to invoice"}</button></DialogTrigger>
    </span>
    <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{currentUrl ? "Edit invoice link" : "Link to invoice"}</DialogTitle><DialogDescription>{currentUrl ? "Replace" : "Paste"} the Google Drive file link for purchase {row.publicRef}. The file keeps its existing sharing permissions.</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={event => void save(event)} noValidate>
        <div className="space-y-2"><Label htmlFor={`invoice-url-${row.id}`}>Google Drive file link</Label><Input id={`invoice-url-${row.id}`} type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://drive.google.com/file/d/…/view" disabled={busy} /></div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={busy}>Cancel</Button></DialogClose><Button type="submit" disabled={busy || !url.trim() || url.trim() === currentUrl}>Save link</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
