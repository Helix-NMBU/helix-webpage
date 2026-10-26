import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MemberCvError } from "./member-cv-error.js";

export const PDF_LIMIT_BYTES = 5 * 1024 * 1024;
export const PRESIGN_SECONDS = 120;
const OWNED_PDF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export function isOwnedPdfPath(memberId: string, path: string): boolean {
  return OWNED_PDF.test(path) && path.startsWith(`${memberId}/`);
}

export function assertGeneratedPdf(bytes: Uint8Array): void {
  if (!bytes.length || bytes.byteLength > PDF_LIMIT_BYTES) throw new MemberCvError(400, "The generated PDF must be smaller than 5 MB.");
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  if (header !== "%PDF-") throw new MemberCvError(400, "The generated CV must be a PDF.");
}

export interface CvObjectStorage {
  putPdf(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  presign(path: string, disposition?: "inline" | "attachment"): Promise<string>;
}

export function createCvStorage(env: NodeJS.ProcessEnv = process.env): CvObjectStorage {
  const bucket = env.NEON_STORAGE_BUCKET;
  const endpoint = env.NEON_S3_ENDPOINT;
  const region = env.NEON_S3_REGION;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new MemberCvError(503, "Member portal server configuration is missing.");
  }
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    async putPdf(path, bytes) {
      assertGeneratedPdf(bytes);
      if (!OWNED_PDF.test(path)) throw new MemberCvError(400, "The generated CV must be a PDF.");
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: path,
          Body: bytes,
          ContentType: "application/pdf",
          ContentLength: bytes.byteLength,
        }));
      } catch {
        throw new MemberCvError(503, "Could not store the generated CV. Publication has not changed.");
      }
    },
    async remove(path) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
      } catch {
        throw new MemberCvError(503, "Publication visibility has changed, but retired file deletion is pending. Reload your CV to retry cleanup.");
      }
    },
    async presign(path, disposition = "attachment") {
      if (!OWNED_PDF.test(path)) throw new MemberCvError(404, "No published CV is available to download.");
      try {
        return await getSignedUrl(client, new GetObjectCommand({
          Bucket: bucket,
          Key: path,
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: `${disposition}; filename="helix-cv.pdf"`,
        }), { expiresIn: PRESIGN_SECONDS });
      } catch {
        throw new MemberCvError(503, "Could not load your CV.");
      }
    },
  };
}
