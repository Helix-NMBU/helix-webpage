import { formatOre, parseNokToOre } from './money';
import type { ManagementPurchaseChoices } from './management-purchase-types';
import type { PurchaseLineInput } from './types';

export type BudgetEntryAllocation = { itemId: string; amountNok: string };
export type PurchaseLineDraft = PurchaseLineInput & { budgetEntries?: BudgetEntryAllocation[] };

function positiveAmount(value: string, message: string): bigint {
  try {
    const amount = parseNokToOre(value);
    if (amount !== null && amount > 0n) return amount;
  } catch { /* Report the field in terms of the allocation being edited. */ }
  throw new Error(message);
}

// One purchase owns the payment and documents. Its cost lines divide that
// payment across the chosen entries, preserving the existing atomic API.
export function allocatePurchaseLines(drafts: PurchaseLineDraft[], items: ManagementPurchaseChoices['items']): PurchaseLineInput[] {
  const lines = drafts.flatMap(({ budgetEntries = [], ...line }, index) => {
    if (!budgetEntries.length) return [line];
    if (new Set(budgetEntries.map(entry => entry.itemId)).size !== budgetEntries.length) throw new Error('Choose each budget entry only once per item.');
    const total = positiveAmount(line.amountNok, `Enter a positive total for item ${index + 1}.`);
    const amounts = budgetEntries.map(entry => budgetEntries.length === 1 ? total : positiveAmount(entry.amountNok, 'Enter an amount for each selected budget entry.'));
    if (amounts.reduce((sum, amount) => sum + amount, 0n) !== total) throw new Error(`Budget entry amounts for item ${index + 1} must add up to NOK ${formatOre(total)}.`);
    return budgetEntries.map((entry, entryIndex) => {
      const item = items.find(item => item.id === entry.itemId && item.projectId === line.projectId);
      if (!item) throw new Error('A selected budget entry is no longer available in this project. Review your selection.');
      return { ...line, systemId: item.systemId, budgetItemId: item.id, unbudgeted: false, amountNok: formatOre(amounts[entryIndex]) };
    });
  });
  if (lines.length > 50) throw new Error('A purchase can cover at most 50 budget entries or items.');
  return lines;
}
