import {
  isLocalMemberMode,
  localMemberSignedIn,
} from "../MemberPlatform/local-mode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@libs/components/ui/button";
import { Badge } from "@libs/components/ui/badge";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import {
  createInvoiceEvidenceApi,
  type InvoiceEvidenceActions,
} from "./invoice-repository";
import type { ProjectBudgetInvoiceReference } from "./project-budget-types";
import type { InvoiceEvidenceSummary } from "./invoice-types";
export function invoiceEvidenceMessage(
  summary?: InvoiceEvidenceSummary,
): string {
  if (!summary) return "";
  const waiting = summary.pending + summary.transferring;
  if (summary.needsAttention) return "Some invoice transfers need attention.";
  if (waiting) return "Invoice evidence is awaiting confirmed Drive storage.";
  if (summary.stored) return "Invoice evidence is confirmed in Drive.";
  return "";
}
function permittedUrl(value: string | undefined, drive: boolean): string {
  if (!value)
    throw new Error(
      "The invoice is not ready to open. Refresh its evidence status and try again.",
    );
  const url = new URL(value);
  const localBlob =
    !drive &&
    url.protocol === "blob:" &&
    isLocalMemberMode() &&
    localMemberSignedIn() &&
    url.origin === window.location.origin;
  if (
    (!localBlob && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    (drive &&
      (url.hostname !== "drive.google.com" ||
        !url.pathname.startsWith("/file/d/") ||
        [...url.searchParams.keys()].some((key) =>
          /^(access_token|id_token|token|authorization|session)$/i.test(key),
        )))
  )
    throw new Error(
      "The invoice reference is not valid. Refresh its evidence status.",
    );
  return url.href;
}
const labels = {
  pending: "Transfer pending",
  transferring: "Transferring to Drive",
  needs_attention: "Needs attention",
  stored: "Stored in Drive",
};
export function InvoiceEvidence({
  invoice,
  actions: provided,
  onChanged,
  onAccessEnded,
}: {
  invoice: ProjectBudgetInvoiceReference;
  actions?: InvoiceEvidenceActions;
  onChanged?: () => Promise<void>;
  onAccessEnded?: () => void;
}) {
  const actions = useMemo(
    () => provided ?? createInvoiceEvidenceApi(),
    [provided],
  );
  const scope = useMemo(
    () => Symbol("invoice-evidence"),
    [
      actions,
      invoice.documentId,
      invoice.backend,
      invoice.transferStatus,
      invoice.transferRevision,
      invoice.canRetry,
    ],
  );
  const lifetime = useMemo(() => Symbol("invoice-subscription"), [actions, invoice.documentId]);
  const currentLifetime = useRef(lifetime);
  currentLifetime.current = lifetime;
  const refreshLatest = useRef(refresh);
  refreshLatest.current = refresh;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const accessEnded = useRef(false);
  const active = useRef(false),
    epoch = useRef(0),
    working = useRef(false),
    pending = useRef<{ key: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false);
  const callbacks = useRef({ onChanged, onAccessEnded });
  callbacks.current = { onChanged, onAccessEnded };
  const notify = useNotify();
  const notifyLatest = useRef(notify);
  notifyLatest.current = notify;
  const clearPrivateAccess = useCallback(() => {
    if (accessEnded.current) return;
    accessEnded.current = true;
    epoch.current++;
    working.current = false;
    pending.current = null;
    setBusy(false);
    setDenied(true);
    callbacks.current.onAccessEnded?.();
  }, []);
  useEffect(() => {
    active.current = true;
    const stop = actions.watchSession?.(
      () => {
        if (active.current && currentLifetime.current === lifetime) clearPrivateAccess();
      },
      (result) => {
        if (!active.current || accessEnded.current || currentLifetime.current !== lifetime) return;
        const evidence = result.invoiceEvidence;
        if (evidence && evidence.pending + evidence.transferring === 0) {
          notifyLatest.current("Invoice evidence updated", invoiceEvidenceMessage(evidence), {
            id: `invoice-evidence:${invoice.documentId}`, variant: evidence.needsAttention ? "warning" : "success", href: null,
          });
        }
        void refreshLatest.current(epoch.current);
      },
    );
    return () => {
      active.current = false;
      epoch.current++;
      stop?.();
    };
  }, [actions, lifetime, invoice.documentId, clearPrivateAccess]);
  // Metadata changes invalidate foreground operations without cancelling their background transfer.
  useEffect(() => {
    epoch.current++;
    working.current = false;
    setBusy(false);
  }, [scope]);
  const drive = invoice.backend === "google_drive",
    ready = invoice.transferStatus === "stored";
  const canRetry =
    drive &&
    !ready &&
    invoice.canRetry === true &&
    Number.isSafeInteger(invoice.transferRevision) &&
    invoice.transferRevision !== null &&
    invoice.transferRevision !== undefined &&
    invoice.transferRevision >= 0;
  async function refresh(operation: number) {
    if (
      !active.current ||
      currentScope.current !== scope ||
      epoch.current !== operation
    )
      return;
    try {
      await callbacks.current.onChanged?.();
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      if (active.current && currentLifetime.current === lifetime && (status === 401 || status === 403)) {
        clearPrivateAccess();
        notify("Invoice access ended", "Your invoice access is no longer available.", { variant: "error", href: null });
        return;
      }
      if (
        active.current &&
        currentScope.current === scope &&
        epoch.current === operation
      ) {
        notify(
          "Could not refresh invoice evidence",
          error instanceof Error ? error.message : "Please refresh the budget.",
          {
            variant: "error",
            href: null,
            action: {
              label: "Refresh",
              onClick: () => {
                if (
                  active.current &&
                  currentScope.current === scope &&
                  epoch.current === operation
                )
                  void refresh(operation);
              },
            },
          },
        );
      }
    }
  }
  async function run(mode: "open" | "retry") {
    if (
      working.current ||
      !active.current ||
      currentScope.current !== scope ||
      accessEnded.current || denied ||
      (mode === "open" && !ready) ||
      (mode === "retry" && !canRetry)
    )
      return;
    const operation = ++epoch.current;
    working.current = true;
    setBusy(true);
    try {
      if (mode === "open") {
        const result = await actions.open(invoice.documentId);
        if (
          !active.current ||
          currentScope.current !== scope ||
          epoch.current !== operation
        )
          return;
        const link = document.createElement("a");
        link.href = permittedUrl(
          drive ? result.viewerUrl : result.downloadUrl,
          drive,
        );
        link.rel = "noopener noreferrer";
        if (drive) link.target = "_blank";
        else link.download = invoice.originalName;
        link.click();
      } else {
        const key = `${invoice.documentId}:${invoice.transferRevision}`;
        if (pending.current?.key !== key)
          pending.current = { key, id: crypto.randomUUID() };
        const result = await actions.retry(
          invoice.documentId,
          invoice.transferRevision!,
          pending.current.id,
        );
        if (
          !active.current ||
          currentScope.current !== scope ||
          epoch.current !== operation
        )
          return;
        pending.current = null;
        notify(
          "Invoice transfer updated",
          invoiceEvidenceMessage(result.invoiceEvidence) ||
            "The transfer was checked. Refreshing its current evidence status.",
          {
            variant: result.invoiceEvidence?.needsAttention
              ? "warning"
              : "success",
            href: null,
          },
        );
        await refresh(operation);
      }
    } catch (error) {
      if (!active.current || currentLifetime.current !== lifetime) return;
      const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
      if (status === 401 || status === 403) clearPrivateAccess();
      else if (currentScope.current !== scope || epoch.current !== operation) return;
      notify(
        mode === "open"
          ? "Could not open invoice"
          : "Could not retry invoice transfer",
        error instanceof Error ? error.message : "Please try again.",
        {
          variant: "error",
          href: null,
          ...(status === 401 || status === 403
            ? {}
            : {
                action: {
                  label: status === 409 ? "Refresh evidence" : "Try again",
                  onClick: () => {
                    if (
                      active.current &&
                      currentScope.current === scope &&
                      epoch.current === operation
                    ) {
                      if (status === 409) void refresh(operation);
                      else void run(mode);
                    }
                  },
                },
              }),
        },
      );
    } finally {
      if (
        active.current &&
        currentScope.current === scope &&
        epoch.current === operation
      ) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  if (denied) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      aria-label={`Evidence for ${invoice.originalName}`}
    >
      <span>{invoice.originalName}</span>
      {(drive || !ready) && (
        <Badge variant="secondary">
          {drive
            ? labels[invoice.transferStatus]
            : invoice.transferStatus === "needs_attention"
              ? "Needs attention"
              : "Evidence pending"}
        </Badge>
      )}
      {ready && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run("open")}
        >
          {drive ? "Open invoice" : "Download"}
        </Button>
      )}
      {canRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run("retry")}
        >
          Retry invoice transfer
        </Button>
      )}
    </div>
  );
}
