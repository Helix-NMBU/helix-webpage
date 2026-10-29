import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MemberCvError, neonCvServices, type CvServices } from "./_lib/member-cv-service.js";
import { memberAccount } from "./_lib/member-account.js";
import { createWorkspaceHandler } from "./_lib/workspace-handler.js";
import { createSeasonFinancialHandler } from "./_lib/season-financials-handler.js";
import { createProjectHandler } from "./_lib/project-management-handler.js";
import { partnerInvoiceRunner } from "./_lib/partner-invoice-runner.js";
import { createDealHandler } from "./_lib/partner-deals-handler.js";

export type MemberSessionReason = "no_session_cookie" | "session_lookup_failed" | "domain_rejected" | "db_error" | "missing_env";

export class MemberSessionFailure extends MemberCvError {
  constructor(
    status: number,
    message: string,
    public reason: MemberSessionReason,
    public upstreamStatus?: number,
  ) {
    super(status, message);
  }
}

type HeaderBag = VercelRequest["headers"] | { authorization?: string };

function authorizationHeader(headers: HeaderBag): string | undefined {
  const bag = headers as Record<string, unknown>;
  const value = bag.authorization ?? bag.Authorization;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ");
  return undefined;
}

export async function sessionTokenFromRequest(headers: HeaderBag): Promise<string> {
  const bearer = authorizationHeader(headers)?.match(/^Bearer ([^\s]+)$/i);
  if (bearer?.[1]) return bearer[1];
  throw new MemberSessionFailure(401, "Log in to continue.", "no_session_cookie");
}

function failureOf(error: unknown): MemberSessionFailure {
  if (error instanceof MemberSessionFailure) return error;
  if (error instanceof MemberCvError) {
    if (error.status === 403) return new MemberSessionFailure(403, error.message, "domain_rejected");
    if (error.status === 401) return new MemberSessionFailure(401, error.message, "session_lookup_failed");
    if (error.status === 503 && /configuration is missing|not configured/i.test(error.message)) {
      return new MemberSessionFailure(503, error.message, "missing_env");
    }
    return new MemberSessionFailure(error.status, error.message, "db_error");
  }
  return new MemberSessionFailure(503, "Member sign-in is temporarily unavailable. Try again.", "db_error");
}

export function createMemberLoginHandler(
  getServices: () => CvServices = neonCvServices,
  lookup: typeof sessionTokenFromRequest = sessionTokenFromRequest,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const token = await lookup(req.headers);
      const identity = await getServices().authenticate(token);
      return res.status(200).json({ ok: true, email: identity.email, account: memberAccount(identity) });
    } catch (error) {
      const failure = failureOf(error);
      console.error("Member session bootstrap failed.", {
        reason: failure.reason,
        status: failure.upstreamStatus ?? failure.status,
      });
      return res.status(failure.status).json({ error: failure.message });
    }
  };
}

const memberSessionHandler = createMemberLoginHandler();
const projectHandler = createProjectHandler();
const dealHandler = createDealHandler();
const seasonFinancialHandler = createSeasonFinancialHandler();
const workspaceHandler = createWorkspaceHandler();

// Keep the member API within the Hobby function budget. The public project URL
// rewrites here; each module still performs its own authentication and grants.
export default function memberApi(req: VercelRequest, res: VercelResponse) {
  if (req.query?.__module === "partner-invoice-runner") return partnerInvoiceRunner(req,res);
  if (req.query?.__module === "partner-deals") return dealHandler(req, res);
  if (req.query?.__module === "season-financials") return seasonFinancialHandler(req, res);
  if (req.query?.__module === "workspace") return workspaceHandler(req,res);
  return req.query?.__module === "projects" ? projectHandler(req, res) : memberSessionHandler(req, res);
}
