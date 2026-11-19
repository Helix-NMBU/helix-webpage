import { afterEach, describe, expect, it, vi } from "vitest";
import { createInvoiceContinuation } from "./invoice-continuation";
import type { FinanceMutationResult } from "./types";
const saved: FinanceMutationResult = {
  ok: true,
  id: "purchase-id",
  viewVersion: 1,
  warnings: [],
  errors: [],
  invoiceEvidence: {
    pending: 2,
    transferring: 0,
    stored: 0,
    needsAttention: 0,
  },
};
const callbacks = () => ({
  updated: vi.fn(),
  accessEnded: vi.fn(),
  interrupted: vi.fn(),
});
afterEach(() => vi.useRealTimers());
describe("automatic invoice continuation", () => {
  it("returns the saved result immediately and continues beyond five bounded batches", async () => {
    vi.useFakeTimers();
    const owner = { current: "member" },
      events = callbacks();
    let finish!: (r: FinanceMutationResult) => void;
    const first = new Promise<FinanceMutationResult>((r) => (finish = r));
    let count = 0;
    const request = vi.fn(async () => {
      count++;
      if (count === 1) return first;
      return {
        ...saved,
        viewVersion: count + 1,
        invoiceEvidence: {
          pending: count < 8 ? 1 : 0,
          transferring: 0,
          stored: count < 8 ? 1 : 2,
          needsAttention: 0,
        },
      };
    });
    const controller = createInvoiceContinuation(owner, request),
      stop = controller.watch(events);
    const returned = Promise.resolve().then(() => {
      controller.start(saved);
      return saved;
    });
    expect(await returned).toBe(saved);
    expect(events.updated).not.toHaveBeenCalled();
    finish({ ...saved, viewVersion: 2 });
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(8);
    expect(events.updated).toHaveBeenLastCalledWith(
      expect.objectContaining({
        invoiceEvidence: expect.objectContaining({ stored: 2, pending: 0 }),
      }),
    );
    stop();
  });
  it("deduplicates concurrent starts across entrypoints and backs off when another lease has no progress", async () => {
    vi.useFakeTimers();
    const owner = { current: "same-member" },
      events = callbacks(),
      request = vi.fn(async () => saved);
    const one = createInvoiceContinuation(owner, request),
      two = createInvoiceContinuation(owner, request);
    const stop = one.watch(events),
      stopTwo = two.watch(callbacks());
    one.start(saved);
    one.start(saved);
    two.start(saved);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    stopTwo();
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("aborts on disposal and ignores a late response after scope/session cancellation", async () => {
    vi.useFakeTimers();
    let finish!: (r: FinanceMutationResult) => void;
    const pending = new Promise<FinanceMutationResult>((r) => (finish = r));
    let signal: AbortSignal | undefined;
    const request = vi.fn(
        async (_c: Record<string, unknown>, s: AbortSignal) => {
          signal = s;
          return pending;
        },
      ),
      events = callbacks(),
      controller = createInvoiceContinuation(
        { current: "dispose-member" },
        request,
      ),
      stop = controller.watch(events);
    controller.start(saved);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(signal?.aborted).toBe(true);
    finish({
      ...saved,
      viewVersion: 2,
      invoiceEvidence: {
        pending: 0,
        transferring: 0,
        stored: 2,
        needsAttention: 0,
      },
    });
    await vi.runAllTimersAsync();
    expect(events.updated).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("stops on attention and never blindly retries those jobs", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => ({
        ...saved,
        viewVersion: 2,
        invoiceEvidence: {
          pending: 0,
          transferring: 0,
          stored: 0,
          needsAttention: 2,
        },
      })),
      events = callbacks(),
      controller = createInvoiceContinuation(
        { current: "attention-member" },
        request,
      ),
      stop = controller.watch(events);
    controller.start(saved);
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(1);
    stop();
  });
  it("cancels on authority loss and on a changed verified member", async () => {
    vi.useFakeTimers();
    const owner = { current: "revoked-member" },
      events = callbacks(),
      request = vi.fn(async () => {
        throw Object.assign(new Error("Revoked"), { status: 403 });
      }),
      controller = createInvoiceContinuation(owner, request),
      stop = controller.watch(events);
    controller.start(saved);
    await vi.runAllTimersAsync();
    expect(events.accessEnded).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    stop();
    const next = callbacks(),
      valid = vi.fn(async () => saved),
      other = createInvoiceContinuation(owner, valid),
      dispose = other.watch(next);
    other.start(saved);
    owner.current = "another-member";
    await vi.runAllTimersAsync();
    expect(valid).not.toHaveBeenCalled();
    dispose();
  });
  it("backs off transient failures without changing the saved actual outcome or flooding notifications", async () => {
    vi.useFakeTimers();
    let count = 0;
    const request = vi.fn(async () => {
        if (++count < 3) throw new Error("Offline");
        return {
          ...saved,
          viewVersion: 2,
          invoiceEvidence: {
            pending: 0,
            transferring: 0,
            stored: 2,
            needsAttention: 0,
          },
        };
      }),
      events = callbacks(),
      controller = createInvoiceContinuation(
        { current: "offline-member" },
        request,
      ),
      stop = controller.watch(events);
    controller.start(saved);
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(3);
    expect(events.interrupted).toHaveBeenCalledOnce();
    expect(saved.ok).toBe(true);
    stop();
  });
});
