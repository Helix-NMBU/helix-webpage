import { createHash } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3/files";
export class InvoiceTransferError extends Error {
  constructor(
    public readonly safeError:
      | "configuration_missing"
      | "provider_unavailable"
      | "provider_permission"
      | "provider_mismatch"
      | "source_unavailable"
      | "source_mismatch"
      | "transfer_uncertain",
  ) {
    super(safeError);
  }
}
export interface InvoiceSource {
  documentId: string;
  fileId: string;
  driveId: string;
  folderId: string;
  name: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}
export interface DriveFile {
  id: string;
  driveId: string;
  parents: string[];
  mimeType: string;
  size?: string;
  trashed?: boolean;
  sha256Checksum?: string;
  appProperties?: Record<string, string>;
  capabilities?: { canAddChildren?: boolean };
}
export interface DriveSession {
  done: boolean;
  expired?: boolean;
  confirmedBytes: number;
}
export interface FinanceDrive {
  readonly destination: { driveId: string; folderId: string };
  generateId(deadline?: number): Promise<string>;
  validateDestination(
    driveId: string,
    folderId: string,
    deadline?: number,
  ): Promise<void>;
  lookup(fileId: string, deadline?: number): Promise<DriveFile | null>;
  verify(
    source: InvoiceSource,
    file: DriveFile,
    deadline?: number,
  ): Promise<void>;
  begin(source: InvoiceSource, deadline?: number): Promise<string>;
  probe(uri: string, size: number, deadline?: number): Promise<DriveSession>;
  upload(
    uri: string,
    bytes: Uint8Array,
    offset: number,
    total: number,
    deadline?: number,
  ): Promise<DriveSession>;
}
function sessionUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvoiceTransferError("provider_mismatch");
  }
  if (
    url.origin !== "https://www.googleapis.com" ||
    url.pathname !== "/upload/drive/v3/files" ||
    url.username ||
    url.password ||
    !url.searchParams.get("upload_id")
  )
    throw new InvoiceTransferError("provider_mismatch");
  return url;
}
function progress(response: Response, size: number): DriveSession {
  if (response.status === 404 || response.status === 410)
    return { done: false, expired: true, confirmedBytes: 0 };
  if (
    response.status === 200 ||
    response.status === 201 ||
    response.status === 409
  )
    return { done: true, confirmedBytes: size };
  if (response.status !== 308)
    throw new InvoiceTransferError(
      response.status === 401 || response.status === 403
        ? "provider_permission"
        : "provider_unavailable",
    );
  const range = response.headers.get("Range");
  const match = range?.match(/^bytes=0-(\d+)$/);
  if (range && !match) throw new InvoiceTransferError("provider_mismatch");
  const count = match ? Number(match[1]) + 1 : 0;
  if (!Number.isSafeInteger(count) || count < 0 || count > size)
    throw new InvoiceTransferError("provider_mismatch");
  return { done: false, confirmedBytes: count };
}
/** Dedicated service identity only. No user/Gmail token, delegation or permission-writing API. */
export function createFinanceDrive(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): FinanceDrive | null {
  const raw = env.FINANCE_GOOGLE_SERVICE_ACCOUNT_JSON,
    driveId = env.FINANCE_INVOICE_SHARED_DRIVE_ID,
    folderId = env.FINANCE_INVOICE_FOLDER_ID;
  if (!raw || !driveId || !folderId) return null;
  let credential: {
    type?: string;
    client_email?: string;
    private_key?: string;
    private_key_id?: string;
    token_uri?: string;
    subject?: string;
    sub?: string;
  };
  try {
    credential = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    credential.type !== "service_account" ||
    !credential.client_email?.endsWith(".gserviceaccount.com") ||
    !credential.private_key ||
    credential.subject ||
    credential.sub ||
    (credential.token_uri && credential.token_uri !== TOKEN) ||
    !/^[\w-]{5,200}$/.test(driveId) ||
    !/^[\w-]{5,200}$/.test(folderId)
  )
    return null;
  let cached: { token: string; until: number } | undefined;
  function timeout(deadline?: number) {
    if (deadline && deadline <= Date.now())
      throw new InvoiceTransferError("provider_unavailable");
    return AbortSignal.timeout(
      Math.max(1, Math.min(5000, (deadline ?? Date.now() + 5000) - Date.now())),
    );
  }
  async function accessToken(deadline?: number) {
    if (cached && cached.until > Date.now() + 30_000) return cached.token;
    try {
      const key = await importPKCS8(credential.private_key!, "RS256");
      const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({
          alg: "RS256",
          ...(credential.private_key_id
            ? { kid: credential.private_key_id }
            : {}),
        })
        .setIssuer(credential.client_email!)
        .setAudience(TOKEN)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(key);
      const response = await fetcher(TOKEN, {
        method: "POST",
        redirect: "error",
        signal: timeout(deadline),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }),
      });
      if (!response.ok) throw new InvoiceTransferError("provider_permission");
      const value = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
      };
      if (
        !value.access_token ||
        (value.scope && value.scope !== SCOPE) ||
        (value.token_type && value.token_type.toLowerCase() !== "bearer")
      )
        throw new InvoiceTransferError("provider_permission");
      cached = {
        token: value.access_token,
        until:
          Date.now() + Math.min(Number(value.expires_in) || 300, 3600) * 1000,
      };
      return cached.token;
    } catch (e) {
      if (e instanceof InvoiceTransferError) throw e;
      throw new InvoiceTransferError("provider_unavailable");
    }
  }
  async function request(
    url: string | URL,
    init: RequestInit = {},
    deadline?: number,
  ) {
    try {
      return await fetcher(url, {
        ...init,
        redirect: "error",
        signal: timeout(deadline),
        headers: {
          ...init.headers,
          Authorization: `Bearer ${await accessToken(deadline)}`,
        },
      });
    } catch (e) {
      if (e instanceof InvoiceTransferError) throw e;
      throw new InvoiceTransferError("transfer_uncertain");
    }
  }
  async function lookup(fileId: string, deadline?: number) {
    const url = new URL(`${API}/${encodeURIComponent(fileId)}`);
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set(
      "fields",
      "id,driveId,parents,mimeType,size,trashed,sha256Checksum,appProperties,capabilities(canAddChildren)",
    );
    const response = await request(url, {}, deadline);
    if (response.status === 404) return null;
    if (!response.ok)
      throw new InvoiceTransferError(
        response.status === 403 || response.status === 401
          ? "provider_permission"
          : "provider_unavailable",
      );
    return (await response.json()) as DriveFile;
  }
  return {
    destination: { driveId, folderId },
    async generateId(deadline) {
      const response = await request(
        `${API}/generateIds?count=1&space=drive&type=files`,
        {},
        deadline,
      );
      if (!response.ok) throw new InvoiceTransferError("provider_unavailable");
      const value = (await response.json()) as { ids?: string[] };
      if (value.ids?.length !== 1 || !/^[\w-]{5,200}$/.test(value.ids[0]))
        throw new InvoiceTransferError("provider_mismatch");
      return value.ids[0];
    },
    lookup,
    async validateDestination(drive, folder, deadline) {
      const file = await lookup(folder, deadline);
      if (
        !file ||
        file.id !== folder ||
        file.driveId !== drive ||
        file.mimeType !== "application/vnd.google-apps.folder" ||
        file.trashed ||
        file.capabilities?.canAddChildren !== true
      )
        throw new InvoiceTransferError("provider_permission");
    },
    async verify(source, file, deadline) {
      if (
        file.id !== source.fileId ||
        file.driveId !== source.driveId ||
        file.parents?.length !== 1 ||
        file.parents[0] !== source.folderId ||
        file.trashed ||
        file.mimeType !== source.contentType ||
        Number(file.size) !== source.byteSize ||
        file.appProperties?.financeDocumentId !== source.documentId ||
        file.appProperties?.sha256 !== source.sha256
      )
        throw new InvoiceTransferError("provider_mismatch");
      if (file.sha256Checksum) {
        if (file.sha256Checksum !== source.sha256)
          throw new InvoiceTransferError("provider_mismatch");
        return;
      }
      const response = await request(
        `${API}/${encodeURIComponent(source.fileId)}?alt=media&supportsAllDrives=true`,
        {},
        deadline,
      );
      if (!response.ok || !response.body)
        throw new InvoiceTransferError("provider_unavailable");
      const reader = response.body.getReader(),
        hash = createHash("sha256");
      let count = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        count += next.value.length;
        if (count > source.byteSize) {
          await reader.cancel();
          throw new InvoiceTransferError("provider_mismatch");
        }
        hash.update(next.value);
      }
      if (count !== source.byteSize || hash.digest("hex") !== source.sha256)
        throw new InvoiceTransferError("provider_mismatch");
    },
    async begin(source, deadline) {
      const response = await request(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": source.contentType,
            "X-Upload-Content-Length": String(source.byteSize),
          },
          body: JSON.stringify({
            id: source.fileId,
            name: source.name,
            mimeType: source.contentType,
            parents: [source.folderId],
            appProperties: {
              financeDocumentId: source.documentId,
              sha256: source.sha256,
            },
          }),
        },
        deadline,
      );
      if (response.status === 409)
        throw new InvoiceTransferError("transfer_uncertain");
      if (!response.ok)
        throw new InvoiceTransferError(
          response.status === 403
            ? "provider_permission"
            : "provider_unavailable",
        );
      const uri = response.headers.get("Location");
      if (!uri) throw new InvoiceTransferError("provider_mismatch");
      return sessionUrl(uri).href;
    },
    async probe(uri, size, deadline) {
      return progress(
        await request(
          sessionUrl(uri),
          {
            method: "PUT",
            headers: {
              "Content-Length": "0",
              "Content-Range": `bytes */${size}`,
            },
          },
          deadline,
        ),
        size,
      );
    },
    async upload(uri, bytes, offset, total, deadline) {
      return progress(
        await request(
          sessionUrl(uri),
          {
            method: "PUT",
            headers: {
              "Content-Length": String(bytes.byteLength),
              "Content-Range": `bytes ${offset}-${offset + bytes.byteLength - 1}/${total}`,
            },
            body: bytes as BodyInit,
          },
          deadline,
        ),
        total,
      );
    },
  };
}
