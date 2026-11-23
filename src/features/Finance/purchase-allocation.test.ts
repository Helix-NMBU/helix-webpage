import { expect, it } from 'vitest';
import { allocatePurchaseLines, type PurchaseLineDraft } from './purchase-allocation';
const items = [{ id: 'steel', projectId: 'frame', systemId: 'chassis', publicRef: 'BI-1', description: 'Steel', plannedNok: '1000.00' }, { id: 'bolts', projectId: 'frame', systemId: 'fasteners', publicRef: 'BI-2', description: 'Bolts', plannedNok: '100.00' }];
const line: PurchaseLineDraft = { projectId: 'frame', systemId: '', budgetItemId: null, unbudgeted: true, description: 'Parts', quantity: '1', amountNok: '1000.01' };
it('uses exact cents and preserves the payment total across different systems', () => {
  const lines = allocatePurchaseLines([{ ...line, budgetEntries: [{ itemId: 'steel', amountNok: '900,00' }, { itemId: 'bolts', amountNok: '100.01' }] }], items);
  expect(lines.map(line => [line.budgetItemId, line.systemId, line.amountNok])).toEqual([['steel', 'chassis', '900.00'], ['bolts', 'fasteners', '100.01']]);
  expect(lines.every(line => !('budgetEntries' in line))).toBe(true);
});
it('assigns the entire payment to the last remaining checked entry', () => {
  expect(allocatePurchaseLines([{ ...line, budgetEntries: [{ itemId: 'steel', amountNok: '900.00' }] }], items)[0].amountNok).toBe('1000.01');
});
it.each([
  { budgetEntries: [{ itemId: 'steel', amountNok: '' }, { itemId: 'bolts', amountNok: '100.01' }] },
  { budgetEntries: [{ itemId: 'steel', amountNok: '900.00' }, { itemId: 'steel', amountNok: '100.01' }] },
  { budgetEntries: [{ itemId: 'missing', amountNok: '' }] },
])('rejects an incomplete, duplicate or unavailable split', ({ budgetEntries }) => {
  expect(() => allocatePurchaseLines([{ ...line, budgetEntries }], items)).toThrow();
});
it('rejects stale entries from a different project', () => {
  expect(() => allocatePurchaseLines([{ ...line, projectId: 'other', budgetEntries: [{ itemId: 'steel', amountNok: '' }] }], items)).toThrow('no longer available');
});
