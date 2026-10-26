import { describe, expect, it } from "vitest";
import { assertGeneratedPdf, createCvStorage, isOwnedPdfPath, PRESIGN_SECONDS } from "../../../api/_lib/member-cv-storage.js";

const member = "10000000-0000-4000-8000-000000000001";
const file = "30000000-0000-4000-8000-000000000001";

describe("private CV object rules", () => {
  it("accepts a small generated PDF owned by the member", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(() => assertGeneratedPdf(bytes)).not.toThrow();
    expect(isOwnedPdfPath(member, `${member}/${file}.pdf`)).toBe(true);
  });

  it("rejects another member's key, a non-PDF, and an oversized file", () => {
    expect(isOwnedPdfPath(member, `${file}/${file}.pdf`)).toBe(false);
    expect(isOwnedPdfPath(member, `${member}/notes.txt`)).toBe(false);
    expect(() => assertGeneratedPdf(new Uint8Array([1, 2, 3, 4, 5]))).toThrow("must be a PDF");
    expect(() => assertGeneratedPdf(new Uint8Array(5 * 1024 * 1024 + 1))).toThrow("smaller than 5 MB");
  });

  it("signs bounded inline and attachment actions without contacting storage", async () => {
    const storage = createCvStorage({ NEON_STORAGE_BUCKET: "member-cvs", NEON_S3_ENDPOINT: "https://storage.example.invalid", NEON_S3_REGION: "eu-central-1", AWS_ACCESS_KEY_ID: "fixture", AWS_SECRET_ACCESS_KEY: "fixture-secret" });
    const defaultUrl = new URL(await storage.presign(`${member}/${file}.pdf`));
    const inlineUrl = new URL(await storage.presign(`${member}/${file}.pdf`, "inline"));
    expect(defaultUrl.searchParams.get("response-content-disposition")).toBe('attachment; filename="helix-cv.pdf"');
    expect(inlineUrl.searchParams.get("response-content-disposition")).toBe('inline; filename="helix-cv.pdf"');
    expect(defaultUrl.searchParams.get("X-Amz-Expires")).toBe(String(PRESIGN_SECONDS));
    expect(inlineUrl.searchParams.get("X-Amz-Expires")).toBe(String(PRESIGN_SECONDS));
  });
});
