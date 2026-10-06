import { validateCvData, validateSharing } from "./model";
import type { CvEnvelope, CvMutation } from "./types";

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
  mutate(mutation: CvMutation): Promise<CvEnvelope>;
  preview(mutation: CvMutation): Promise<Blob>;
}

export function createCvRepository(
  token: () => Promise<string>,
  request: typeof fetch = fetch,
): CvRepository {
  async function call(mutation?: CvMutation) {
    const response = await request("/api/member-cv", {
      method: mutation ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(mutation ? { "Content-Type": "application/json" } : {}),
      },
      ...(mutation ? { body: JSON.stringify(mutation) } : {}),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new CvRequestError(
        typeof body.error === "string"
          ? body.error
          : "Could not complete the request. Your input has been kept.",
        response.status,
      );
    }
    return response;
  }
  return {
    load: async () => (await call()).json() as Promise<CvEnvelope>,
    mutate: async (mutation) =>
      (await call(mutation)).json() as Promise<CvEnvelope>,
    preview: async (mutation) =>
      (await call({ ...mutation, action: "preview" })).blob(),
  };
}

// Treat location state as untrusted. Only established member/admin routes are valid.
export function memberLoginDestination(state: unknown): string {
  if (!state || typeof state !== "object" || !("from" in state))
    return "/member/profile";
  const from = state.from;
  const pathname =
    typeof from === "string"
      ? from
      : from && typeof from === "object" && "pathname" in from
        ? from.pathname
        : null;
  return typeof pathname === "string" &&
    ["/member/profile", "/member/opportunities", "/admin/sponsors"].includes(
      pathname,
    )
    ? pathname
    : "/member/profile";
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
