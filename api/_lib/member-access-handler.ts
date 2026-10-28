import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { neonMemberAccessServices, type MemberAccessServices } from "./member-access-service.js";
import { websiteBody } from "./website-validation.js";

export function createMemberAccessHandler(getServices: () => MemberAccessServices = neonMemberAccessServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const services = getServices();
      const token = bearer(req.headers.authorization);
      if (req.method === "GET") {
        if (req.query.action === "self") return res.status(200).json(await services.self(token));
        if (req.query.action === "members") return res.status(200).json(await services.members(token));
        throw new MemberCvError(400, "Unknown request.");
      }
      const body = websiteBody(req.body);
      if (body.action === "save_workspace_access") return res.status(200).json(await services.saveWorkspace(token, body));
      if (body.action !== "save") throw new MemberCvError(400, "Unknown request.");
      if (typeof body.memberId !== "string" || (body.departmentId !== null && typeof body.departmentId !== "string") || !Array.isArray(body.roleKeys)) throw new MemberCvError(400, "Check the member access details.");
      return res.status(200).json(await services.save(token, body.memberId, body.departmentId as string | null, body.roleKeys as string[]));
    } catch (error) {
      if (error instanceof MemberCvError) return res.status(error.status).json({ error: error.message });
      return res.status(503).json({ error: "The member service is temporarily unavailable. Please try again." });
    }
  };
}
