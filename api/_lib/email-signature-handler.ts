import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { neonEmailSignatureServices, type EmailSignatureServices } from "./email-signature-service.js";

export function createEmailSignatureHandler(getServices: () => EmailSignatureServices = neonEmailSignatureServices) {
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
      if (req.method === "GET") return res.status(200).json(await services.read(token));
      const body = req.body as { settings?: unknown; revision?: unknown } | null;
      return res.status(200).json(await services.save(token, body?.settings, body?.revision));
    } catch (error) {
      if (error instanceof MemberCvError) return res.status(error.status).json({ error: error.message });
      return res.status(503).json({ error: "Could not load or save email signature settings. Please try again." });
    }
  };
}
