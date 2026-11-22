import type { FinanceMutationResult } from "./types";

export interface InvoiceContinuationCallbacks {
  updated(result: FinanceMutationResult): void;
  accessEnded(error: unknown): void;
  interrupted?(error: unknown): void;
}
type Chain = { controller: AbortController; cancelDelay?: () => void };
// Replays from two mounted registration entrypoints still share one chain per verified member/purchase.
const running = new Map<string, Chain>();
const waiting = (r: FinanceMutationResult) =>
  !!r.invoiceEvidence &&
  r.invoiceEvidence.pending + r.invoiceEvidence.transferring > 0;
export function createInvoiceContinuation(
  owner: { current: string | null },
  request: (
    change: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<FinanceMutationResult>,
) {
  let epoch = 0,
    callbacks: InvoiceContinuationCallbacks | null = null;
  const owned = new Map<string, Chain>();
  function stop() {
    epoch++;
    callbacks = null;
    for (const [key, chain] of owned) {
      chain.controller.abort();
      chain.cancelDelay?.();
      if (running.get(key) === chain) running.delete(key);
    }
    owned.clear();
  }
  function watch(next: InvoiceContinuationCallbacks) {
    stop();
    callbacks = next;
    const version = epoch;
    return () => {
      if (version === epoch) stop();
    };
  }
  function start(result: FinanceMutationResult) {
    if (!callbacks || !result.id || !waiting(result)) return;
    const user = owner.current,
      version = epoch;
    // A verified request binds the owner before this point. An unbound client cannot start background work.
    if (!user) return;
    const key = `${user}:${result.id}`;
    if (running.has(key)) return;
    const chain: Chain = { controller: new AbortController() };
    running.set(key, chain);
    owned.set(key, chain);
    const live = () =>
      !!callbacks &&
      version === epoch &&
      owner.current === user &&
      !chain.controller.signal.aborted;
    async function delay(milliseconds: number) {
      if (!live()) return false;
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          chain.cancelDelay = undefined;
          resolve(live());
        }, milliseconds);
        chain.cancelDelay = () => {
          clearTimeout(timer);
          chain.cancelDelay = undefined;
          resolve(false);
        };
      });
    }
    // Do not hold the saved purchase response or its form open while evidence continues.
    queueMicrotask(() => {
      void (async () => {
        let latest = result,
          pause = 250,
          warned = false;
        try {
          while (live() && waiting(latest)) {
            try {
              const next = await request(
                {
                  action: "continueInvoiceTransfers",
                  purchaseId: result.id,
                  requestId: crypto.randomUUID(),
                },
                chain.controller.signal,
              );
              if (!live()) return;
              const progress =
                next.viewVersion > latest.viewVersion ||
                JSON.stringify(next.invoiceEvidence) !==
                  JSON.stringify(latest.invoiceEvidence);
              latest = next;
              callbacks?.updated(next);
              if (!waiting(next)) return; // Attention jobs are not automatically retried.
              pause = progress ? 250 : Math.min(pause * 2, 10_000);
            } catch (error) {
              if (!live()) return;
              const status =
                error && typeof error === "object" && "status" in error
                  ? Number(error.status)
                  : 0;
              if (status === 401 || status === 403) {
                const ended = callbacks;
                stop();
                ended?.accessEnded(error);
                return;
              }
              if (!warned) {
                warned = true;
                callbacks?.interrupted?.(error);
              }
              pause = Math.min(Math.max(pause * 2, 1000), 30_000);
            }
            if (!(await delay(pause))) return;
          }
        } finally {
          if (running.get(key) === chain) running.delete(key);
          if (owned.get(key) === chain) owned.delete(key);
        }
      })().catch((error) => {
        if (live()) callbacks?.interrupted?.(error);
      });
    });
  }
  return { start, watch, stop };
}
