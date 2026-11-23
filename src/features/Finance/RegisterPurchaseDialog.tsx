import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { IconChevronDown, IconCube, IconX } from '@tabler/icons-react';
import { Button } from '@libs/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@libs/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@libs/components/ui/dialog';
import { Input } from '@libs/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@libs/components/ui/input-group';
import { Label } from '@libs/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libs/components/ui/select';
import { Textarea } from '@libs/components/ui/textarea';
import { useMemberAccount } from '../MemberPlatform/MemberAccountContext';
import { useNotify } from '../MemberPlatform/MemberNotifications';
import { formatOre, osloToday, parseNokToOre } from './money';
import { normalizePurchaseInput } from './purchase-domain';
import { allocatePurchaseLines, type PurchaseLineDraft } from './purchase-allocation';
import { ProjectBudgetEntries } from './ProjectBudgetEntries';
import { managementPurchaseRepository, type ManagementPurchaseRepository } from './management-purchase-repository';
import type { ManagementPurchaseChoices } from './management-purchase-types';
import type { PurchaseInput, PurchaseLineInput } from './types';

const emptyLine = (): PurchaseLineDraft => ({ projectId: null, systemId: '', budgetItemId: null, budgetEntries: [], unbudgeted: true, description: '', quantity: '1', amountNok: '' });
const emptyPurchase = (buyerName: string): Omit<PurchaseInput, 'lines'> & { lines: PurchaseLineDraft[] } => ({ buyerName, supplierName: '', purchaseDate: osloToday(), paymentMethod: 'team_account', justification: '', documentKind: 'receipt', documentNumber: '', invoiceDueDate: '', refundAccount: '', refundPhone: '', lines: [emptyLine()], uploadIds: [] });
type Evidence = { key: string; name: string; uploadId: string | null; pending: boolean };
type DetailField = keyof Pick<PurchaseInput, 'buyerName' | 'supplierName' | 'purchaseDate' | 'documentNumber' | 'invoiceDueDate'>;

function OptionalSection({ title, summary, open, onOpenChange, disabled, children }: {
  title: string; summary?: string; open: boolean; onOpenChange: (open: boolean) => void; disabled: boolean; children: ReactNode;
}) {
  return <Collapsible open={open} onOpenChange={onOpenChange} className="group/disclosure border-t">
    <CollapsibleTrigger asChild>
      <Button type="button" variant="ghost" disabled={disabled} className="h-auto w-full justify-between gap-3 rounded-none px-0 py-2.5 text-left font-normal hover:bg-transparent">
        <span>{title}</span>
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          {summary && <span className="truncate text-xs">{summary}</span>}
          <IconChevronDown aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-data-[state=open]/disclosure:rotate-180" />
        </span>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-4 pb-4 pt-1">{children}</CollapsibleContent>
  </Collapsible>;
}

export function RegisterPurchaseDialog({ children, repository: supplied }: { children: ReactNode; repository?: ManagementPurchaseRepository }) {
  const account = useMemberAccount();
  const notify = useNotify();
  const repository = useMemo(() => supplied ?? managementPurchaseRepository(), [supplied]);
  const [open, setOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [choices, setChoices] = useState<ManagementPurchaseChoices | null>(null);
  const [purchase, setPurchase] = useState(() => emptyPurchase(account?.name ?? ''));
  const [files, setFiles] = useState<Evidence[]>([]);
  const filesRef = useRef<Evidence[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const id = useId();
  const multiple = purchase.lines.length > 1;
  const uploading = files.some(file => file.pending);
  const isInvoice = purchase.documentKind === 'invoice' || purchase.paymentMethod === 'invoice';
  let total: bigint | null = 0n;
  for (const item of purchase.lines) {
    try {
      const amount = parseNokToOre(item.amountNok);
      if (amount === null || amount <= 0n) { total = null; break; }
      total += amount;
    } catch { total = null; break; }
  }

  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const data = await repository.load();
      if (alive.current && current === generation.current) setChoices(data);
    } catch (error) {
      if (alive.current && current === generation.current) {
        setChoices(null);
        notify('Could not load purchase choices', error instanceof Error ? error.message : 'Please try again.', { variant: 'error', href: null, action: { label: 'Try again', onClick: () => void load() } });
      }
    }
  }, [repository, notify]);
  useEffect(() => {
    alive.current = true;
    const activeControllers = controllers.current;
    return () => { alive.current = false; generation.current++; activeControllers.forEach(controller => controller.abort()); };
  }, []);
  useEffect(()=>repository.watchSession?.(()=>{setChoices(null);setOpen(false);setPurchase(emptyPurchase(''));updateFiles([]);}),[repository]);
  useEffect(() => {
    if (!open) return;
    void load();
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [open, load]);

  function updateFiles(next: Evidence[]) { filesRef.current = next; setFiles(next); }
  function line(index: number, patch: Partial<PurchaseLineDraft>) {
    setPurchase(current => ({ ...current, lines: current.lines.map((value, i) => i === index ? { ...value, ...patch } : value) }));
  }
  async function upload(file: File) {
    if (savingRef.current) return;
    if (filesRef.current.length >= 15) { notify('Too many files', 'Attach at most 15 supporting files.', { variant: 'error', href: null }); return; }
    const key = crypto.randomUUID();
    const controller = new AbortController();
    controllers.current.set(key, controller);
    updateFiles([...filesRef.current, { key, name: file.name, uploadId: null, pending: true }]);
    try {
      const uploadId = await repository.upload(file, controller.signal);
      if (alive.current && filesRef.current.some(value => value.key === key)) updateFiles(filesRef.current.map(value => value.key === key ? { ...value, uploadId, pending: false } : value));
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        updateFiles(filesRef.current.filter(value => value.key !== key));
        notify('Could not upload supporting file', error instanceof Error ? error.message : 'Choose the file again.', { variant: 'error', href: null });
      }
    } finally { controllers.current.delete(key); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || !choices) return;
    if (filesRef.current.length === 0 || filesRef.current.some(file => !file.uploadId)) {
      notify('Receipt or invoice required', 'Attach a file and wait for the upload to finish.', { variant: 'error', href: null });
      return;
    }
    let lines: PurchaseLineInput[];
    try { lines = allocatePurchaseLines(purchase.lines, choices.items); }
    catch (error) {
      setProjectOpen(true);
      notify('Check the budget amounts', error instanceof Error ? error.message : 'Review the selected entries and amounts.', { variant: 'error', href: null });
      return;
    }
    const payload = { ...purchase, lines, buyerName: purchase.buyerName || account?.name || '', uploadIds: filesRef.current.flatMap(file => file.uploadId ? [file.uploadId] : []) };
    const validation = normalizePurchaseInput(payload, { management: true });
    if (validation.errors.length) {
      if (validation.errors.some(error => ['buyerName', 'quantity', 'documentNumber'].includes(error.field))) setDetailsOpen(true);
      if (validation.errors.some(error => ['projectId', 'budgetItemId'].includes(error.field))) setProjectOpen(true);
      notify('Check the purchase details', validation.errors[0].message, { variant: 'error', href: null });
      return;
    }
    const serialized = JSON.stringify(payload);
    if (request.current?.payload !== serialized) request.current = { payload: serialized, id: crypto.randomUUID() };
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await repository.register(payload, request.current.id);
      if (!alive.current) return;
      if (!result.ok || !result.publicRef) throw new Error(result.errors[0]?.message ?? 'The purchase may have been saved. Retry to confirm its reference.');
      notify('Purchase registered', [`Reference: ${result.publicRef}.`, ...result.warnings.map(warning => warning.message)].join(' '), { variant: result.warnings.length ? 'warning' : 'success', href: null });
      request.current = null;
      setPurchase(emptyPurchase(account?.name ?? ''));
      updateFiles([]);
      setProjectOpen(false);
      setDetailsOpen(false);
      setOpen(false);
      window.dispatchEvent(new Event('helix-workspace-updated'));
    } catch (error) {
      if (alive.current) notify('Could not register purchase', error instanceof Error ? error.message : 'Your input has been kept. Please try again.', { variant: 'error', href: null, action: { label: 'Reload choices', onClick: () => void load() } });
    } finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }
  const field = (label: string, key: DetailField, type = 'text', required = false) => <div className="space-y-1.5">
    <Label htmlFor={`${id}-${key}`}>{label}</Label>
    <Input id={`${id}-${key}`} type={type} value={purchase[key] ?? ''} required={required} max={key === 'purchaseDate' ? osloToday() : undefined}
      onInput={event => { const value = event.currentTarget.value; setPurchase(current => ({ ...current, [key]: value })); }} />
  </div>;
  const projectNames = [...new Set(purchase.lines.flatMap(item => {
    const project = choices?.projects.find(project => project.id === item.projectId);
    return project ? [project.name] : [];
  }))];

  return <Dialog open={open} onOpenChange={next => { if (!savingRef.current) setOpen(next); }}>
    <DialogTrigger asChild>{children}</DialogTrigger>
    <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      onEscapeKeyDown={event => { if (savingRef.current) event.preventDefault(); }} onInteractOutside={event => { if (savingRef.current) event.preventDefault(); }}>
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
        <DialogTitle>Register a purchase</DialogTitle>
        <DialogDescription>Add the purchase details and your receipt.</DialogDescription>
      </DialogHeader>
      <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-2">
          <fieldset disabled={saving} className="space-y-4">
            <div className="space-y-3">
              {purchase.lines.map((value, index) => <div key={index} className={multiple ? 'space-y-3 rounded-lg border p-3' : ''}>
                {multiple && <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Item {index + 1}</span><Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove item ${index + 1}`} onClick={() => setPurchase(current => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}><IconX aria-hidden="true" /></Button></div>}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <div className="space-y-1.5"><Label htmlFor={`${id}-description-${index}`}>{multiple ? 'Description' : 'What did you buy?'}</Label><Input id={`${id}-description-${index}`} aria-label={multiple ? `Description for item ${index + 1}` : undefined} value={value.description} placeholder="e.g. Materials for the chassis" required maxLength={300} onInput={event => line(index, { description: event.currentTarget.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor={`${id}-amount-${index}`}>{multiple ? 'Amount' : 'Total'}</Label><InputGroup><InputGroupInput id={`${id}-amount-${index}`} aria-label={multiple ? `Amount for item ${index + 1} (NOK)` : 'Total (NOK)'} value={value.amountNok} placeholder="0.00" required inputMode="decimal" onInput={event => line(index, { amountNok: event.currentTarget.value })} /><InputGroupAddon align="inline-end"><InputGroupText>NOK</InputGroupText></InputGroupAddon></InputGroup></div>
                </div>
              </div>)}
              {multiple && <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0 text-xs" disabled={purchase.lines.length >= 50} onClick={() => setPurchase(current => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Add item</Button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{field('Supplier', 'supplierName', 'text', true)}{field('Purchase date', 'purchaseDate', 'date', true)}</div>
            <div className="space-y-1.5"><Label htmlFor={`${id}-reason`}>What was it for?</Label><Textarea id={`${id}-reason`} value={purchase.justification} placeholder="How will the purchase be used?" className="min-h-14 resize-y" minLength={10} maxLength={2000} required onInput={event => { const value = event.currentTarget.value; setPurchase(current => ({ ...current, justification: value })); }} /></div>
            <div className="space-y-1.5"><Label htmlFor={`${id}-payment`}>Payment</Label><Select value={purchase.paymentMethod} disabled={saving} onValueChange={value => setPurchase(current => ({ ...current, paymentMethod: value as PurchaseInput['paymentMethod'], documentKind: value === 'invoice' ? 'invoice' : current.paymentMethod === 'invoice' ? 'receipt' : current.documentKind }))}><SelectTrigger id={`${id}-payment`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="team_account">Team account</SelectItem><SelectItem value="outlay">I paid personally</SelectItem><SelectItem value="invoice">Unpaid invoice</SelectItem></SelectContent></Select></div>
            {purchase.paymentMethod === 'outlay' && <div className="space-y-1.5"><Label htmlFor={`${id}-refund`}>Reimburse to</Label><Input id={`${id}-refund`} value={purchase.refundAccount || purchase.refundPhone || ''} inputMode="numeric" required aria-describedby={`${id}-refund-help`} onInput={event => { const value = event.currentTarget.value; const phone = value.replace(/\s/g, '').length === 8; setPurchase(current => ({ ...current, refundAccount: phone ? '' : value, refundPhone: phone ? value : '' })); }} /><p id={`${id}-refund-help`} className="text-xs text-muted-foreground">11-digit bank account or 8-digit phone number.</p></div>}
            {isInvoice && field('Invoice due date', 'invoiceDueDate', 'date', true)}
            <section aria-label="Receipt or invoice" className="space-y-2">
              <input ref={fileInput} id={`${id}-files`} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" className="sr-only" tabIndex={-1} aria-label="Supporting files" disabled={saving} onChange={event => { const selected = Array.from(event.target.files ?? []); event.target.value = ''; for (const file of selected) void upload(file); }} />
              <Button type="button" variant="outline" className="h-auto w-full flex-col gap-1 border-dashed bg-transparent px-4 py-3 font-normal shadow-none" disabled={files.length >= 15} onClick={() => fileInput.current?.click()}><span>{files.length ? 'Attach another file' : 'Attach receipt or invoice'}</span><span className="text-xs text-muted-foreground">PDF or image · up to 10 MB per file</span></Button>
              {files.length > 0 && <ul aria-label="Attached files" className="space-y-1">{files.map(file => <li key={file.key} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-1.5 text-sm"><span className="min-w-0 truncate">{file.name}{file.pending && <span className="text-muted-foreground"> · Uploading…</span>}</span><Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`} onClick={() => { controllers.current.get(file.key)?.abort(); updateFiles(filesRef.current.filter(value => value.key !== file.key)); }}><IconX aria-hidden="true" /></Button></li>)}</ul>}
            </section>
            <div>
              <OptionalSection title="Project and budget" summary={projectNames.length ? projectNames.join(', ') : 'Link now or later'} open={projectOpen} onOpenChange={setProjectOpen} disabled={saving}>
                <p className="text-xs text-muted-foreground">Choose a project you lead, or leave this for later.</p>
                {purchase.lines.map((value, index) => <div key={index} className="space-y-3">
                  {multiple && <p className="truncate text-xs font-medium">Item {index + 1}{value.description ? ` · ${value.description}` : ''}</p>}
                  <div className="space-y-1.5"><Label htmlFor={`${id}-project-${index}`}>Project</Label><Select value={value.projectId ?? 'later'} disabled={saving || !choices} onValueChange={projectId => line(index, { projectId: projectId === 'later' ? null : projectId, budgetItemId: null, budgetEntries: [], systemId: '', unbudgeted: true })}><SelectTrigger id={`${id}-project-${index}`} aria-label={`Project for item ${index + 1}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="later">Link to a project later</SelectItem>{choices?.projects.map(project => <SelectItem key={project.id} value={project.id}><IconCube aria-hidden="true" className="size-3.5 text-muted-foreground" />{project.name}</SelectItem>)}</SelectContent></Select></div>
                  {value.projectId && <ProjectBudgetEntries id={`${id}-entries-${index}`} items={choices?.items.filter(item => item.projectId === value.projectId) ?? []} selected={value.budgetEntries ?? []} amountNok={value.amountNok} disabled={saving || !choices} onChange={budgetEntries => line(index, { budgetEntries })} />}
                </div>)}
              </OptionalSection>
              <OptionalSection title="More details" open={detailsOpen} onOpenChange={setDetailsOpen} disabled={saving}>
                {field('Buyer name', 'buyerName')}
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor={`${id}-document`}>Document type</Label><Select value={purchase.documentKind} disabled={saving || purchase.paymentMethod === 'invoice'} onValueChange={value => setPurchase(current => ({ ...current, documentKind: value as PurchaseInput['documentKind'] }))}><SelectTrigger id={`${id}-document`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="receipt">Receipt</SelectItem><SelectItem value="invoice">Invoice</SelectItem></SelectContent></Select></div>{field('Document number (optional)', 'documentNumber')}</div>
                <div className={multiple ? 'grid gap-3 sm:grid-cols-2' : 'max-w-36'}>{purchase.lines.map((value, index) => <div key={index} className="space-y-1.5"><Label htmlFor={`${id}-quantity-${index}`}>{(value.budgetEntries?.length ?? 0) > 1 ? `Quantity per budget entry${multiple ? ` for item ${index + 1}` : ''}` : multiple ? `Quantity for item ${index + 1}` : 'Quantity'}</Label><Input id={`${id}-quantity-${index}`} value={value.quantity} inputMode="decimal" onInput={event => line(index, { quantity: event.currentTarget.value })} /></div>)}</div>
                <p className="text-xs text-muted-foreground">Enter amounts including VAT. Quantity does not change the total.</p>
                {!multiple && <Button type="button" variant="outline" size="sm" onClick={() => setPurchase(current => ({ ...current, lines: [...current.lines, emptyLine()] }))}>Split into items</Button>}
              </OptionalSection>
            </div>
          </fieldset>
        </div>
        <DialogFooter className="shrink-0 flex-row items-center justify-between border-t bg-muted/20 px-6 py-3 sm:justify-between">
          <div className="min-w-0 text-xs text-muted-foreground">Total including VAT<output aria-label="Purchase total" className="mt-0.5 block text-sm font-medium tabular-nums text-foreground">{total === null ? 'NOK —' : `NOK ${formatOre(total)}`}</output></div>
          <div className="flex gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !choices || files.length === 0 || uploading}>{saving ? 'Registering…' : uploading ? 'Uploading…' : 'Register purchase'}</Button></div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
