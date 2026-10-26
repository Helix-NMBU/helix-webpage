import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MemberCvError } from "./member-cv-error.js";
import { bearer } from "./member-cv-service.js";
import { neonPartnerServices, type PartnerServices } from "./partner-service.js";
import { allowsAuthStateChange } from "./auth-proxy.js";

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
      if (req.method === "POST") {
        if (req.query.action !== "request-otp") throw new MemberCvError(400, "Invalid partner request.");
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
      // Cookies alone and client-provided email/userId are never authorization.
      const token = bearer(req.headers.authorization);
      const services = getServices();
      const { userId } = await services.authenticate(token);
      const action = req.query.action ?? "session";
      if (action === "session") return res.status(200).json(await services.session(userId));
      if (action === "directory") return res.status(200).json(await services.directory(userId, uuid(req.query.organizationId)));
      if (action === "download") return res.status(200).json(await services.download(userId, uuid(req.query.organizationId), uuid(req.query.memberId)));
      throw new MemberCvError(400, "Invalid partner request.");
    } catch (error) {
      return res.status(error instanceof MemberCvError ? error.status : 503).json({
        error: error instanceof MemberCvError ? error.message : "The partner portal is temporarily unavailable. Try again.",
      });
    }
  };
}
