import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MemberCvError } from "./member-cv-error.js";

export interface WebsiteStorage {
  put(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  download(path: string, kind: "cv" | "photo"): Promise<string>;
}
export function createWebsiteStorage(env: NodeJS.ProcessEnv = process.env): WebsiteStorage {
  // Dedicated PRIVATE bucket. Never fall back to the member CV bucket.
  const bucket = env.NEON_APPLICATIONS_BUCKET;
  const endpoint = env.NEON_S3_ENDPOINT;
  const region = env.NEON_S3_REGION;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) throw new MemberCvError(503, "Application file storage is unavailable. Please try again later.");
  const client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
  return {
    async put(path, bytes) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: bytes, ContentType: "application/pdf", ContentLength: bytes.byteLength }));
    },
    async remove(path) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path })); },
    async download(path, kind) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: path,
        ResponseContentDisposition: `attachment; filename="${kind === "cv" ? "application-cv.pdf" : "application-photo"}"`,
        ...(kind === "cv" ? { ResponseContentType: "application/pdf" } : {}),
      }), { expiresIn: 120 });
    },
  };
}
