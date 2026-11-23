// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InvoiceTaskProgress } from './InvoiceTaskProgress';
import type { InvoiceProgressRepository } from './invoice-progress-repository';
const notify=vi.hoisted(()=>vi.fn());
vi.mock('../MemberPlatform/MemberNotifications',()=>({useNotify:()=>notify}));
const progress={sentDate:null,receivedDate:null,revision:2,fundingRevision:4,canRecordSent:true,canRecordPayment:true,hasFunding:true};
let element:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);notify.mockReset();element=document.createElement('div');document.body.append(element);root=createRoot(element);});
afterEach(async()=>{await act(async()=>root.unmount());element.remove();vi.unstubAllGlobals();});
async function render(repository:InvoiceProgressRepository) {
 await act(async()=>root.render(<MemoryRouter><InvoiceTaskProgress taskId="invoice" repository={repository}/></MemoryRouter>));
}
async function fill(id:string,value:string) {
 const input=element.querySelector<HTMLInputElement>(`#${id}`)!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
}
it('saves explicit sent and received dates against both revisions',async()=>{
 const repository={load:vi.fn().mockResolvedValue(progress),save:vi.fn().mockResolvedValue({...progress,revision:3,fundingRevision:5,sentDate:'2026-11-01',receivedDate:'2026-11-02'})};
 await render(repository);
 await fill('invoice-sent-invoice','2026-11-01');await fill('invoice-received-invoice','2026-11-02');
 await act(async()=>element.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(repository.save).toHaveBeenCalledWith({taskId:'invoice',expectedRevision:2,fundingRevision:4,sentDate:'2026-11-01',receivedDate:'2026-11-02'});
 expect(notify).toHaveBeenCalledWith('Invoice progress saved',expect.any(String),expect.objectContaining({variant:'success'}));
});
it('keeps payment recording restricted and omits invoice controls on ordinary tasks',async()=>{
 const repository={load:vi.fn().mockResolvedValue({...progress,canRecordPayment:false}),save:vi.fn()};
 await render(repository);
 expect(element.querySelector<HTMLInputElement>('#invoice-received-invoice')!.disabled).toBe(true);
 expect(element.querySelector<HTMLInputElement>('#invoice-sent-invoice')!.disabled).toBe(false);
 await render({load:vi.fn().mockResolvedValue(null),save:vi.fn()});
 expect(element.textContent).toBe('');
});
it('keeps unsaved dates and offers reload after a conflicting payment change',async()=>{
 const repository={load:vi.fn().mockResolvedValue(progress),save:vi.fn().mockRejectedValue(new Error('The invoice or payment changed.'))};
 await render(repository);await fill('invoice-sent-invoice','2026-11-01');
 await act(async()=>element.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(element.querySelector<HTMLInputElement>('#invoice-sent-invoice')!.value).toBe('2026-11-01');
 expect(notify).toHaveBeenCalledWith('Could not save invoice progress',expect.any(String),expect.objectContaining({action:{label:'Reload invoice',onClick:expect.any(Function)}}));
});
