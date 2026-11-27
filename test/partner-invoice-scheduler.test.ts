import { expect, it, vi } from 'vitest';
import { runPartnerInvoices } from '../scripts/run-partner-invoices.mjs';

const secret = 'test-invoice-credential'.repeat(2);

it('posts credentials only to the fixed production runner and refuses redirects', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ created: 2, failed: 0, failures: [] }));

  await expect(runPartnerInvoices(secret, request)).resolves.toBe(2);
  expect(request).toHaveBeenCalledExactlyOnceWith('https://internal.helixnmbu.no/api/partner-invoice-runner', {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${secret}` },
    signal: expect.any(AbortSignal),
  });
});

it.each([{ created: 1, failed: 1 }, { created: -1, failed: 0 }, { created: 1 }, null])(
  'rejects incomplete or invalid success results (%j)',
  async result => {
    const request = vi.fn().mockResolvedValue(Response.json(result));
    await expect(runPartnerInvoices(secret, request)).rejects.toThrow('Invoice catch-up failed');
  },
);

it('reports only the HTTP status when the runner fails', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ error: secret }, { status: 503 }));
  const run = runPartnerInvoices(secret, request);

  await expect(run).rejects.toThrow('HTTP 503');
  await expect(run).rejects.not.toThrow(secret);
});

it('rejects a malformed response body', async () => {
  const request = vi.fn().mockResolvedValue(new Response('not JSON'));
  await expect(runPartnerInvoices(secret, request)).rejects.toThrow('Invoice catch-up failed');
});

it('reports a transport failure without exposing request data', async () => {
  const request = vi.fn().mockRejectedValue(new Error(`request refused for ${secret}`));
  const run = runPartnerInvoices(secret, request);

  await expect(run).rejects.toThrow('could not reach the production runner');
  await expect(run).rejects.not.toThrow(secret);
});

it.each([undefined, 'short'])('fails before contacting the runner with an invalid credential', async credential => {
  const request = vi.fn();

  await expect(runPartnerInvoices(credential, request)).rejects.toThrow('Set the 32+ character');
  expect(request).not.toHaveBeenCalled();
});
