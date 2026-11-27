import { pathToFileURL } from 'node:url';

/** Scheduled caller. Keep the target fixed so credentials cannot follow a redirect. */
export async function runPartnerInvoices(secret, request = fetch) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Set the 32+ character PARTNER_INVOICE_RUNNER_SECRET in GitHub and Vercel before enabling the scheduler.');
  }
  let response;
  try {
    response = await request('https://internal.helixnmbu.no/api/partner-invoice-runner', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new Error('Invoice catch-up could not reach the production runner. Check the route for redirects or timeouts, then rerun this workflow.');
  }
  const result = await response.json().catch(() => null);
  const complete = result && Number.isSafeInteger(result.created) && result.created >= 0
    && result.failed === 0 && Array.isArray(result.failures) && result.failures.length === 0;
  if (!response.ok || !complete) {
    // Do not print response bodies or credentials into GitHub logs.
    throw new Error(`Invoice catch-up failed (HTTP ${response.status}). Check the runner secret, season setup, verified Finance lead and pending agreement reviews, then rerun this workflow.`);
  }
  return result.created;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const created = await runPartnerInvoices(process.env.PARTNER_INVOICE_RUNNER_SECRET);
    console.log(`Invoice catch-up completed: ${created} task(s) created.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invoice catch-up failed.');
    process.exitCode = 1;
  }
}
