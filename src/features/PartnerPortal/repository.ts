import { PartnerRequestError, partnerSessionToken } from "./session";
import type { PartnerDirectory, PartnerDownload, PartnerSession } from "./types";

export function createPartnerRepository(token = partnerSessionToken, fetchImpl: typeof fetch = fetch) {
  async function request<T>(query: Record<string, string>): Promise<T> {
    const jwt = await token();
    let response: Response;
    try {
      response = await fetchImpl(`/api/partner?${new URLSearchParams(query)}`, {
        method: "GET", credentials: "include", cache: "no-store", headers: { Authorization: `Bearer ${jwt}` },
      });
    } catch { throw new PartnerRequestError("Could not reach the partner portal. Try again.", 0); }
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new PartnerRequestError(
      typeof body?.error === "string" ? body.error : "Could not load the partner portal. Try again.", response.status,
    );
    if (!body || typeof body !== "object") throw new PartnerRequestError("The partner portal returned an invalid response. Try again.", 503);
    return body as T;
  }
  return {
    session: () => request<PartnerSession>({ action: "session" }),
    directory: (organizationId: string) => request<PartnerDirectory>({ action: "directory", organizationId }),
    download: (organizationId: string, memberId: string) => request<PartnerDownload>({ action: "download", organizationId, memberId }),
  };
}

export const partnerRepository = createPartnerRepository();
