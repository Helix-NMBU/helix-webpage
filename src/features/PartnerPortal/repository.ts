import { PartnerRequestError, partnerSessionToken } from "./session";
import type { PartnerDirectory, PartnerDownload, PartnerSession } from "./types";
import type { RequestDetail, RequestList } from "../SponsorWorkspace/request-types";

export function createPartnerRepository(token = partnerSessionToken, fetchImpl: typeof fetch = fetch) {
  async function callApi<T>(query: Record<string, string>, init: RequestInit = {}): Promise<T> {
    const jwt = await token();
    let response: Response;
    try {
      response = await fetchImpl(`/api/partner?${new URLSearchParams(query)}`, {
        ...init, method: init.method ?? "GET", credentials: "include", cache: "no-store",
        headers: { Authorization: `Bearer ${jwt}`, ...init.headers },
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
    session: () => callApi<PartnerSession>({ action: "session" }),
    directory: (organizationId: string) => callApi<PartnerDirectory>({ action: "directory", organizationId }),
    download: (organizationId: string, memberId: string) => callApi<PartnerDownload>({ action: "download", organizationId, memberId }),
    requests: (organizationId: string) => callApi<RequestList>({ action: "requests", organizationId }),
    request: (organizationId: string, id: string) => callApi<{ request: RequestDetail }>({ action: "request", organizationId, id }),
    createRequest: (organizationId: string, draft: unknown) => callApi<{ request: RequestDetail }>({ action: "requests" }, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...draft as object }),
    }),
    mutateRequest: (organizationId: string, input: unknown) => callApi<{ request: RequestDetail }>({ action: "request" }, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...input as object }),
    }),
  };
}

export const partnerRepository = createPartnerRepository();
