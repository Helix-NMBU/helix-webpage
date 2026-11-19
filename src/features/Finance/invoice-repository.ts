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
  watchSession?(onEnd: () => void): () => void;
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
  ): Promise<FinanceMutationResult> {
    const token = await memberSessionToken(owner);
    const response = await fetch("/api/finance", {
      method: "POST",
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
  return {
    open: (documentId) =>
      mutate({
        action: "downloadDocument",
        documentId,
        requestId: crypto.randomUUID(),
      }),
    retry: (documentId, expectedRevision, requestId) =>
      mutate({
        action: "retryInvoiceTransfer",
        documentId,
        expectedRevision,
        requestId,
      }),
    watchSession: (onEnd) => watchMemberSession(onEnd, undefined, owner),
  };
}
