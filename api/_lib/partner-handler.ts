import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MemberCvError } from "./member-cv-error.js";
import { bearer } from "./member-cv-service.js";
import { neonPartnerServices, type PartnerServices } from "./partner-service.js";
import { allowsAuthStateChange } from "./auth-proxy.js";
import { RequestWorkflowError } from "../../src/features/SponsorWorkspace/requests.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new MemberCvError(400, "A valid identifier is required.");
  return value;
}

export function createPartnerHandler(getServices: () => PartnerServices = neonPartnerServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      if (req.method === "POST" && req.query.action === "request-otp") {
        const origin = req.headers.origin;
        if (typeof origin !== "string" || !allowsAuthStateChange({ method: "POST", headers: req.headers })) {
          throw new MemberCvError(403, "Cross-site request was rejected.");
        }
        const email = req.body?.email;
        if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          throw new MemberCvError(400, "Enter a valid email address.");
        }
        await getServices().requestOtp(email.trim().toLowerCase(), origin);
        return res.status(202).json({ message: "If your email can sign in, a code will arrive shortly." });
      }
      if (req.method === "POST" && req.query.action !== "requests" && req.query.action !== "request") {
        throw new MemberCvError(400, "Invalid partner request.");
      }
      // Cookies alone and client-provided email/userId are never authorization.
      const token = bearer(req.headers.authorization);
      const services = getServices();
      const { userId } = await services.authenticate(token);
      const action = req.query.action ?? "session";
      if (action === "session") return res.status(200).json(await services.session(userId));
      if (action === "directory") return res.status(200).json(await services.directory(userId, uuid(req.query.organizationId)));
      if (action === "download") return res.status(200).json(await services.download(userId, uuid(req.query.organizationId), uuid(req.query.memberId)));
      if (action === "requests" && req.method === "GET") return res.status(200).json(await services.requests(userId, uuid(req.query.organizationId)));
      if (action === "request" && req.method === "GET") return res.status(200).json(await services.request(userId, uuid(req.query.organizationId), uuid(req.query.id)));
      if (action === "requests" && req.method === "POST") {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new MemberCvError(400, "Send a request object.");
        return res.status(201).json(await services.createRequest(userId, uuid(body.organizationId), { type: body.type, title: body.title, body: body.body }));
      }
      if (action === "request" && req.method === "POST") {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new MemberCvError(400, "Send a request operation.");
        return res.status(200).json(await services.mutateRequest(userId, uuid(body.organizationId), uuid(body.id), body));
      }
      throw new MemberCvError(400, "Invalid partner request.");
    } catch (error) {
      const status = error instanceof MemberCvError || error instanceof RequestWorkflowError ? error.status : 503;
      return res.status(status).json({
        error: error instanceof MemberCvError || error instanceof RequestWorkflowError ? error.message : "The partner portal is temporarily unavailable. Try again.",
      });
    }
  };
}
