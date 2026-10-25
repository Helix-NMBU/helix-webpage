export const REQUEST_TYPES = ["general_collaboration", "thesis_project", "recruitment"] as const;
export type RequestType = typeof REQUEST_TYPES[number];
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  general_collaboration: "General collaboration",
  thesis_project: "Thesis/project proposal",
  recruitment: "Recruitment enquiry",
};

export const REQUEST_STATUSES = ["submitted", "under_review", "input_needed", "completed", "declined", "cancelled"] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted", under_review: "Under review", input_needed: "Input needed",
  completed: "Completed", declined: "Declined", cancelled: "Cancelled",
};
export type RequestActor = "sponsor" | "admin";
export type RequestDraft = { type: RequestType; title: string; body: string };
export const REQUEST_TITLE_LIMIT = 160;
export const REQUEST_BODY_LIMIT = 10_000;

export class RequestWorkflowError extends Error {
  constructor(public readonly status: 400 | 403 | 409, message: string) {
    super(message);
    this.name = "RequestWorkflowError";
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestWorkflowError(400, "Send a request object.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, limit: number): string {
  if (typeof value !== "string") throw new RequestWorkflowError(400, `${label} is required.`);
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned || cleaned.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) {
    throw new RequestWorkflowError(400, `${label} must contain 1 to ${limit} characters and no control characters.`);
  }
  return cleaned;
}

export function validateRequestDraft(value: unknown): RequestDraft {
  const input = object(value);
  if (Object.keys(input).some((key) => !["type", "title", "body"].includes(key))) {
    throw new RequestWorkflowError(400, "Only request type, title and message can be submitted.");
  }
  if (!REQUEST_TYPES.includes(input.type as RequestType)) throw new RequestWorkflowError(400, "Choose a request type.");
  const title = text(input.title, "Title", REQUEST_TITLE_LIMIT);
  if (/[\n\t]/.test(title)) throw new RequestWorkflowError(400, "Title must be a single line.");
  return { type: input.type as RequestType, title, body: text(input.body, "Message", REQUEST_BODY_LIMIT) };
}

export function validateRequestReply(value: unknown): string {
  return text(value, "Reply", REQUEST_BODY_LIMIT);
}

export function validateExpectedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RequestWorkflowError(400, "A valid saved revision is required. Reload the request and try again.");
  }
  return value;
}

export function assertRequestRevision(actual: number, expected: unknown): void {
  if (actual !== validateExpectedRevision(expected)) {
    throw new RequestWorkflowError(409, "This request changed in another session. Reload it before trying again.");
  }
}

export function isTerminalRequest(status: RequestStatus): boolean {
  return status === "completed" || status === "declined" || status === "cancelled";
}

const ADMIN_TRANSITIONS: Partial<Record<RequestStatus, readonly RequestStatus[]>> = {
  submitted: ["under_review", "input_needed", "declined"],
  under_review: ["input_needed", "completed", "declined"],
  input_needed: ["under_review", "completed", "declined"],
};

/** Organization access and active administrator assignment are checked by the server. */
export function assertRequestTransition(current: RequestStatus, next: unknown, actor: RequestActor): asserts next is RequestStatus {
  if (!REQUEST_STATUSES.includes(next as RequestStatus)) throw new RequestWorkflowError(400, "Choose a valid request status.");
  if (!REQUEST_STATUSES.includes(current) || isTerminalRequest(current)) {
    throw new RequestWorkflowError(409, "Closed requests are read-only. Submit a new request to continue.");
  }
  const allowed = actor === "sponsor" ? next === "cancelled"
    : actor === "admin" && Boolean(ADMIN_TRANSITIONS[current]?.includes(next as RequestStatus));
  if (!allowed) throw new RequestWorkflowError(403, "This status change is not allowed.");
}

/** A sponsor reply answers an outstanding input request and returns it to review. */
export function statusAfterRequestReply(current: RequestStatus, actor: RequestActor): RequestStatus {
  if (!REQUEST_STATUSES.includes(current) || isTerminalRequest(current)) {
    throw new RequestWorkflowError(409, "Closed requests are read-only. Submit a new request to continue.");
  }
  if (actor !== "sponsor" && actor !== "admin") throw new RequestWorkflowError(403, "Request access is required.");
  return current === "input_needed" && actor === "sponsor" ? "under_review" : current;
}
