import { Checkbox } from '@libs/components/ui/checkbox';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@libs/components/ui/input-group';
import { Label } from '@libs/components/ui/label';
import { formatOre, parseNokToOre } from './money';
import type { ManagementPurchaseChoices } from './management-purchase-types';
import type { BudgetEntryAllocation } from './purchase-allocation';

type Props = {
  id: string;
  items: ManagementPurchaseChoices['items'];
  selected: BudgetEntryAllocation[];
  amountNok: string;
  disabled: boolean;
  onChange: (selected: BudgetEntryAllocation[]) => void;
};

export function ProjectBudgetEntries({ id, items, selected, amountNok, disabled, onChange }: Props) {
  const split = selected.length > 1;
  let remaining: bigint | null = null;
  try {
    const total = parseNokToOre(amountNok);
    if (total !== null && total > 0n) remaining = total - selected.reduce((sum, entry) => sum + (parseNokToOre(entry.amountNok) ?? 0n), 0n);
  } catch { /* Incomplete typed amounts are validated on registration. */ }
  const unavailable = selected.filter(entry => !items.some(item => item.id === entry.itemId));
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend className="mb-1 text-sm font-medium">Budget entries{selected.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{selected.length} selected</span>}</legend>
    <p id={`${id}-help`} className="text-xs text-muted-foreground">Select the entries this payment covers. Leave them unchecked to allocate later.</p>
    {items.length > 0 || unavailable.length > 0 ? <div role="group" aria-label="Project budget entries" aria-describedby={`${id}-help`} className="max-h-72 overflow-y-auto overscroll-contain rounded-md border">
      {items.map(item => {
        const entry = selected.find(entry => entry.itemId === item.id);
        const checkboxId = `${id}-${item.id}`;
        return <div key={item.id} className="space-y-2 border-b px-3 py-2.5 last:border-b-0 has-[[data-state=checked]]:bg-muted/40">
          <div className="flex items-center gap-3">
            <Checkbox id={checkboxId} checked={!!entry} disabled={disabled} aria-label={`${item.publicRef} · ${item.description}`} onCheckedChange={checked => onChange(checked === true ? [...selected, { itemId: item.id, amountNok: '' }] : selected.filter(entry => entry.itemId !== item.id))} />
            <Label htmlFor={checkboxId} className="min-w-0 flex-1 flex-col items-start gap-0.5 font-normal"><span className="break-words">{item.description}</span><span className="text-xs text-muted-foreground">{item.publicRef}</span></Label>
          </div>
          {entry && split && <div className="flex items-center gap-3 pl-7"><Label htmlFor={`${checkboxId}-amount`} className="text-xs font-normal">Amount</Label><InputGroup className="ml-auto w-40"><InputGroupInput id={`${checkboxId}-amount`} aria-label={`Amount for ${item.publicRef} (NOK)`} inputMode="decimal" placeholder="0.00" value={entry.amountNok} onInput={event => { const amountNok = event.currentTarget.value; onChange(selected.map(value => value.itemId === item.id ? { ...value, amountNok } : value)); }} /><InputGroupAddon align="inline-end"><InputGroupText>NOK</InputGroupText></InputGroupAddon></InputGroup></div>}
        </div>;
      })}
      {unavailable.map(entry => <div key={entry.itemId} className="flex items-center gap-3 border-t px-3 py-2.5"><Checkbox id={`${id}-${entry.itemId}`} checked disabled={disabled} onCheckedChange={() => onChange(selected.filter(value => value.itemId !== entry.itemId))} /><Label htmlFor={`${id}-${entry.itemId}`} className="font-normal">Unavailable budget entry. Uncheck to remove.</Label></div>)}
    </div> : <p className="py-2 text-sm text-muted-foreground">No approved budget entries are linked to this project yet. You can still register the purchase.</p>}
    {split && <p className="text-xs text-muted-foreground">{remaining === null ? 'Enter the payment total and an amount for each selected entry.' : remaining >= 0n ? `Left to allocate: NOK ${formatOre(remaining)}` : `Over the payment total by NOK ${formatOre(-remaining)}`}</p>}
  </fieldset>;
}
