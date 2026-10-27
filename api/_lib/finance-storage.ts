import { randomBytes } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FinanceError } from "./finance-error.js";

export const FINANCE_FILE_LIMIT_BYTES = 10 * 1024 * 1024;
export const FINANCE_PRESIGN_SECONDS = 120;
const STAGING_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/staging\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}$/i;
const FINAL_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/final\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}$/i;

export type FinanceStoredObject = {
  byteSize: number;
  contentType: string;
  sha256: string;
};

export interface FinanceObjectStorage {
  stagingKey(memberId: string, uploadId: string): string;
  finalKey(memberId: string, uploadId: string): string;
  presignPut(stagingKey: string, contentType: string, byteSize: number): Promise<string>;
  presignGet(storageKey: string, fileName: string, contentType: string): Promise<string>;
  headObject(key: string): Promise<{ byteSize: number; contentType: string | undefined }>;
  readSignature(key: string, length: number): Promise<Uint8Array>;
  readObject(key: string, byteSize: number): Promise<Uint8Array>;
  promoteStagingToFinal(stagingKey: string, finalKey: string, contentType: string, byteSize: number): Promise<void>;
  remove(key: string): Promise<void>;
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function createFinanceStorage(env: NodeJS.ProcessEnv = process.env): FinanceObjectStorage {
  const bucket = env.NEON_FINANCE_BUCKET;
  const endpoint = env.NEON_S3_ENDPOINT;
  const region = env.NEON_S3_REGION;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new FinanceError(503, "Finance file storage is unavailable. Configure the private finance bucket.");
  }
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    stagingKey(memberId, uploadId) {
      return `${memberId}/staging/${uploadId}/${randomHex(16)}`;
    },
    finalKey(memberId, uploadId) {
      return `${memberId}/final/${uploadId}/${randomHex(16)}`;
    },
    async presignPut(stagingKey, contentType, byteSize) {
      if (!STAGING_KEY.test(stagingKey)) throw new FinanceError(400, "Invalid upload path.");
      if (byteSize <= 0 || byteSize > FINANCE_FILE_LIMIT_BYTES) throw new FinanceError(400, "Each file must be 10 MB or smaller.", [{ field: "files", message: "Each file must be 10 MB or smaller." }]);
      try {
        return await getSignedUrl(client, new PutObjectCommand({
          Bucket: bucket,
          Key: stagingKey,
          ContentType: contentType,
          ContentLength: byteSize,
        }), { expiresIn: FINANCE_PRESIGN_SECONDS });
      } catch {
        throw new FinanceError(503, "Could not authorize the upload. Try again.");
      }
    },
    async presignGet(storageKey, fileName, contentType) {
      if (!FINAL_KEY.test(storageKey) && !STAGING_KEY.test(storageKey)) throw new FinanceError(404, "File not found.");
      try {
        return await getSignedUrl(client, new GetObjectCommand({
          Bucket: bucket,
          Key: storageKey,
          ResponseContentType: contentType,
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
        }), { expiresIn: FINANCE_PRESIGN_SECONDS });
      } catch {
        throw new FinanceError(503, "Could not prepare the download. Try again.");
      }
    },
    async headObject(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        const byteSize = Number(result.ContentLength ?? 0);
        if (!Number.isFinite(byteSize) || byteSize <= 0) throw new FinanceError(400, "Uploaded file is empty.", [{ field: "files", message: "Uploaded file is empty." }]);
        return { byteSize, contentType: result.ContentType };
      } catch (error) {
        if (error instanceof FinanceError) throw error;
        throw new FinanceError(400, "Supporting file is missing or not finalized.", [{ field: "files", message: "Supporting file is missing or not finalized." }]);
      }
    },
    async readSignature(key, length) {
      return this.readObject(key, length);
    },
    async readObject(key, byteSize) {
      const result = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: byteSize > 0 ? `bytes=0-${byteSize - 1}` : undefined,
      }));
      const body = result.Body;
      if (!body) throw new FinanceError(400, "Supporting file is missing or not finalized.", [{ field: "files", message: "Supporting file is missing or not finalized." }]);
      return body.transformToByteArray();
    },
    async promoteStagingToFinal(stagingKey, finalKey, contentType, byteSize) {
      if (!STAGING_KEY.test(stagingKey) || !FINAL_KEY.test(finalKey)) throw new FinanceError(400, "Invalid upload path.");
      try {
        await client.send(new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${stagingKey}`,
          Key: finalKey,
          ContentType: contentType,
          MetadataDirective: "REPLACE",
          ContentLength: byteSize,
        }));
      } catch {
        throw new FinanceError(503, "Could not finalize the upload. Try again.");
      }
    },
    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        throw new FinanceError(503, "File cleanup is pending. Try again.");
      }
    },
  };
}

export function isOwnedStagingKey(memberId: string, key: string): boolean {
  return STAGING_KEY.test(key) && key.startsWith(`${memberId}/`);
}

export function isOwnedFinalKey(memberId: string, key: string): boolean {
  return FINAL_KEY.test(key) && key.startsWith(`${memberId}/`);
}
