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
        if (action === "managementPurchases" && services.managementPurchases) return res.status(200).json(await services.managementPurchases(token));
        if (typeof action !== "string" || !FINANCE_READ_ACTIONS.includes(action as FinanceReadAction)) throw new FinanceError(400, "Unknown request.");
        const version = knownVersion(req.query.knownVersion);
        if(action==="departmentHomeBudget")return res.status(200).json(await services.departmentHomeBudget(token,req.query.departmentId));
        if(action==="departmentBudgetPreview")return res.status(200).json(await services.departmentBudgetPreview(token,req.query.departmentId));
        if(action==="departmentBudgetPackages")return res.status(200).json(await services.departmentBudgetPackages(token,req.query.departmentId));
        if(action==="departmentBudgetPackage")return res.status(200).json(await services.departmentBudgetPackage(token,req.query.packageId));
        if (action === "fundingApplications") return res.status(200).json(await services.fundingApplications(token));
        if (action === "fundingApplication") return res.status(200).json(await services.fundingApplication(token, req.query.applicationId));
        if (action === "fundingApplicationBudgetContext") return res.status(200).json(await services.fundingApplicationBudgetContext(token, req.query.applicationId));
        if (action === "projectFundingProposals") return res.status(200).json(await services.projectFundingProposals(token, req.query.projectBudgetId));
        if (action === "projectBudgets") {
          const { projectId, departmentId } = req.query;
          if ((projectId !== undefined && typeof projectId !== "string") || (departmentId !== undefined && typeof departmentId !== "string")) throw new FinanceError(400, "Choose a valid project and department.");
          return res.status(200).json(await services.projectBudgets(token, projectId, departmentId));
        }
        if (action === "projectPurchaseContext") {
          const { projectId, responsibleDepartmentId } = req.query;
          if (typeof projectId !== "string" || (responsibleDepartmentId !== undefined && typeof responsibleDepartmentId !== "string")) throw new FinanceError(400, "Choose a valid project and department.");
          return res.status(200).json(await services.projectPurchaseContext(token, projectId, responsibleDepartmentId));
        }
        if (action === "projectBudget") {
          if (typeof req.query.projectBudgetId !== "string") throw new FinanceError(400, "Choose a project budget.");
          return res.status(200).json(await services.projectBudget(token, req.query.projectBudgetId));
        }
        if (action === "bankSnapshot") return res.status(200).json(await services.bankSnapshot(token));
        if (action === "capabilities") return res.status(200).json(await services.capabilities(token));
        if (action === "version") return res.status(200).json(await services.version(token, version));
        if (action === "recovery") {
          const deliveryAfter = req.query.deliveryAfter;
          const uploadAfter = req.query.uploadAfter;
          if ((deliveryAfter !== undefined && typeof deliveryAfter !== "string") || (uploadAfter !== undefined && typeof uploadAfter !== "string")) {
            throw new FinanceError(400, "Invalid recovery page.");
          }
          return res.status(200).json(await services.recovery(token, deliveryAfter, uploadAfter, typeof req.query.invoiceAfter === "string" ? req.query.invoiceAfter : undefined));
        }
        if (action === "overview") return res.status(200).json(await services.overview(token, version));
        if (action === "budgets") return res.status(200).json(await services.budgets(token, version));
        if (action === "purchases") {
          const requestRecordId = typeof req.query.requestRecordId === "string" ? req.query.requestRecordId : undefined;
          const unpaidOnly = req.query.unpaid === "1";
          return res.status(200).json(await services.purchases(token, version, requestRecordId, unpaidOnly));
        }
        return res.status(200).json(await services.financing(token, version));
      }
      const length = Number(req.headers["content-length"]);
      const body = financeBody(req.body, Number.isFinite(length) ? length : undefined);
      return res.status(200).json(await services.mutate(token, body));
    } catch (error) {
      if (error instanceof FinanceError || error instanceof MemberCvError) {
        const errors = error instanceof FinanceError ? error.errors : undefined;
        const recovery = error instanceof FinanceError ? error.recovery : undefined;
        const decision = error instanceof FinanceError ? error.decision : undefined;
        const payload: Record<string, unknown> = errors?.length ? { error: error.message, errors } : { error: error.message };
        if (recovery) payload.recovery = recovery;
        if (decision) payload.decision = decision;
        return res.status(error.status).json(payload);
      }
      return res.status(503).json({ error: "The finance service is temporarily unavailable. Please try again." });
    }
  };
}
