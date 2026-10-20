import type { VercelRequest, VercelResponse } from "@vercel/node";
import { forwardedAuthCookieHeader } from "./_lib/auth-proxy.js";
import { MemberCvError, neonCvServices, type CvServices } from "./_lib/member-cv-service.js";

export type MemberSessionReason = "no_cookie" | "session_lookup_failed" | "domain_rejected" | "db_error" | "missing_env";

export class MemberSessionFailure extends MemberCvError {
  constructor(
    status: number,
    message: string,
    public reason: MemberSessionReason,
    public upstreamStatus?: number,
  ) {
    super(status, message);
  }
}

type HeaderBag = VercelRequest["headers"] | { authorization?: string; cookie?: string };

function headerText(headers: HeaderBag, name: "authorization" | "cookie"): string | undefined {
  const bag = headers as Record<string, unknown>;
  const value = bag[name] ?? bag[name === "authorization" ? "Authorization" : "Cookie"];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(name === "cookie" ? "; " : ", ");
  return undefined;
}

export async function sessionTokenFromRequest(
  headers: HeaderBag,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const bearer = headerText(headers, "authorization")?.match(/^Bearer ([^\s]+)$/i);
  if (bearer) return bearer[1];
  const cookies = forwardedAuthCookieHeader(headerText(headers, "cookie") ?? null);
  if (!cookies) throw new MemberSessionFailure(401, "Log in to continue.", "no_cookie");
  const baseUrl = env.NEON_AUTH_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) throw new MemberSessionFailure(503, "Member portal server configuration is missing.", "missing_env");
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/token`, {
      method: "GET",
      headers: { cookie: cookies },
      redirect: "manual",
    });
  } catch {
    throw new MemberSessionFailure(502, "Member sign-in is temporarily unavailable. Try again.", "session_lookup_failed");
  }
  if (!response.ok) {
    throw new MemberSessionFailure(401, "Your session has expired. Log in again.", "session_lookup_failed", response.status);
  }
  const body = await response.json().catch(() => null);
  const token = body && typeof body === "object" && "token" in body ? body.token : undefined;
  if (typeof token !== "string" || !token) {
    throw new MemberSessionFailure(401, "Your session has expired. Log in again.", "session_lookup_failed", response.status);
  }
  return token;
}

function failureOf(error: unknown): MemberSessionFailure {
  if (error instanceof MemberSessionFailure) return error;
  if (error instanceof MemberCvError) {
    if (error.status === 403) return new MemberSessionFailure(403, error.message, "domain_rejected");
    if (error.status === 401) return new MemberSessionFailure(401, error.message, "session_lookup_failed");
    if (error.status === 503 && /configuration is missing|not configured/i.test(error.message)) {
      return new MemberSessionFailure(503, error.message, "missing_env");
    }
    return new MemberSessionFailure(error.status, error.message, "db_error");
  }
  return new MemberSessionFailure(503, "Member sign-in is temporarily unavailable. Try again.", "db_error");
}

export function createMemberLoginHandler(
  getServices: () => CvServices = neonCvServices,
  lookup: typeof sessionTokenFromRequest = sessionTokenFromRequest,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const token = await lookup(req.headers);
      const identity = await getServices().authenticate(token);
      return res.status(200).json({ ok: true, email: identity.email });
    } catch (error) {
      const failure = failureOf(error);
      console.error("Member session bootstrap failed.", {
        reason: failure.reason,
        status: failure.upstreamStatus ?? failure.status,
      });
      return res.status(failure.status).json({ error: failure.message });
    }
  };
}

export default createMemberLoginHandler();
