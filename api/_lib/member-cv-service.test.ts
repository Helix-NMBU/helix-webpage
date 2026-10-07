import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { supabaseCvServices } from "./member-cv-service";

const userId = "10000000-0000-4000-8000-000000000001";
const retiredPath = `${userId}/retired.pdf`;
const currentPath = `${userId}/current.pdf`;
function fixture({ storageFails = false, queuedPath = retiredPath, settlementFails = false, notBefore = new Date(0).toISOString() } = {}) {
  const requests: { method: string; path: string }[] = [];
  let queueExists = true;
  let objectExists = false;
  const fetch: typeof globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = options?.method ?? (input instanceof Request ? input.method : "GET");
    requests.push({ method, path: url.pathname });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("/rpc/settle_member_cv_upload")) return settlementFails ? json({ message: "Database unavailable", code: "" }, 503) : json({});
    if (url.pathname.endsWith("/member_cv_file_cleanup")) {
      if (method === "DELETE") { queueExists = false; return json([]); }
      return json(queueExists ? [{ path: queuedPath, not_before: notBefore }] : []);
    }
    if (url.pathname.endsWith("/member_cv_documents")) return json({ published_path: currentPath });
    if (url.pathname.endsWith("/students")) return json({ cv_url: currentPath });
    if (url.pathname.endsWith("/member_cv_upload_candidates")) return json([]);
    if (url.pathname.endsWith("/object/member-cvs")) {
      if (storageFails) return json({ statusCode: "503", error: "StorageUnavailable", message: "Storage unavailable" }, 503);
      objectExists = false;
      return json([]);
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };
  const client = createClient("https://member-cv-tests.supabase.test", "fictional-key", { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false } });
  return { service: supabaseCvServices({ auth: client, admin: client }), requests, queueExists: () => queueExists, completeLateUpload: () => { objectExists = true; }, objectExists: () => objectExists };
}

describe("production CV cleanup adapter", () => {
  it("keeps durable cleanup metadata when Storage deletion fails", async () => {
    const f = fixture({ storageFails: true });
    await expect(f.service.cleanup(userId)).rejects.toThrow("retired file deletion is pending");
    expect(f.queueExists()).toBe(true);
    expect(f.requests.some((item) => item.method === "DELETE" && item.path.endsWith("/member_cv_file_cleanup"))).toBe(false);
    expect(f.requests[0].path).toMatch(/\/rpc\/settle_member_cv_upload$/);
  });
  it("never deletes the current PDF even if a stale cleanup entry names it", async () => {
    const f = fixture({ queuedPath: currentPath });
    await f.service.cleanup(userId);
    expect(f.requests.some((item) => item.path.endsWith("/object/member-cvs"))).toBe(false);
    expect(f.queueExists()).toBe(false);
  });
  it("does not touch Storage unless database settlement succeeded", async () => {
    const f = fixture({ settlementFails: true });
    await expect(f.service.cleanup(userId)).rejects.toThrow("cleanup is pending");
    expect(f.queueExists()).toBe(true);
    expect(f.requests).toHaveLength(1);
  });
  it("retains deferred cleanup through late Storage completion and deletes only after its settlement window", async () => {
    const now = Date.now();
    const f = fixture({ notBefore: new Date(now + 15 * 60 * 1000).toISOString() });
    await expect(f.service.cleanup(userId)).rejects.toThrow("uncertain upload settles");
    expect(f.requests.some((item) => item.path.endsWith("/object/member-cvs"))).toBe(false);
    expect(f.queueExists()).toBe(true);
    f.completeLateUpload();
    expect(f.objectExists()).toBe(true);
    await expect(f.service.cleanup(userId)).rejects.toThrow("uncertain upload settles");
    expect(f.objectExists()).toBe(true);
    expect(f.queueExists()).toBe(true);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 16 * 60 * 1000);
    try {
      await f.service.cleanup(userId);
      expect(f.objectExists()).toBe(false);
      expect(f.queueExists()).toBe(false);
    } finally { clock.mockRestore(); }
  });

});
