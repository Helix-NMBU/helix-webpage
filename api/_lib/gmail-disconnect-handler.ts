import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer, neonCvServices, type WorkspaceIdentity } from "./member-cv-service.js";
import { createGmailConnectionStore, type GmailConnectionStore } from "./gmail-connection.js";

export function createGmailDisconnectHandler(
  getStore: () => GmailConnectionStore = () => createGmailConnectionStore(),
  authenticate: (token: string) => Promise<WorkspaceIdentity> = (token) => neonCvServices().authenticate(token),
  fetchImpl: typeof fetch = fetch,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const identity = await authenticate(bearer(req.headers.authorization));
      const refreshToken = await getStore().disconnect(identity.userId);
      if (refreshToken) {
        await fetchImpl("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        }).catch(() => undefined);
      }
      return res.status(200).json({ disconnected: true });
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error && typeof error.status === "number" ? error.status : 503;
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Could not disconnect Gmail.";
      return res.status(status).json({ error: message });
    }
  };
}
