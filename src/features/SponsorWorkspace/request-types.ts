import type { RequestStatus, RequestType } from "./requests.js";

export type RequestAdmin = { id: string; email: string };
export type RequestSummary = {
  id: string; organizationId: string; organizationName: string;
  type: RequestType; title: string; status: RequestStatus; revision: number;
  assignedAdminId: string | null; assignedAdminName: string | null;
  createdAt: string; updatedAt: string;
};
export type RequestReply = { id: string; authorEmail: string; actor: "sponsor" | "admin"; body: string; createdAt: string };
export type RequestHistory = {
  id: string; revision: number; actorEmail: string; kind: "created" | "assigned" | "status" | "reply";
  fromStatus: RequestStatus | null; toStatus: RequestStatus | null; assignedAdminEmail: string | null; createdAt: string;
};
export type RequestDetail = RequestSummary & { body: string; authorEmail: string; replies: RequestReply[]; history: RequestHistory[] };
export type RequestList = { requests: RequestSummary[]; administrators: RequestAdmin[] };
