import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowsAuthStateChange } from "./auth-proxy.js";
import { neonSponsorAccess, normalizeSponsorEmail, SponsorError, sponsorBearer, type SponsorAccess } from "./sponsor-access.js";

export const SPONSOR_LOGIN_ACKNOWLEDGEMENT = "If your invitation is active, a sign-in link will arrive shortly.";

export function sponsorCallback(origin: string | undefined): string {
  try {
    const url = new URL(origin ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return `${url.origin}/sponsor`;
  } catch { throw new SponsorError(503, "Sponsor sign-in is not configured."); }
}

export async function sendSponsorMagicLink(email: string, deps: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const callbackURL = sponsorCallback(env.SPONSOR_PORTAL_ORIGIN);
  let base: URL;
  try {
    base = new URL(env.NEON_AUTH_BASE_URL ?? "");
    if (base.protocol !== "https:" || base.username || base.password) throw new Error();
  } catch { throw new SponsorError(503, "Sponsor sign-in is not configured."); }
  try {
    // The installed Neon SDK uses this signIn.magicLink route. Neon owns token
    // generation, single use, expiry, delivery and verification. Never expose its body.
    const response = await (deps.fetchImpl ?? fetch)(`${base.href.replace(/\/$/, "")}/sign-in/magic-link`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", origin: new URL(callbackURL).origin },
      body: JSON.stringify({ email, callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: `${new URL(callbackURL).origin}/sponsor/login` }),
    });
    if (!response.ok) throw new Error();
  } catch { throw new SponsorError(503, "Could not request a sign-in link. Try again shortly."); }
}

export function createSponsorAuthHandler(
  getAccess: () => SponsorAccess = neonSponsorAccess,
  options: { sendLink?: (email: string) => Promise<void> } = {},
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    const action = req.query?.action;
    try {
      if (action === "session") {
        if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
        return res.status(200).json(await getAccess().authenticate(sponsorBearer(req.headers.authorization)));
      }
      if (action !== "login") return res.status(404).json({ error: "Unknown sponsor action." });
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
      if (!allowsAuthStateChange({ method: "POST", headers: req.headers })) throw new SponsorError(403, "Cross-site request was rejected.");
      const body: unknown = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const email = normalizeSponsorEmail(body && typeof body === "object" && "email" in body ? body.email : null);
      if (await getAccess().mayRequestLogin(email)) await (options.sendLink ?? sendSponsorMagicLink)(email);
      return res.status(200).json({ message: SPONSOR_LOGIN_ACKNOWLEDGEMENT });
    } catch (error) {
      const status = error instanceof SponsorError ? error.status : error instanceof SyntaxError ? 400 : 503;
      return res.status(status).json({ error: error instanceof SponsorError ? error.message : status === 400 ? "Enter a valid email address." : "Sponsor sign-in is temporarily unavailable." });
    }
  };
}
