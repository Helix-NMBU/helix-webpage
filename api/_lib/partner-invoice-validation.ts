import { MemberCvError } from "./member-cv-error.js";
import type { InvoiceProgressInput } from "../../src/features/PartnerDeals/invoice-progress-types.js";

export function parseInvoiceProgress(value: unknown): InvoiceProgressInput {
  const invalid = (): never => { throw new MemberCvError(400, "Choose valid invoice dates and reload the task before saving."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (typeof input.taskId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.taskId)) return invalid();
  const revision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < 2147483647;
  if (!revision(input.expectedRevision) || input.fundingRevision !== null && !revision(input.fundingRevision)) return invalid();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  function date(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "2000-01-01" || value > today) return invalid();
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid();
    return value;
  }
  return { taskId: input.taskId, expectedRevision: input.expectedRevision, fundingRevision: input.fundingRevision, sentDate: date(input.sentDate), receivedDate: date(input.receivedDate) };
}
