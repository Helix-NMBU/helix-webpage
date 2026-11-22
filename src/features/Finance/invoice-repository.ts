import { createInvoiceContinuation } from "./invoice-continuation";
import { memberSessionToken, watchMemberSession } from "../MemberCV/session";
import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { createLocalInvoiceEvidenceApi } from "./invoice-local";
import type { FinanceMutationResult } from "./types";
export interface InvoiceEvidenceActions {
  open(
    documentId: string,
  ): Promise<{ viewerUrl?: string; downloadUrl?: string }>;
  retry(
    documentId: string,
    expectedRevision: number,
    requestId: string,
  ): Promise<FinanceMutationResult>;
  watchSession?(
    onEnd: () => void,
    onInvoices?: (result: FinanceMutationResult) => void,
  ): () => void;
}
export class InvoiceEvidenceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function createInvoiceEvidenceApi(): InvoiceEvidenceActions {
  if (isLocalMemberMode() && localMemberSignedIn())
    return createLocalInvoiceEvidenceApi();
  const owner = { current: null as string | null };
  async function mutate(
    change: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<FinanceMutationResult> {
    const token = await memberSessionToken(owner);
    const response = await fetch("/api/finance", {
      method: "POST",
      signal,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(change),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new InvoiceEvidenceError(
        typeof body.error === "string"
          ? body.error
          : "Could not access invoice evidence. Please try again.",
        response.status,
      );
    return body as FinanceMutationResult;
  }
  const continuation = createInvoiceContinuation(owner, (change, signal) =>
    mutate(change, signal),
  );
  return {
    open: (documentId) =>
      mutate({
        action: "downloadDocument",
        documentId,
        requestId: crypto.randomUUID(),
      }),
    async retry(documentId, expectedRevision, requestId) {
      const result = await mutate({
        action: "retryInvoiceTransfer",
        documentId,
        expectedRevision,
        requestId,
      });
      if (result.purchaseId)
        continuation.start({ ...result, id: result.purchaseId });
      return result;
    },
    watchSession: (onEnd, onInvoices) => {
      const end = () => {
        continuation.stop();
        onEnd();
      };
      const stop = watchMemberSession(end, undefined, owner);
      const dispose = continuation.watch({
        updated: (result) => onInvoices?.(result),
        accessEnded: end,
      });
      return () => {
        dispose();
        stop();
      };
    },
  };
}
