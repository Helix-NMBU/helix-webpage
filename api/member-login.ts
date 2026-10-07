import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { emptyCv, privateSharing } from "../src/features/MemberCV/model.js";
import { matchesGoogleUser, MemberCvError, serverClients, type WorkspaceIdentity } from "./_lib/member-cv-service.js";
import type { User } from "@supabase/supabase-js";

type LoginSession = { access_token: string; refresh_token: string; user: User };
export interface MemberLoginServices {
  audience: string;
  verify(credential: string): Promise<TokenPayload | undefined>;
  exchange(credential: string): Promise<LoginSession>;
  onboard(identity: WorkspaceIdentity): Promise<void>;
  now(): number;
}
export function createMemberLoginHandler(getServices: () => MemberLoginServices = loginServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const credential = req.body?.credential;
      if (typeof credential !== "string" || !credential || credential.length > 16000) throw new MemberCvError(400, "A Google sign-in credential is required.");
      const services = getServices();
      let payload;
      try { payload = await services.verify(credential); }
      catch { throw new MemberCvError(401, "Google sign-in could not be verified. Try again."); }
      if (!payload || payload.aud !== services.audience || (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= services.now()) || !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss) || !payload.sub) throw new MemberCvError(401, "Invalid or expired Google credential.");
      const email = payload.email?.toLowerCase();
      if (payload.hd !== "helixnmbu.no" || payload.email_verified !== true || !email || !/^[^\s@]+@helixnmbu\.no$/.test(email)) throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account.");
      const session = await services.exchange(credential);
      const identity = { userId: session.user.id, googleSub: payload.sub, email, name: payload.name ?? "" };
      if (!matchesGoogleUser(session.user, identity)) throw new MemberCvError(403, "Google and Supabase identities do not match.");
      await services.onboard(identity);
      return res.status(200).json({ access_token: session.access_token, refresh_token: session.refresh_token });
    } catch (error) {
      return res.status(error instanceof MemberCvError ? error.status : 503).json({ error: error instanceof MemberCvError ? error.message : "Member sign-in is temporarily unavailable. Try again." });
    }
  };
}
function loginServices(): MemberLoginServices {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new MemberCvError(503, "Member Google sign-in is not configured.");
  const { auth, admin } = serverClients();
  const google = new OAuth2Client(audience);
  return {
    audience,
    now: () => Math.floor(Date.now() / 1000),
    async verify(credential) { return (await google.verifyIdToken({ idToken: credential, audience })).getPayload(); },
    async exchange(credential) {
      const { data, error } = await auth.auth.signInWithIdToken({ provider: "google", token: credential });
      if (error || !data.session || !data.user) throw new MemberCvError(401, "Could not create your member session.");
      return { ...data.session, user: data.user };
    },
    async onboard(identity) {
      const { error } = await admin.rpc("onboard_member_cv", { p_user_id: identity.userId, p_google_sub: identity.googleSub, p_email: identity.email, p_name: identity.name, p_draft: emptyCv(identity.name, identity.email), p_sharing: privateSharing });
      if (error) throw new MemberCvError(503, "Could not prepare your private member profile. Try signing in again.");
    },
  };
}
export default createMemberLoginHandler();
