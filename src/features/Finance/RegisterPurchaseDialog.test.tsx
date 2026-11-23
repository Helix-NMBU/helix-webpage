// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Button } from '@libs/components/ui/button';
import { MemberAccountProvider } from '../MemberPlatform/MemberAccountContext';
import { RegisterPurchaseDialog } from './RegisterPurchaseDialog';
import type { ManagementPurchaseRepository } from './management-purchase-repository';
import type { ManagementPurchaseChoices } from './management-purchase-types';

const notify = vi.hoisted(() => vi.fn());
vi.mock('../MemberPlatform/MemberNotifications', () => ({ useNotify: () => notify }));
const projectId = '90000000-0000-4000-8000-000000000001';
const itemId = '90000000-0000-4000-8000-000000000002';
const secondItemId = '90000000-0000-4000-8000-000000000005';
const otherProjectId = '90000000-0000-4000-8000-000000000006';
const uploadId = '90000000-0000-4000-8000-000000000003';
const choices: ManagementPurchaseChoices = {
  seasonCode: 'S27', projects: [{ id: projectId, name: 'Fabrication' }, { id: otherProjectId, name: 'Other project' }],
  items: [
    { id: itemId, projectId, systemId: '90000000-0000-4000-8000-000000000004', publicRef: 'BI-S27-001', description: 'Steel plates', plannedNok: '8000.00' },
    { id: secondItemId, projectId, systemId: '90000000-0000-4000-8000-000000000007', publicRef: 'BI-S27-002', description: 'Fasteners', plannedNok: '2000.00' },
    { id: '90000000-0000-4000-8000-000000000008', projectId: otherProjectId, systemId: '90000000-0000-4000-8000-000000000004', publicRef: 'BI-S27-003', description: 'Paint', plannedNok: '1000.00' },
  ], purchases: [],
};
let element: HTMLDivElement, root: ReturnType<typeof createRoot>, repository: ManagementPurchaseRepository;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  notify.mockReset();
  element = document.createElement('div'); document.body.append(element); root = createRoot(element);
  repository = { load: vi.fn().mockResolvedValue(choices), upload: vi.fn().mockResolvedValue(uploadId), register: vi.fn().mockResolvedValue({ ok: true, viewVersion: 1, publicRef: '2026-0001', warnings: [], errors: [] }), link: vi.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals(); });
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === name || button.getAttribute('aria-label') === name || button.textContent?.startsWith(name))!;
function input(label: string) {
  const labelled = [...document.querySelectorAll('label')].find(value => value.textContent === label);
  return (labelled ? document.getElementById(labelled.htmlFor) : document.querySelector(`[aria-label="${label}"]`)) as HTMLInputElement;
}
async function fill(label: string, value: string) {
  await act(async () => {
    const field = input(label);
    Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function choose(label: string, option: string) {
  await act(async () => input(label).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(value => value.textContent?.trim() === option)!.click());
}
async function open() {
  await act(async () => root.render(<MemberAccountProvider account={{ name: 'Team member', email: 'member@example.invalid', role: 'Member' }}><RegisterPurchaseDialog repository={repository}><Button>Register a purchase</Button></RegisterPurchaseDialog></MemberAccountProvider>));
  await act(async () => button('Register a purchase').click());
}
async function attach() {
  await act(async () => {
    const field = input('Supporting files');
    Object.defineProperty(field, 'files', { configurable: true, value: [new File(['%PDF-1.4'], 'receipt.pdf', { type: 'application/pdf' })] });
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function ready() {
  await fill('Supplier', 'Parts supplier'); await fill('What was it for?', 'Parts for chassis assembly');
  await fill('What did you buy?', 'Steel plates'); await fill('Total (NOK)', '6000.01'); await attach();
}
async function submit() { await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

it('starts with the essentials and fills the buyer automatically without requiring project allocation', async () => {
  await open();
  expect(input('Buyer name')).toBeNull(); expect(input('Quantity')).toBeNull(); expect(input('Document number (optional)')).toBeNull(); expect(input('Project for item 1')).toBeNull();
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toMatch(/Your requests|Finance tools|Purchase register/);
  await ready(); await submit();
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ buyerName: 'Team member', justification: 'Parts for chassis assembly', lines: [expect.objectContaining({ projectId: null, budgetItemId: null, amountNok: '6000.01', quantity: '1' })], uploadIds: [uploadId] }), expect.any(String));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(notify).toHaveBeenCalledWith('Purchase registered', expect.stringContaining('2026-0001'), expect.objectContaining({ variant: 'success' }));
});
it('retains input and the request ID after an uncertain registration response', async () => {
  vi.mocked(repository.register).mockRejectedValueOnce(new Error('Response lost')); await open(); await ready(); await submit();
  expect(input('Supplier').value).toBe('Parts supplier'); expect(notify).toHaveBeenCalledWith('Could not register purchase', 'Response lost', expect.any(Object));
  await submit(); expect(vi.mocked(repository.register).mock.calls[0][1]).toBe(vi.mocked(repository.register).mock.calls[1][1]);
});
it('keeps a draft and optional details across dismissal and reopening', async () => {
  await open(); await fill('Supplier', 'Unsaved supplier'); await act(async () => button('More details').click()); await fill('Document number (optional)', 'R-123');
  await act(async () => button('Cancel').click()); await act(async () => button('Register a purchase').click());
  expect(input('Supplier').value).toBe('Unsaved supplier'); expect(input('Document number (optional)').value).toBe('R-123');
});
it('shows invoice details only when needed and sends an invoice obligation', async () => {
  await open(); expect(input('Invoice due date')).toBeNull(); await choose('Payment', 'Unpaid invoice');
  expect(input('Invoice due date')).not.toBeNull(); await fill('Invoice due date', '2026-12-15'); await ready(); await submit();
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'invoice', documentKind: 'invoice', invoiceDueDate: '2026-12-15' }), expect.any(String));
});
it.each([['12345678901', 'refundAccount', 'refundPhone'], ['12345678', 'refundPhone', 'refundAccount']])('accepts reimbursement destination %s through one field', async (destination, populated, empty) => {
  await open(); await choose('Payment', 'I paid personally'); await fill('Reimburse to', destination); await ready(); await submit();
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'outlay', [populated]: destination, [empty]: '' }), expect.any(String));
});
it('offers approved entries only after selecting a led project and keeps allocation when collapsed', async () => {
  await open(); await act(async () => button('Project and budget').click());
  expect(document.querySelector('[aria-label="Project budget entries"]')).toBeNull(); await choose('Project for item 1', 'Fabrication');
  expect(document.querySelector('[aria-label="Project budget entries"]')?.textContent).toContain('Fasteners');
  expect(document.querySelector('[aria-label="Project budget entries"]')?.textContent).not.toContain('Paint');
  await act(async () => button('BI-S27-001 · Steel plates').click());
  await act(async () => button('Project and budget').click()); await ready(); await submit();
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ projectId, budgetItemId: itemId, unbudgeted: false })] }), expect.any(String));
});
it('registers one payment and receipt across several checked budget entries', async () => {
  await open(); await ready(); await act(async () => button('Project and budget').click()); await choose('Project for item 1', 'Fabrication');
  await act(async () => button('BI-S27-001 · Steel plates').click()); await act(async () => button('BI-S27-002 · Fasteners').click());
  await fill('Amount for BI-S27-001 (NOK)', '5000.00'); await fill('Amount for BI-S27-002 (NOK)', '1000.01');
  expect(document.querySelector('output')?.textContent).toBe('NOK 6000.01');
  await act(async () => button('Project and budget').click()); await submit();
  expect(repository.register).toHaveBeenCalledTimes(1);
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ uploadIds: [uploadId], lines: [
    expect.objectContaining({ projectId, budgetItemId: itemId, amountNok: '5000.00' }),
    expect.objectContaining({ projectId, budgetItemId: secondItemId, amountNok: '1000.01' }),
  ] }), expect.any(String));
});
it.each(['999.99', '1000.02'])('keeps the draft and prevents saving when the entry split is %s', async secondAmount => {
  await open(); await ready(); await act(async () => button('Project and budget').click()); await choose('Project for item 1', 'Fabrication');
  await act(async () => button('BI-S27-001 · Steel plates').click()); await act(async () => button('BI-S27-002 · Fasteners').click());
  await fill('Amount for BI-S27-001 (NOK)', '5000.00'); await fill('Amount for BI-S27-002 (NOK)', secondAmount); await submit();
  expect(repository.register).not.toHaveBeenCalled(); expect(input('Supplier').value).toBe('Parts supplier');
  expect(notify).toHaveBeenCalledWith('Check the budget amounts', expect.stringContaining('must add up to NOK 6000.01'), expect.any(Object));
});
it('clears checked entries when changing projects', async () => {
  await open(); await ready(); await act(async () => button('Project and budget').click()); await choose('Project for item 1', 'Fabrication');
  await act(async () => button('BI-S27-001 · Steel plates').click()); await choose('Project for item 1', 'Other project');
  expect(document.querySelector('[aria-label="Project budget entries"]')?.textContent).toContain('Paint');
  expect(document.querySelector('[aria-label="Project budget entries"]')?.textContent).not.toContain('Steel plates'); await submit();
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ projectId: otherProjectId, budgetItemId: null, unbudgeted: true, amountNok: '6000.01' })] }), expect.any(String));
});
it('supports itemization and sums line amounts without multiplying by quantity', async () => {
  await open(); await ready(); await act(async () => button('More details').click()); await fill('Quantity', '2'); await act(async () => button('Split into items').click());
  await fill('Description for item 2', 'Fasteners'); await fill('Amount for item 2 (NOK)', '99.99');
  expect(document.querySelector('output')?.textContent).toBe('NOK 6100.00'); await submit();
  expect(repository.register).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ description: 'Steel plates', amountNok: '6000.01', quantity: '2' }), expect.objectContaining({ description: 'Fasteners', amountNok: '99.99', quantity: '1' })] }), expect.any(String));
});
it('prevents registration while an attachment is uploading and handles its removal', async () => {
  let resolveUpload!: (id: string) => void;
  vi.mocked(repository.upload).mockImplementation(() => new Promise(resolve => { resolveUpload = resolve; }));
  await open(); await attach(); expect(button('Uploading…').disabled).toBe(true);
  await act(async () => button('Remove receipt.pdf').click()); await act(async () => resolveUpload(uploadId));
  expect(document.querySelector('[aria-label="Attached files"]')).toBeNull(); expect(button('Register purchase').disabled).toBe(true); expect(repository.register).not.toHaveBeenCalled();
});
