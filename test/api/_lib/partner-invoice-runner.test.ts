import { expect, it, vi } from 'vitest';
import { createPartnerInvoiceRunner } from '../../../api/_lib/partner-invoice-runner.js';
function response(){ const r={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};r.status.mockReturnValue(r);return r; }
it('requires configured secret and rejects unauthorized requests before invoking the runner',async()=>{
 const run=vi.fn().mockResolvedValue({created:0,failed:0,failures:[]});const secret='x'.repeat(32);
 for(const [configured,header,status] of [[undefined,'',503],[secret,'Bearer wrong',401],[secret,`Bearer ${secret}`,200]] as const){
  const res=response();await createPartnerInvoiceRunner({secret:()=>configured,run})({method:'POST',headers:{authorization:header}} as never,res as never);
  expect(res.status).toHaveBeenCalledWith(status);
 }
 expect(run).toHaveBeenCalledTimes(1);
});
it('reports partial and unavailable runs as failures so a scheduler can retry',async()=>{
 const res=response();const run=vi.fn().mockResolvedValue({created:1,failed:1,failures:[]});
 await createPartnerInvoiceRunner({secret:()=> 'x'.repeat(32),run})({method:'POST',headers:{authorization:`Bearer ${'x'.repeat(32)}`}} as never,res as never);
 expect(res.status).toHaveBeenCalledWith(503);
});
