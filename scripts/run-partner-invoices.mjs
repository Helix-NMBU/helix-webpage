/** Scheduled caller. Keep the target fixed so credentials cannot follow a redirect. */
export async function runPartnerInvoices(secret, request = fetch) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Set the 32+ character PARTNER_INVOICE_RUNNER_SECRET in GitHub and Vercel before enabling the scheduler.');
  }
  const response = await request('https://internal.helixnmbu.no/api/partner-invoice-runner', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || !Number.isSafeInteger(result.created) || result.created < 0 || result.failed !== 0) {
    // Do not print response bodies or credentials into GitHub logs.
    throw new Error(`Invoice catch-up failed (HTTP ${response.status}). Check season dates, verified Finance leads and pending agreement reviews, then rerun this workflow.`);
  }
  return result.created;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const created = await runPartnerInvoices(process.env.PARTNER_INVOICE_RUNNER_SECRET);
    console.log(`Invoice catch-up completed: ${created} task(s) created.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invoice catch-up failed.');
    process.exitCode = 1;
  }
}
