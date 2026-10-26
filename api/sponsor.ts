import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowsAuthStateChange } from "./_lib/auth-proxy.js";
import { createCvStorage, type CvObjectStorage } from "./_lib/member-cv-storage.js";
import { createSponsorAccess, sponsorDatabase, SponsorError, type SponsorAccess, type SponsorDatabase } from "./_lib/sponsor-access.js";
import { createSponsorAdminHandler } from "./_lib/sponsor-admin.js";
import { createSponsorAuthHandler } from "./_lib/sponsor-auth.js";
import { createSponsorDirectoryHandler } from "./_lib/sponsor-directory.js";
import { createSponsorRequestsHandler } from "./_lib/sponsor-requests.js";

export type SponsorHandlerDependencies = { db: SponsorDatabase; access: SponsorAccess; storage: CvObjectStorage; authSendLink?: (email: string) => Promise<void> };
export function createSponsorHandler(deps: SponsorHandlerDependencies) {
  const auth = createSponsorAuthHandler(() => deps.access, { sendLink: deps.authSendLink });
  const admin = createSponsorAdminHandler(deps);
  const directory = createSponsorDirectoryHandler(deps);
  const requests = createSponsorRequestsHandler(deps);
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "POST" && !allowsAuthStateChange({ method: "POST", headers: req.headers })) return res.status(403).json({ error: "Cross-site request was rejected." });
    try {
      if (typeof req.body === "string") {
        if (req.body.length > 65_536) return res.status(413).json({ error: "This request is too large." });
        req.body = JSON.parse(req.body);
      }
      switch (req.query.action) {
        case "login": case "session": return await auth(req, res);
        case "admin": return await admin(req, res);
        case "directory": case "profile": case "cv": return await directory(req, res);
        case "requests": case "request": return await requests(req, res);
        default: return res.status(404).json({ error: "Unknown sponsor action." });
      }
    } catch (error) {
      const status = error instanceof SponsorError ? error.status : error instanceof SyntaxError ? 400 : 503;
      return res.status(status).json({ error: status === 400 ? "Send a valid request." : "The sponsor portal is temporarily unavailable." });
    }
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = sponsorDatabase();
    // Directory browsing and administration do not require storage credentials.
    const storage: CvObjectStorage = {
      putPdf: (path, bytes) => createCvStorage().putPdf(path, bytes),
      remove: (path) => createCvStorage().remove(path),
      presign: (path, disposition) => createCvStorage().presign(path, disposition),
    };
    return await createSponsorHandler({ db, access: createSponsorAccess({ db }), storage })(req, res);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "The sponsor portal is temporarily unavailable." });
  }
}
