import { validateCvData, validateSharing } from "./model";
import type { CvEnvelope, CvMutation } from "./types";
import { isMemberPlatform, memberPaths } from "../MemberPlatform/routes";
import { isProjectTaskPath } from "../ProjectManagement/routes";

export class CvRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface CvRepository {
  load(): Promise<CvEnvelope>;
  refresh?(): Promise<CvEnvelope>;
  mutate(mutation: CvMutation): Promise<CvEnvelope>;
  preview(mutation: CvMutation): Promise<Blob>;
  downloadPublished(): Promise<{ url: string; expiresIn: number }>;
}

const memberCvCache = new Map<string, CvEnvelope>();
const memberCvLoads = new Map<string, Promise<CvEnvelope>>();
let memberCvCacheGeneration = 0;

function memberCacheKey(token: string): string {
  const segment = token.split(".")[1];
  if (!segment) return token;
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof claims.sub === "string" && claims.sub ? claims.sub : token;
  } catch {
    return token;
  }
}

/** Drop in-memory profile data when the member session is reset or ends. */
export function clearMemberCvCache(): void {
  memberCvCacheGeneration++;
  memberCvCache.clear();
  memberCvLoads.clear();
}

export function createCvRepository(
  token: () => Promise<string>,
  request: typeof fetch = fetch,
): CvRepository {
  async function reject(response: Response, cacheKey?: string): Promise<never> {
    if (response.status === 401 || response.status === 403) {
      if (cacheKey) memberCvCache.delete(cacheKey);
      else clearMemberCvCache();
    }
    const body = await response.json().catch(() => ({}));
    throw new CvRequestError(
      typeof body.error === "string"
        ? body.error
        : "Could not complete the request. Your input has been kept.",
      response.status,
    );
  }
  async function callWithToken(tokenValue: string, mutation?: CvMutation) {
    const response = await request("/api/member-cv", {
      method: mutation ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        ...(mutation ? { "Content-Type": "application/json" } : {}),
      },
      ...(mutation ? { body: JSON.stringify(mutation) } : {}),
    });
    if (!response.ok) await reject(response, memberCacheKey(tokenValue));
    return response;
  }
  return {
    load: async () => {
      const tokenValue = await token();
      const key = memberCacheKey(tokenValue);
      const generation = memberCvCacheGeneration;
      const cached = memberCvCache.get(key);
      if (cached) return cached;
      const inFlight = memberCvLoads.get(key);
      if (inFlight) return inFlight;
      const loading = callWithToken(tokenValue)
        .then((response) => response.json() as Promise<CvEnvelope>)
        .then((envelope) => {
          if (generation === memberCvCacheGeneration) memberCvCache.set(key, envelope);
          return envelope;
        })
        .finally(() => {
          if (memberCvLoads.get(key) === loading) memberCvLoads.delete(key);
        });
      memberCvLoads.set(key, loading);
      return loading;
    },
    refresh: async () => {
      const tokenValue = await token();
      const key = memberCacheKey(tokenValue);
      const generation = memberCvCacheGeneration;
      const envelope = await (await callWithToken(tokenValue)).json() as CvEnvelope;
      if (generation === memberCvCacheGeneration) memberCvCache.set(key, envelope);
      return envelope;
    },
    mutate: async (mutation) => {
      const tokenValue = await token();
      const key = memberCacheKey(tokenValue);
      const generation = memberCvCacheGeneration;
      const envelope = await (await callWithToken(tokenValue, mutation)).json() as CvEnvelope;
      if (generation === memberCvCacheGeneration) memberCvCache.set(key, envelope);
      return envelope;
    },
    preview: async (mutation) => {
      const tokenValue = await token();
      return (await callWithToken(tokenValue, { ...mutation, action: "preview" })).blob();
    },
    downloadPublished: async () => {
      const tokenValue = await token();
      const response = await request("/api/member-cv-file", {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenValue}` },
      });
      if (!response.ok) await reject(response, memberCacheKey(tokenValue));
      const body = await response.json().catch(() => ({}));
      if (!body || typeof body.url !== "string") {
        throw new CvRequestError("Could not load your CV.", response.status);
      }
      return { url: body.url, expiresIn: Number(body.expiresIn) };
    },
  };
}

// Treat location state as untrusted. Only established member/admin routes are valid.
export function memberLoginDestination(state: unknown): string {
  const paths = memberPaths();
  if (!state || typeof state !== "object" || !("from" in state))
    return paths.home;
  const from = state.from;
  const pathname =
    typeof from === "string"
      ? from
      : from && typeof from === "object" && "pathname" in from
        ? from.pathname
        : null;
  if (isMemberPlatform()) {
    if (pathname === "/recruiting") return pathname;
    if (typeof pathname === "string" && isProjectTaskPath(pathname)) return pathname;
    return pathname === paths.profile || pathname === "/member/profile" ? paths.profile : paths.home;
  }
  return pathname === paths.profile ? pathname : paths.home;
}

export function validateMutation(mutation: CvMutation): CvMutation {
  return {
    ...mutation,
    ...(mutation.draft
      ? { draft: validateCvData(mutation.draft, mutation.action === "publish") }
      : {}),
    ...(mutation.sharing ? { sharing: validateSharing(mutation.sharing) } : {}),
  };
}
