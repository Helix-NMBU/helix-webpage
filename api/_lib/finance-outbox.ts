import type { CvDatabase } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import {
  FINANCE_DELIVERY_BATCH,
  FINANCE_MAX_DELIVERY_ATTEMPTS,
  composeFinanceMail,
  isFinanceSafeError,
  localDeliveryDecision,
  type FinanceMailSender,
  type FinanceSafeError,
} from "./finance-mail.js";
import { financeLogLine } from "../../src/features/Finance/export-text.js";

export type FinanceLog = (line: string) => void;

export type ClaimedDelivery = {
  outbox_id: string;
  claim_token: string;
  attempt_no: number;
  event_type: string;
  entity: string;
  entity_id: string;
  recipient_member_id: string | null;
  provider_idempotency_key: string;
};

export type DeliveryCounts = { sent: number; failed: number; uncertain: number; skipped: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(logger: FinanceLog | undefined, fields: Record<string, string>) {
  logger?.(financeLogLine(fields));
}

export async function claimOutboxDeliveries(db: CvDatabase, limit = FINANCE_DELIVERY_BATCH, outboxId?: string): Promise<ClaimedDelivery[]> {
  const result = await db.query<ClaimedDelivery>(
    "select * from finance.claim_outbox_deliveries($1::integer, $2::integer, $3::uuid)",
    [limit, FINANCE_MAX_DELIVERY_ATTEMPTS, outboxId ?? null],
  );
  return result.rows;
}

export async function recordDeliveryResult(
  db: CvDatabase,
  claimToken: string,
  outcome: "sent" | "failed" | "uncertain",
  providerMessageId: string | null,
  safeError: FinanceSafeError | null,
): Promise<void> {
  await db.query(
    "select finance.record_delivery_result($1::uuid, $2, $3, $4)",
    [claimToken, outcome, providerMessageId, safeError],
  );
}

export async function reconcileOutboxDelivery(db: CvDatabase, outboxId: string, observation: "sent" | "not_sent" | "still_unknown"): Promise<string> {
  const result = await db.query<{ result: { status?: string } | string }>(
    "select finance.reconcile_outbox_delivery($1::uuid, $2) as result",
    [outboxId, observation],
  );
  const value = result.rows[0]?.result;
  const parsed = typeof value === "string" ? JSON.parse(value) as { status?: string } : value;
  return parsed?.status ?? observation;
}

async function payloadFor(db: CvDatabase, outboxId: string): Promise<Record<string, unknown>> {
  const rows = await db.query<{ payload: Record<string, unknown> | string }>(
    "select payload from finance.outbox where id = $1::uuid",
    [outboxId],
  );
  const payload = rows.rows[0]?.payload;
  if (!payload) return {};
  return typeof payload === "string" ? JSON.parse(payload) as Record<string, unknown> : payload;
}

export async function deliverClaimed(
  db: CvDatabase,
  claimed: ClaimedDelivery[],
  deps: { send: FinanceMailSender; env: NodeJS.ProcessEnv; log?: FinanceLog },
): Promise<DeliveryCounts> {
  const counts: DeliveryCounts = { sent: 0, failed: 0, uncertain: 0, skipped: 0 };
  for (const row of claimed) {
    let outcome: "sent" | "failed" | "uncertain" = "uncertain";
    let safeError: FinanceSafeError | null = "provider_unknown";
    let providerMessageId: string | null = null;
    let composed: Awaited<ReturnType<typeof composeFinanceMail>> | null = null;
    try {
      composed = await composeFinanceMail(db, deps.env, {
        eventType: row.event_type,
        entity: row.entity,
        entityId: row.entity_id,
        recipientMemberId: row.recipient_member_id,
        providerIdempotencyKey: row.provider_idempotency_key,
        payload: await payloadFor(db, row.outbox_id),
      });
    } catch (error) {
      outcome = error instanceof Error && error.message === "compose_failed" ? "failed" : "uncertain";
      safeError = outcome === "failed" ? "compose_failed" : "provider_unknown";
    }
    if (composed && "safeError" in composed) {
      outcome = "failed";
      safeError = composed.safeError;
    } else if (composed) {
      const decision = localDeliveryDecision(deps.env, composed.message.to);
      if (!decision.deliver) {
        outcome = "failed";
        safeError = decision.safeError;
      } else {
        try {
          const sent = await deps.send(composed.message);
          outcome = sent.outcome;
          if (sent.outcome === "sent") {
            providerMessageId = sent.providerMessageId;
            safeError = null;
          } else {
            safeError = isFinanceSafeError(sent.safeError) ? sent.safeError : "provider_unknown";
          }
        } catch {
          outcome = "uncertain";
          safeError = "provider_unknown";
        }
      }
    }
    try {
      await recordDeliveryResult(db, row.claim_token, outcome, providerMessageId, safeError);
    } catch {
      outcome = "uncertain";
      safeError = "provider_unknown";
    }
    counts[outcome] += 1;
    log(deps.log, {
      event: "finance_delivery",
      outbox: row.outbox_id,
      type: row.event_type,
      outcome,
      error: safeError ?? "none",
    });
  }
  return counts;
}

export async function deliverPending(
  db: CvDatabase,
  deps: { send: FinanceMailSender; env: NodeJS.ProcessEnv; log?: FinanceLog; outboxId?: string },
): Promise<DeliveryCounts> {
  if (deps.outboxId) {
    if (!UUID.test(deps.outboxId)) throw new FinanceError(400, "A valid delivery ID is required.");
    const rows = await db.query<{ status: string }>(
      "select status from finance.outbox where id = $1::uuid",
      [deps.outboxId],
    );
    const status = rows.rows[0]?.status;
    if (!status) throw new FinanceError(404, "Delivery attempt not found.");
    if (status === "uncertain") throw new FinanceError(409, "Reconcile the unknown delivery before retrying.");
    if (status === "sent") return { sent: 0, failed: 0, uncertain: 0, skipped: 1 };
  }
  const claimed = await claimOutboxDeliveries(db, FINANCE_DELIVERY_BATCH, deps.outboxId);
  if (deps.outboxId && claimed.length === 0) {
    const bound = await db.query<{ attempt_count: string }>(
      "select attempt_count::text as attempt_count from finance.outbox where id = $1::uuid",
      [deps.outboxId],
    );
    if (Number(bound.rows[0]?.attempt_count ?? "0") >= FINANCE_MAX_DELIVERY_ATTEMPTS) {
      throw new FinanceError(409, "This delivery has reached the retry bound.");
    }
    return { sent: 0, failed: 0, uncertain: 0, skipped: 1 };
  }
  return deliverClaimed(db, claimed, deps);
}
