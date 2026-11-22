// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoiceEvidenceApi } from "./invoice-repository";
import { createFinanceApi } from "./repository";
const auth = vi.hoisted(() => ({
  token: vi.fn(async (_owner: { current: string | null }) => "member-token"),
  watch: vi.fn((_onEnd: () => void, _client?: unknown, _owner?: {current:string|null}) => () => undefined),
  local: false,
  signedIn: true,
  localApi: vi.fn(() => ({ open: vi.fn(), retry: vi.fn() })),
}));
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: auth.token,
  watchMemberSession: auth.watch,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => auth.local,
  localMemberSignedIn: () => auth.signedIn,
}));
vi.mock("./invoice-local", () => ({
  createLocalInvoiceEvidenceApi: auth.localApi,
}));
beforeEach(() => {
  auth.local = false;
  auth.signedIn = true;
  auth.token.mockClear();
  auth.watch.mockClear();
  auth.localApi.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
describe("current member invoice authorization", () => {
  it("uses stable application document IDs and the same member session owner for open and retry", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          ok: true,
          id: "document",
          viewVersion: 1,
          warnings: [],
          errors: [],
          viewerUrl: "https://drive.google.com/file/d/verified/view",
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const api = createInvoiceEvidenceApi();
    await api.open("app-document");
    await api.retry("app-document", 4, "same-durable-request");
    expect(
      fetcher.mock.calls.every(
        (call) =>
          call[0] === "/api/finance" &&
          call[1]?.method === "POST" &&
          call[1]?.cache === "no-store",
      ),
    ).toBe(true);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      action: "downloadDocument",
      documentId: "app-document",
      requestId: expect.any(String),
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      action: "retryInvoiceTransfer",
      documentId: "app-document",
      expectedRevision: 4,
      requestId: "same-durable-request",
    });
    expect(auth.token.mock.calls[0][0]).toBe(auth.token.mock.calls[1][0]);
    const end = vi.fn();
    const stop = api.watchSession!(end);
    expect(auth.watch).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      auth.token.mock.calls[0][0],
    );
    auth.watch.mock.calls[0][0]();
    expect(end).toHaveBeenCalledOnce();
    stop();
  });
  it.each([401, 403, 409])(
    "retains HTTP %s for clearing views and stale revision recovery",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ error: "Invoice unavailable" }, { status }),
        ),
      );
      await expect(
        createInvoiceEvidenceApi().open("document"),
      ).rejects.toMatchObject({ status, message: "Invoice unavailable" });
    },
  );
  it("selects the fixture adapter only while both dedicated local gates pass", async () => {
    auth.local = true;
    createInvoiceEvidenceApi();
    expect(auth.localApi).toHaveBeenCalledOnce();
    auth.signedIn = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Sign in" }, { status: 401 })),
    );
    await expect(
      createInvoiceEvidenceApi().open("document"),
    ).rejects.toMatchObject({ status: 401 });
    expect(auth.localApi).toHaveBeenCalledOnce();
    expect(auth.token).toHaveBeenCalledOnce();
  });
  it("keeps invoice recovery paging independent of delivery and upload cursors", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          deliveries: [],
          uploads: [],
          invoiceTransfers: [],
          invoiceNextCursor: null,
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    await createFinanceApi({ current: null }).recovery(
      "delivery",
      "upload",
      "invoice-next",
    );
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/finance?action=recovery&deliveryAfter=delivery&uploadAfter=upload&invoiceAfter=invoice-next",
    );
  });
});
