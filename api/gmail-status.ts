import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer, neonCvServices, type WorkspaceIdentity } from "./_lib/member-cv-service.js";
import { createGmailConnectionStore, type GmailConnectionStore } from "./_lib/gmail-connection.js";

export function createGmailStatusHandler(
  getStore: () => GmailConnectionStore = () => createGmailConnectionStore(),
  authenticate: (token: string) => Promise<WorkspaceIdentity> = (token) => neonCvServices().authenticate(token),
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    try {
      const identity = await authenticate(bearer(req.headers.authorization));
      const connection = await getStore().read(identity.userId);
      if (!connection) return res.status(200).json({ connected: false });
      return res.status(200).json({ connected: true, email: connection.email, connectedAt: connection.connectedAt });
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 503;
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Could not load Gmail connection status.";
      return res.status(status).json({ error: message });
    }
  };
}

export default createGmailStatusHandler();
