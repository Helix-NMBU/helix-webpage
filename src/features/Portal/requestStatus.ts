export type RequestStatusKey =
  | "draft"
  | "submitted"
  | "under_review"
  | "input_needed"
  | "approved"
  | "scheduled"
  | "published"
  | "in_progress"
  | "completed"
  | "closed"
  | "cancelled";

export type RequestStatusTone = "neutral" | "info" | "attention" | "success" | "danger";

export type RequestStatusMeta = {
  key: RequestStatusKey;
  label: string;
  tone: RequestStatusTone;
};

export const requestStatusOrder: RequestStatusKey[] = [
  "draft",
  "submitted",
  "under_review",
  "input_needed",
  "approved",
  "scheduled",
  "published",
  "in_progress",
  "completed",
  "closed",
  "cancelled",
];

export const requestStatuses: Record<RequestStatusKey, RequestStatusMeta> = {
  draft: { key: "draft", label: "Draft", tone: "neutral" },
  submitted: { key: "submitted", label: "Submitted", tone: "info" },
  under_review: { key: "under_review", label: "Under review", tone: "info" },
  input_needed: { key: "input_needed", label: "Input needed", tone: "attention" },
  approved: { key: "approved", label: "Approved", tone: "success" },
  scheduled: { key: "scheduled", label: "Scheduled", tone: "info" },
  published: { key: "published", label: "Published", tone: "success" },
  in_progress: { key: "in_progress", label: "In progress", tone: "info" },
  completed: { key: "completed", label: "Completed", tone: "success" },
  closed: { key: "closed", label: "Closed", tone: "neutral" },
  cancelled: { key: "cancelled", label: "Cancelled", tone: "danger" },
};

const sourceStatusToKey: Record<string, RequestStatusKey> = {
  draft: "draft",
  submitted: "submitted",
  requested: "submitted",
  under_review: "under_review",
  quoting: "under_review",
  waiting_for_sponsor: "input_needed",
  changes_requested: "input_needed",
  approved: "approved",
  scheduled: "scheduled",
  published: "published",
  in_progress: "in_progress",
  completed: "completed",
  fulfilled: "completed",
  closed: "closed",
  cancelled: "cancelled",
};

export function getRequestStatus(status: string): RequestStatusMeta {
  return requestStatuses[sourceStatusToKey[status] ?? "closed"];
}
