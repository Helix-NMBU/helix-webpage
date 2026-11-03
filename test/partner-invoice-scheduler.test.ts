import { expect, it, vi } from 'vitest';
import { runPartnerInvoices } from '../scripts/run-partner-invoices.mjs';

it('keeps credentials on the fixed target and rejects partial failure or an unexpected response', async () => {
 const secret='x'.repeat(32);
 const request=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({created:2,failed:0})});
 expect(await runPartnerInvoices(secret,request)).toBe(2);
 expect(request).toHaveBeenCalledWith('https://internal.helixnmbu.no/api/partner-invoice-runner',expect.objectContaining({method:'POST',redirect:'error',headers:{Authorization:`Bearer ${secret}`}}));
 for(const body of [{created:1,failed:1},{created:-1,failed:0},{created:1},null]){
  request.mockResolvedValue({ok:true,status:200,json:async()=>body});
  await expect(runPartnerInvoices(secret,request)).rejects.toThrow('Invoice catch-up failed');
 }
 request.mockResolvedValue({ok:false,status:503,json:async()=>({created:0,failed:1})});
 await expect(runPartnerInvoices(secret,request)).rejects.toThrow('HTTP 503');
});

it('fails before a request when credentials are absent and does not expose them in errors', async () => {
 const request=vi.fn();
 await expect(runPartnerInvoices(undefined,request)).rejects.toThrow('Set the 32+ character');
 expect(request).not.toHaveBeenCalled();
});
