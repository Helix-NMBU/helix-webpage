import { escapeHtml } from "./email.js";
import type { CvDatabase } from "./member-cv-service.js";
import { formatOre } from "./finance-money.js";
import {
  FINANCE_SIGN_IN_LINE,
  approvalSubjectPrefix,
  budgetStatusLabel,
  readDbBoolean,
  deliveryTextHasPrivateMaterial,
  invoiceSubjectPrefix,
} from "../../src/features/Finance/export-text.js";

export const FINANCE_MAX_DELIVERY_ATTEMPTS = 5;
export const FINANCE_DELIVERY_BATCH = 25;

export type FinanceMailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type FinanceMailSendResult =
  | { outcome: "sent"; providerMessageId: string }
  | { outcome: "failed"; safeError: FinanceSafeError }
  | { outcome: "uncertain"; safeError: FinanceSafeError };

export type FinanceSafeError =
  | "recipient_not_allowlisted"
  | "delivery_disabled"
  | "recipient_inactive"
  | "recipient_email_missing"
  | "compose_failed"
  | "provider_rejected"
  | "provider_unknown"
  | "attempt_bound"
  | "reconciled_not_sent";

export type FinanceMailSender = (message: FinanceMailMessage) => Promise<FinanceMailSendResult>;

export type FinanceDeliveryDecision =
  | { deliver: true }
  | { deliver: false; safeError: FinanceSafeError };

const SAFE_ERRORS = new Set<FinanceSafeError>([
  "recipient_not_allowlisted",
  "delivery_disabled",
  "recipient_inactive",
  "recipient_email_missing",
  "compose_failed",
  "provider_rejected",
  "provider_unknown",
  "attempt_bound",
  "reconciled_not_sent",
]);

export function isFinanceSafeError(value: string): value is FinanceSafeError {
  return SAFE_ERRORS.has(value as FinanceSafeError);
}

export function localDeliveryDecision(env: NodeJS.ProcessEnv, email: string): FinanceDeliveryDecision {
  const enabled = env.WEBSITE_EMAIL_ENABLED === "true" && Boolean(env.RESEND_API_KEY);
  if (!enabled) return { deliver: false, safeError: "delivery_disabled" };
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { deliver: false, safeError: "recipient_email_missing" };
  if (env.HELIX_ENVIRONMENT === "production") return { deliver: true };
  const local = env.HELIX_ENVIRONMENT === "local" || env.HELIX_ENVIRONMENT === "development";
  if (!local) return { deliver: false, safeError: "delivery_disabled" };
  const allowed = (env.WEBSITE_EMAIL_TEST_RECIPIENTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(normalized)) return { deliver: false, safeError: "recipient_not_allowlisted" };
  return { deliver: true };
}

export function createLiveFinanceSender(env: NodeJS.ProcessEnv = process.env): FinanceMailSender {
  return async (message) => {
    const decision = localDeliveryDecision(env, message.to);
    if (!decision.deliver) return { outcome: "failed", safeError: decision.safeError };
    try {
      const { Resend } = await import("resend");
      const result = await new Resend(env.RESEND_API_KEY).emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }, { idempotencyKey: message.idempotencyKey });
      const messageId = result.data?.id ?? "";
      if (result.error || !/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
        return { outcome: "uncertain", safeError: "provider_unknown" };
      }
      return { outcome: "sent", providerMessageId: messageId };
    } catch {
      return { outcome: "uncertain", safeError: "provider_unknown" };
    }
  };
}

type RecipientRow = { email: string | null; active_head: boolean; active_finance: boolean };
type PurchaseRow = {
  public_ref: string;
  buyer_name: string;
  supplier_name: string;
  payment_method: string;
  purchase_date: string;
  justification: string;
  document_kind: string;
  status: string;
  total_ore: string;
};
type LineRow = {
  public_ref: string;
  description: string;
  quantity: string;
  amount_ore: string;
  unbudgeted: boolean;
  system_code: string | null;
  effective_plan_ore: string | null;
  actual_ore: string | null;
};
type DocumentNameRow = { original_name: string };
type InvoiceRow = { due_date: string | null; paid: boolean };
type ExceptionRow = { kind: string; threshold_ore: string | null };

function fromAddress(env: NodeJS.ProcessEnv): string {
  return `Helix NMBU <${env.CONTACT_FROM_EMAIL || "no-reply@helixnmbu.no"}>`;
}

function paragraph(lines: string[]): { text: string; html: string } {
  const text = [...lines, "", FINANCE_SIGN_IN_LINE].join("\n");
  const html = `${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p>${escapeHtml(FINANCE_SIGN_IN_LINE)}</p>`;
  if (deliveryTextHasPrivateMaterial(text) || deliveryTextHasPrivateMaterial(html)) {
    throw new Error("compose_failed");
  }
  return { text, html };
}

async function recipient(db: CvDatabase, memberId: string): Promise<RecipientRow | null> {
  const rows = await db.query<RecipientRow>(
    `select m.email,
            coalesce((finance.capability_flags(m.id) ->> 'decideRequests')::boolean, false) as active_head,
            coalesce((finance.capability_flags(m.id) ->> 'purchaseRegister')::boolean, false) as active_finance
     from identity.members m
     where m.id = $1::uuid`,
    [memberId],
  );
  return rows.rows[0] ?? null;
}

export async function composeFinanceMail(
  db: CvDatabase,
  env: NodeJS.ProcessEnv,
  claimed: {
    eventType: string;
    entity: string;
    entityId: string;
    recipientMemberId: string | null;
    providerIdempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<{ message: FinanceMailMessage } | { safeError: FinanceSafeError }> {
  if (!claimed.recipientMemberId) return { safeError: "recipient_email_missing" };
  const person = await recipient(db, claimed.recipientMemberId);
  if (!person?.email) return { safeError: "recipient_email_missing" };
  const from = fromAddress(env);
  if (claimed.eventType === "request.submitted") {
    if (!person.active_head) return { safeError: "recipient_inactive" };
    const request = await loadRequest(db, claimed.entityId);
    if (!request) return { safeError: "compose_failed" };
    const body = paragraph([
      `Purchase request ${request.public_ref} was submitted.`,
      "Open the request after you sign in. This message does not include a file link.",
    ]);
    return { message: { from, to: person.email, subject: `Purchase request ${request.public_ref} submitted`, ...body, idempotencyKey: claimed.providerIdempotencyKey } };
  }
  if (claimed.eventType === "request.decided") {
    const revisionId = typeof claimed.payload.revisionId === "string" ? claimed.payload.revisionId : "";
    const request = await loadDecision(db, claimed.entityId, revisionId);
    if (!request || request.requester_id !== claimed.recipientMemberId) return { safeError: "recipient_inactive" };
    const decision = request.decision === "approved" || request.decision === "rejected" ? request.decision : "recorded";
    const body = paragraph([
      `Purchase request ${request.public_ref} was ${decision}.`,
      "Open the request after you sign in. This message does not include a file link.",
    ]);
    return { message: { from, to: person.email, subject: `Purchase request ${request.public_ref} ${decision}`, ...body, idempotencyKey: claimed.providerIdempotencyKey } };
  }
  if (claimed.eventType === "purchase_registered") {
    if (!person.active_finance) return { safeError: "recipient_inactive" };
    const composed = await composeRegistration(db, claimed.entityId);
    if (!composed) return { safeError: "compose_failed" };
    return { message: { from, to: person.email, ...composed, idempotencyKey: claimed.providerIdempotencyKey } };
  }
  return { safeError: "compose_failed" };
}

async function loadRequest(db: CvDatabase, requestId: string): Promise<{ public_ref: string } | null> {
  const rows = await db.query<{ public_ref: string }>(
    "select public_ref from finance.requests where id = $1::uuid",
    [requestId],
  );
  return rows.rows[0] ?? null;
}

async function loadDecision(db: CvDatabase, requestId: string, revisionId: string): Promise<{ public_ref: string; requester_id: string; decision: string | null } | null> {
  const rows = await db.query<{ public_ref: string; requester_id: string; decision: string | null }>(
    `select r.public_ref, r.requester_member_id::text as requester_id, d.decision
     from finance.requests r
     left join finance.request_decisions d on d.revision_id = $2::uuid
     where r.id = $1::uuid`,
    [requestId, /^[0-9a-f-]{36}$/i.test(revisionId) ? revisionId : "00000000-0000-4000-8000-000000000000"],
  );
  return rows.rows[0] ?? null;
}

async function composeRegistration(db: CvDatabase, purchaseId: string): Promise<{ subject: string; text: string; html: string } | null> {
  const purchaseRows = await db.query<PurchaseRow>(
    `select p.public_ref, p.buyer_name, p.supplier_name, p.payment_method,
            p.purchase_date::text as purchase_date, p.justification, p.document_kind, p.status,
            coalesce(sum(l.amount_ore), 0)::text as total_ore
     from finance.purchases p
     left join finance.purchase_lines l on l.purchase_id = p.id
     where p.id = $1::uuid
     group by p.id`,
    [purchaseId],
  );
  const purchase = purchaseRows.rows[0];
  if (!purchase) return null;
  const lines = (await db.query<LineRow>(
    `select l.public_ref, l.description, l.quantity::text as quantity, l.amount_ore::text as amount_ore,
            l.unbudgeted, s.code as system_code,
            case
              when i.id is null then null
              when i.status = 'cancelled' or i.protected then '0'
              else i.planned_ore::text
            end as effective_plan_ore,
            case when i.id is null then null else finance.item_registered_actual_ore(i.id)::text end as actual_ore
     from finance.purchase_lines l
     join finance.systems s on s.id = l.system_id
     left join finance.budget_items i on i.id = l.budget_item_id
     where l.purchase_id = $1::uuid
     order by l.public_ref`,
    [purchaseId],
  )).rows;
  const documents = (await db.query<DocumentNameRow>(
    "select original_name from finance.documents where purchase_id = $1::uuid order by public_ref",
    [purchaseId],
  )).rows;
  const invoice = (await db.query<InvoiceRow>(
    "select due_date::text as due_date, paid from finance.invoice_obligations where purchase_id = $1::uuid",
    [purchaseId],
  )).rows[0];
  const exceptions = (await db.query<ExceptionRow>(
    `select kind, facts ->> 'thresholdOre' as threshold_ore
     from finance.exception_reviews
     where purchase_id = $1::uuid
     order by created_at, id`,
    [purchaseId],
  )).rows;
  const setting = (await db.query<{ threshold_ore: string | null }>(
    "select setting_value #>> '{}' as threshold_ore from finance.settings where setting_key = 'approval_threshold_ore'",
  )).rows[0];
  const registrationThreshold = exceptions.find((row) => row.kind === "missing_approval" && /^[0-9]+$/.test(row.threshold_ore ?? ""))?.threshold_ore;
  const thresholdOre = registrationThreshold ?? (setting?.threshold_ore && /^[0-9]+$/.test(setting.threshold_ore) ? setting.threshold_ore : null);
  const totalOre = BigInt(purchase.total_ore);
  const aboveLimit = thresholdOre !== null && totalOre > BigInt(thresholdOre);
  const thresholdNok = thresholdOre ? formatOre(BigInt(thresholdOre)) : "";
  const unpaidInvoice = purchase.payment_method === "invoice" && purchase.status === "registered" && readDbBoolean(invoice?.paid) !== true;
  const prefixes = [invoiceSubjectPrefix(unpaidInvoice), approvalSubjectPrefix(aboveLimit, thresholdNok)].filter(Boolean);
  const subject = `${prefixes.join(" ")} Purchase ${purchase.public_ref} registered`.trim();
  const lineText = lines.map((line) => {
    const status = budgetStatusLabel({
      unbudgeted: readDbBoolean(line.unbudgeted) === true,
      actualOre: BigInt(line.actual_ore ?? "0"),
      effectivePlanOre: BigInt(line.effective_plan_ore ?? "0"),
    });
    return `${line.public_ref}: ${line.description}; quantity ${line.quantity}; NOK ${formatOre(BigInt(line.amount_ore))}; budget ${status} (current); system ${line.system_code ?? ""}`;
  });
  const warnings: string[] = [];
  if (lines.some((line) => line.unbudgeted)) warnings.push("At least one line is not in the budget.");
  if (lineText.some((line) => line.includes("budget over_budget"))) warnings.push("At least one line is over the current budget.");
  if (aboveLimit) warnings.push(`This purchase is above the approval limit of NOK ${thresholdNok}.`);
  for (const exception of exceptions) {
    if (exception.kind === "missing_approval" && !aboveLimit) warnings.push("Registered without a prior approval.");
    if (exception.kind === "overrun") warnings.push("A linked approval was exceeded.");
    if (exception.kind === "line_mismatch") warnings.push("A line does not match its approval.");
    if (exception.kind === "dated_before_approval") warnings.push("The purchase date is before the approval date.");
  }
  const names = documents.map((row) => row.original_name).filter(Boolean);
  const body = paragraph([
    `Reference ${purchase.public_ref}`,
    `Buyer ${purchase.buyer_name}`,
    `Supplier ${purchase.supplier_name}`,
    `Date ${purchase.purchase_date}`,
    `Payment ${purchase.payment_method}`,
    `Document ${purchase.document_kind}`,
    invoice?.due_date ? `Due ${invoice.due_date}` : "Due date not set",
    `Justification ${purchase.justification}`,
    `Total NOK ${formatOre(totalOre)}`,
    ...lineText,
    warnings.length ? `Warnings: ${warnings.join(" ")}` : "Warnings: none",
    names.length ? `Documents: ${names.join(", ")}` : "Documents: none",
    "Supporting files stay in Helix. This message has no download link.",
  ]);
  return { subject, ...body };
}
