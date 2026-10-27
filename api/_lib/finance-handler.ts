import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FinanceError } from "./finance-error.js";
import { neonFinanceServices, type FinanceServices } from "./finance-service.js";
import { FINANCE_READ_ACTIONS, type FinanceReadAction } from "./finance-types.js";
import { MemberCvError } from "./member-cv-error.js";
import { bearer } from "./member-cv-service.js";

export const MAX_FINANCE_BODY_BYTES = 2 * 1024 * 1024;

function knownVersion(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new FinanceError(400, "Invalid view version.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new FinanceError(400, "Invalid view version.");
  return parsed;
}

function financeBody(value: unknown, contentLength?: number): Record<string, unknown> {
  if (contentLength !== undefined && contentLength > MAX_FINANCE_BODY_BYTES) throw new FinanceError(413, "The request is too large.");
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  if (Buffer.byteLength(raw) > MAX_FINANCE_BODY_BYTES) throw new FinanceError(413, "The request is too large.");
  let body = value;
  if (typeof value === "string") {
    try { body = JSON.parse(value) as unknown; } catch { throw new FinanceError(400, "Invalid JSON request."); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FinanceError(400, "Invalid request.");
  return body as Record<string, unknown>;
}

export function createFinanceHandler(getServices: () => FinanceServices = neonFinanceServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const token = bearer(req.headers.authorization);
      const services = getServices();
      if (req.method === "GET") {
        const action = req.query.action;
        if (typeof action !== "string" || !FINANCE_READ_ACTIONS.includes(action as FinanceReadAction)) throw new FinanceError(400, "Unknown request.");
        const version = knownVersion(req.query.knownVersion);
        if (action === "capabilities") return res.status(200).json(await services.capabilities(token));
        if (action === "version") return res.status(200).json(await services.version(token, version));
        if (action === "overview") return res.status(200).json(await services.overview(token, version));
        if (action === "budgets") return res.status(200).json(await services.budgets(token, version));
        if (action === "purchases") {
          const requestRecordId = typeof req.query.requestRecordId === "string" ? req.query.requestRecordId : undefined;
          return res.status(200).json(await services.purchases(token, version, requestRecordId));
        }
        return res.status(200).json(await services.financing(token, version));
      }
      const length = Number(req.headers["content-length"]);
      const body = financeBody(req.body, Number.isFinite(length) ? length : undefined);
      return res.status(200).json(await services.mutate(token, body));
    } catch (error) {
      if (error instanceof FinanceError || error instanceof MemberCvError) {
        const errors = error instanceof FinanceError ? error.errors : undefined;
        return res.status(error.status).json(errors?.length ? { error: error.message, errors } : { error: error.message });
      }
      return res.status(503).json({ error: "The finance service is temporarily unavailable. Please try again." });
    }
  };
}
