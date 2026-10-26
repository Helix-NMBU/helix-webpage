import { describe, expect, it } from "vitest";
import { createWebsiteStorage } from "./website-storage.js";

describe("private application storage", () => {
  const env = { NEON_APPLICATIONS_BUCKET: "applications", NEON_S3_ENDPOINT: "https://storage.example.test",
    NEON_S3_REGION: "eu-central-1", AWS_ACCESS_KEY_ID: "test-id", AWS_SECRET_ACCESS_KEY: "test-secret" };
  it("requires the dedicated application bucket and never falls back to the member CV bucket", () => {
    expect(() => createWebsiteStorage({ ...env, NEON_APPLICATIONS_BUCKET: undefined, NEON_STORAGE_BUCKET: "member-cvs" })).toThrow("unavailable");
  });
  it("signs a path-style, two-minute attachment download locally without fetching any object", async () => {
    const url = new URL(await createWebsiteStorage(env).download("S27/test/cv.pdf", "cv"));
    expect(url.origin).toBe("https://storage.example.test");
    expect(url.pathname).toBe("/applications/S27/test/cv.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="application-cv.pdf"');
  });
});
