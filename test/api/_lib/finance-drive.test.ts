import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { decodeJwt } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
  createFinanceDrive,
  InvoiceTransferError,
  type InvoiceSource,
} from "../../../api/_lib/finance-drive.js";
const privateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({ type: "pkcs8", format: "pem" });
const env = {
  FINANCE_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "invoices@test.iam.gserviceaccount.com",
    private_key: privateKey,
    token_uri: "https://oauth2.googleapis.com/token",
  }),
  FINANCE_INVOICE_SHARED_DRIVE_ID: "testSharedDrive",
  FINANCE_INVOICE_FOLDER_ID: "testInvoiceFolder",
};
const source: InvoiceSource = {
  documentId: "document-reference",
  fileId: "allocatedFile",
  driveId: "testSharedDrive",
  folderId: "testInvoiceFolder",
  name: "invoice.pdf",
  contentType: "application/pdf",
  byteSize: 8,
  sha256: "a".repeat(64),
};
function fixture(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher = vi.fn(
    async (input: URL | RequestInfo, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push({ url, init });
      if (url.href === "https://oauth2.googleapis.com/token")
        return Response.json({
          access_token: "dedicated-service-token",
          expires_in: 300,
          scope: "https://www.googleapis.com/auth/drive.file",
          token_type: "Bearer",
        });
      return handler(url, init);
    },
  );
  return { drive: createFinanceDrive(env, fetcher as typeof fetch)!, calls };
}
describe("dedicated Drive invoice adapter", () => {
  it("reads real HTTP 308 progress with Location without following a redirect", async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(308, {
        Range: "bytes=0-3",
        Location: "https://attacker.invalid/upload",
      });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing test port");
      const { drive, calls } = fixture((_url, init) =>
        fetch(`http://127.0.0.1:${address.port}/session`, init),
      );
      const session =
        "https://www.googleapis.com/upload/drive/v3/files?upload_id=session1";
      expect(await drive.upload(session, new Uint8Array(4), 0, 8)).toEqual({
        done: false,
        confirmedBytes: 4,
      });
      expect(await drive.probe(session, 8)).toEqual({
        done: false,
        confirmedBytes: 4,
      });
      expect(requests).toBe(2);
      expect(
        calls
          .filter((c) => c.url.hostname === "www.googleapis.com")
          .every((c) => c.init.redirect === "manual"),
      ).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("uses only drive.file service JWT without delegated subject or broad Workspace credentials", async () => {
    const { drive, calls } = fixture(() =>
      Response.json({ ids: ["allocatedFile"] }),
    );
    expect(await drive.generateId()).toBe("allocatedFile");
    const token = calls.find(
      (c) => c.url.hostname === "oauth2.googleapis.com",
    )!;
    const assertion = new URLSearchParams(String(token.init.body)).get(
      "assertion",
    )!;
    expect(decodeJwt(assertion)).toMatchObject({
      iss: "invoices@test.iam.gserviceaccount.com",
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/drive.file",
    });
    expect(decodeJwt(assertion)).not.toHaveProperty("sub");
    expect(calls[1].init).toMatchObject({
      redirect: "error",
      headers: { Authorization: "Bearer dedicated-service-token" },
    });
    expect(
      createFinanceDrive({
        ...env,
        FINANCE_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          type: "service_account",
          client_email: "x@test.gserviceaccount.com",
          private_key: privateKey,
          sub: "user@example.com",
        }),
      }),
    ).toBeNull();
  });
  it("requires explicit destination and rejects broad scopes returned by token endpoint", async () => {
    expect(createFinanceDrive({})).toBeNull();
    expect(
      createFinanceDrive({ ...env, FINANCE_INVOICE_FOLDER_ID: undefined }),
    ).toBeNull();
    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "no",
        scope: "https://www.googleapis.com/auth/drive",
      }),
    );
    await expect(
      createFinanceDrive(env, fetcher as typeof fetch)!.generateId(),
    ).rejects.toMatchObject({ safeError: "provider_permission" });
  });
  it("starts a resumable upload under the persisted ID and fixed folder with supportsAllDrives", async () => {
    const { drive, calls } = fixture(
      () =>
        new Response(null, {
          status: 200,
          headers: {
            Location:
              "https://www.googleapis.com/upload/drive/v3/files?upload_id=session1",
          },
        }),
    );
    await expect(drive.begin(source)).resolves.toContain("upload_id=session1");
    const call = calls[1];
    expect(call.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(JSON.parse(String(call.init.body))).toMatchObject({
      id: source.fileId,
      parents: [source.folderId],
      appProperties: {
        financeDocumentId: source.documentId,
        sha256: source.sha256,
      },
    });
    expect(call.init.headers).not.toHaveProperty("permissions");
  });
  it("never sends credentials to an arbitrary resumable Location or redirected host", async () => {
    const { drive, calls } = fixture(
      () =>
        new Response(null, {
          status: 200,
          headers: {
            Location: "https://attacker.invalid/upload?upload_id=secret",
          },
        }),
    );
    await expect(drive.begin(source)).rejects.toMatchObject({
      safeError: "provider_mismatch",
    });
    await expect(
      drive.probe("https://attacker.invalid/upload?upload_id=secret", 8),
    ).rejects.toMatchObject({ safeError: "provider_mismatch" });
    expect(calls).toHaveLength(2);
  });
  it("uses inclusive Range offsets, handles empty 308 and expired sessions, and rejects impossible progress", async () => {
    let response = new Response(null, {
      status: 308,
      headers: { Range: "bytes=0-3" },
    });
    const { drive, calls } = fixture(() => response);
    const uri =
      "https://www.googleapis.com/upload/drive/v3/files?upload_id=session1";
    expect(await drive.probe(uri, 8)).toEqual({
      done: false,
      confirmedBytes: 4,
    });
    expect(calls.at(-1)?.init.headers).toMatchObject({
      "Content-Range": "bytes */8",
      "Content-Length": "0",
    });
    response = new Response(null, { status: 308 });
    expect((await drive.probe(uri, 8)).confirmedBytes).toBe(0);
    response = new Response(null, { status: 410 });
    expect((await drive.probe(uri, 8)).expired).toBe(true);
    response = new Response(null, {
      status: 308,
      headers: { Range: "bytes=0-8" },
    });
    await expect(drive.probe(uri, 8)).rejects.toMatchObject({
      safeError: "provider_mismatch",
    });
  });
  it("does not treat 409 as verified storage, and requires exact Drive/folder/content metadata", async () => {
    const { drive } = fixture(() => new Response(null, { status: 409 }));
    await expect(drive.begin(source)).rejects.toMatchObject({
      safeError: "transfer_uncertain",
    });
    const file = {
      id: source.fileId,
      driveId: source.driveId,
      parents: [source.folderId],
      mimeType: source.contentType,
      size: "8",
      sha256Checksum: source.sha256,
      appProperties: {
        financeDocumentId: source.documentId,
        sha256: source.sha256,
      },
    };
    await expect(drive.verify(source, file)).resolves.toBeUndefined();
    for (const changed of [
      { driveId: "wrong" },
      { parents: ["wrong"] },
      { size: "9" },
      { sha256Checksum: "wrong" },
      { appProperties: { financeDocumentId: "other", sha256: source.sha256 } },
      { trashed: true },
    ])
      await expect(
        drive.verify(source, { ...file, ...changed }),
      ).rejects.toBeInstanceOf(InvoiceTransferError);
  });
  it("hashes downloaded media when Drive omits its SHA256 checksum, bounded by expected size", async () => {
    const { createHash } = await import("node:crypto"),
      bytes = new TextEncoder().encode("%PDF-1.4"),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    let payload = bytes;
    const { drive } = fixture(() => new Response(payload));
    const s = { ...source, sha256 };
    const file = {
      id: s.fileId,
      driveId: s.driveId,
      parents: [s.folderId],
      mimeType: s.contentType,
      size: "8",
      appProperties: { financeDocumentId: s.documentId, sha256 },
    };
    await expect(drive.verify(s, file)).resolves.toBeUndefined();
    payload = new TextEncoder().encode("%PDF-1.4excess");
    await expect(drive.verify(s, file)).rejects.toMatchObject({
      safeError: "provider_mismatch",
    });
  });
  it("validates folder belongs to configured shared Drive with add-child permission", async () => {
    let data = {
      id: source.folderId,
      driveId: source.driveId,
      mimeType: "application/vnd.google-apps.folder",
      parents: [],
      capabilities: { canAddChildren: true },
    };
    const { drive } = fixture(() => Response.json(data));
    await expect(
      drive.validateDestination(source.driveId, source.folderId),
    ).resolves.toBeUndefined();
    data = { ...data, driveId: "otherDrive" };
    await expect(
      drive.validateDestination(source.driveId, source.folderId),
    ).rejects.toMatchObject({ safeError: "provider_permission" });
  });
});
