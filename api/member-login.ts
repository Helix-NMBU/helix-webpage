import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer, MemberCvError, neonCvServices, type CvServices } from "./_lib/member-cv-service.js";

export function createMemberLoginHandler(getServices: () => CvServices = neonCvServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const identity = await getServices().authenticate(bearer(req.headers.authorization));
      return res.status(200).json({ ok: true, email: identity.email });
    } catch (error) {
      return res.status(error instanceof MemberCvError ? error.status : 503).json({
        error: error instanceof MemberCvError ? error.message : "Member sign-in is temporarily unavailable. Try again.",
      });
    }
  };
}

export default createMemberLoginHandler();
