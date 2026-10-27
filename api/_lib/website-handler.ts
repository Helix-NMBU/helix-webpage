import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { neonWebsiteServices, type WebsiteServices } from "./website-service.js";
import { applicationId, MAX_BODY_BYTES, websiteBody } from "./website-validation.js";

export function createWebsiteHandler(getServices: () => WebsiteServices = neonWebsiteServices, fixedAction?: "reject" | "confirmation") {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const routeAction = fixedAction ?? (req.query.action === "reject" || req.query.action === "confirmation" ? req.query.action : undefined);
    if ((req.method !== "GET" && req.method !== "POST") || (routeAction && req.method !== "POST")) {
      res.setHeader("Allow", routeAction ? "POST" : "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      if (Number(req.headers["content-length"]) > MAX_BODY_BYTES) throw new MemberCvError(413, "The application is too large.");
      if (req.method === "GET") {
        const action = req.query.action;
        if (action === "positions") return res.status(200).json({ positions: await getServices().positions() });
        const token = bearer(req.headers.authorization);
        const services = getServices();
        if (action === "manage-positions") return res.status(200).json({ positions: await services.managePositions(token) });
        if (action === "session") return res.status(200).json(await services.session(token));
        if (action === "applications") {
          const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
          if (Array.isArray(req.query.offset) || !Number.isSafeInteger(offset) || offset < 0) throw new MemberCvError(400, "Invalid page.");
          return res.status(200).json(await services.list(token, offset));
        }
        const id = applicationId(req.query.id);
        if (action === "application") return res.status(200).json({ application: await services.read(token, id) });
        if (action === "file" && (req.query.kind === "cv" || req.query.kind === "photo")) return res.status(200).json(await services.file(token, id, req.query.kind));
        throw new MemberCvError(400, "Unknown request.");
      }
      const body = websiteBody(req.body);
      const action = routeAction ?? body.action;
      if (action === "submit") return res.status(201).json(await getServices().submit(body, submissionRateKey(req)));
      const token = bearer(req.headers.authorization);
      const services = getServices();
      if (action === "save-position") return res.status(200).json({ position: await services.savePosition(token, body.position) });
      if (action === "delete-position") return res.status(200).json(await services.deletePosition(token, body.position_id as string));
      const id = applicationId(body.application_id);
      if (action === "reject" || action === "delete") return res.status(200).json(await services.remove(token, id, action === "reject"));
      if (action === "confirmation") return res.status(200).json(await services.confirmation(token, id));
      throw new MemberCvError(400, "Unknown request.");
    } catch (error) {
      if (error instanceof MemberCvError) return res.status(error.status).json({ error: error.message });
      return res.status(503).json({ error: "The application service is temporarily unavailable. Please try again." });
    }
  };
}

function submissionRateKey(req: VercelRequest): string {
  const header = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(header) ? header[0] : header;
  const address = forwarded?.split(",")[0]?.trim();
  const ip = address && isIP(address) ? address : null;
  const source = ip ?? (process.env.HELIX_ENVIRONMENT === "local" ? "local-development" : null);
  const secret = process.env.DATABASE_URL;
  if (!source || !secret) throw new MemberCvError(503, "The application service is temporarily unavailable. Please try again.");
  return createHmac("sha256", secret).update(source).digest("hex");
}
