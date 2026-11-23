// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectPurchases } from './ProjectPurchases';
import type { ManagementPurchaseRepository } from './management-purchase-repository';
import type { ManagementPurchaseChoices } from './management-purchase-types';
const notify = vi.hoisted(() => vi.fn());
vi.mock('../MemberPlatform/MemberNotifications', () => ({ useNotify: () => notify }));
let element: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); element = document.createElement('div'); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals(); });
it('makes a newly registered purchase available to link without leaving the project', async () => {
  const choices: ManagementPurchaseChoices = { seasonCode: 'S27', projects: [{ id: 'project', name: 'Fabrication' }], items: [], purchases: [] };
  const load = vi.fn().mockResolvedValue(choices);
  const repository: ManagementPurchaseRepository = { load, upload: vi.fn(), register: vi.fn(), link: vi.fn() };
  await act(async () => root.render(<ProjectPurchases projectId="project" repository={repository} />));
  expect(element.querySelector('button')?.disabled).toBe(true);
  load.mockResolvedValue({ ...choices, purchases: [{ id: 'line', purchaseId: 'purchase', publicRef: '2026-0002', supplierName: 'Parts supplier', purchaseDate: '2026-11-23', description: 'Workshop supplies', amountNok: '249.50', projectId: null, budgetItemId: null, revision: 0 }] });
  await act(async () => window.dispatchEvent(new Event('helix-workspace-updated')));
  expect(element.querySelector('button')?.disabled).toBe(false);
  await act(async () => element.querySelector('button')!.click());
  const select = document.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  await act(async () => select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect([...document.querySelectorAll('[role="option"]')].some(option => option.textContent?.includes('2026-0002 · Workshop supplies · NOK 249.50'))).toBe(true);
});
