import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer, MemberCvError } from "./member-cv-service.js";
import { neonSeasonFinancialServices, type SeasonFinancialServices } from "./season-financials-service.js";

export function createSeasonFinancialHandler(getServices: () => SeasonFinancialServices = neonSeasonFinancialServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const token = bearer(req.headers.authorization);
      return res.status(200).json(await getServices().summary(token));
    } catch (error) {
      return res.status(error instanceof MemberCvError ? error.status : 503).json({
        error: error instanceof MemberCvError ? error.message : "Financial summary is temporarily unavailable. Please try again.",
      });
    }
  };
}
