import { useRef, useState, type FormEvent } from "react";
import { IconDots } from "@tabler/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@libs/components/ui/dropdown-menu";
import { Button } from "@libs/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@libs/components/ui/dialog";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
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
  function openEditor() {
    openingDialog.current = true;
    setEditingRevision(row.revision);
    setUrl(currentUrl);
    setOpen(true);
  }
  if (!currentUrl && !editable) return <span className="text-xs text-muted-foreground">Invoice not found</span>;
  return <>
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild><Button ref={trigger} type="button" variant="ghost" size="icon" aria-label={`Purchase actions for ${row.publicRef}`} disabled={busy}><IconDots className="size-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (openingDialog.current) { event.preventDefault(); openingDialog.current = false; } }}>
        {currentUrl && <InvoiceLinks menuItem invoices={invoices} actions={actions} onChanged={onChanged} onAccessEnded={onAccessEnded} onOpened={() => setMenuOpen(false)} />}
        {editable && <DropdownMenuItem onSelect={() => openEditor()}>{currentUrl ? "Edit link" : "Link to invoice"}</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
    <DialogContent className="sm:max-w-md" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}><DialogHeader><DialogTitle>{currentUrl ? "Edit invoice link" : "Link to invoice"}</DialogTitle><DialogDescription>{currentUrl ? "Replace" : "Paste"} the Google Drive file link for purchase {row.publicRef}. The file keeps its existing sharing permissions.</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={event => void save(event)} noValidate>
        <div className="space-y-2"><Label htmlFor={`invoice-url-${row.id}`}>Google Drive file link</Label><Input id={`invoice-url-${row.id}`} type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://drive.google.com/file/d/…/view" disabled={busy} /></div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={busy}>Cancel</Button></DialogClose><Button type="submit" disabled={busy || !url.trim() || url.trim() === currentUrl}>Save link</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  </>;
}
