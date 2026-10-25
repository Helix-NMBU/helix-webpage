import { describe, expect, it, vi } from "vitest";
import { createCvServices, type CvDatabase } from "./member-cv-service.js";
import type { CvObjectStorage } from "./member-cv-storage.js";

const authUser = "10000000-0000-4000-8000-00000000000a";
const memberId = "10000000-0000-4000-8000-000000000001";
const retiredPath = `${memberId}/30000000-0000-4000-8000-000000000002.pdf`;
const currentPath = `${memberId}/30000000-0000-4000-8000-000000000003.pdf`;

function servicesFor(db: CvDatabase, storage: CvObjectStorage, verifyGoogle = vi.fn(async () => ({ email: "ase@helixnmbu.no", emailVerified: true, hd: "helixnmbu.no", googleSub: "google-ase" }))) {
  return createCvServices({
    db,
    storage,
    verifySession: async () => ({ userId: authUser }),
    verifyGoogle,
  });
}

describe("Neon member access", () => {
  it("uses the stored administrator name and re-reads assignments after onboarding", async () => {
    let reads = 0;
    const db: CvDatabase = { query: async <T,>(sql: string, params?: unknown[]) => {
      if (sql.includes("neon_auth")) return { rows: [{ email: "ase@helixnmbu.no", name: "Google name", email_verified: true, banned: false, account_id: "google-ase", id_token: null }] as T[] };
      if (sql.includes("from identity.members")) return { rows: [{ id: memberId, google_sub: "google-ase", email: "ase@helixnmbu.no", full_name: ++reads === 1 ? "Stored admin name" : "New admin name", helix_role: "Mechanical lead" }] as T[] };
      if (sql.includes("onboard_member")) {
        expect(params?.[3]).toBe("Stored admin name");
        return { rows: [{ onboard_member: memberId }] as T[] };
      }
      throw new Error(sql);
    } };
    const identity = await servicesFor(db, { putPdf: vi.fn(), remove: vi.fn(), presign: vi.fn() }).authenticate("session");
    expect(identity).toMatchObject({ name: "New admin name", helixRole: "Mechanical lead" });
    expect(reads).toBe(2);
  });
  it("proves Workspace domain from the stored Google ID token before creating a profile", async () => {
    const calls: string[] = [];
    const verifyGoogle = vi.fn(async () => ({ email: "ase@helixnmbu.no", emailVerified: true, hd: "gmail.com", googleSub: "google-ase" }));
    const db: CvDatabase = { query: async <T,>(sql: string) => {
      calls.push(sql);
      if (sql.includes("neon_auth")) return { rows: [{ email: "ase@helixnmbu.no", name: "Åse", email_verified: true, banned: false, account_id: "google-ase", id_token: "google-id-token" }] as T[] };
      if (sql.includes("identity.members")) return { rows: [] };
      throw new Error(sql);
    } };
    const storage: CvObjectStorage = { putPdf: vi.fn(), remove: vi.fn(), presign: vi.fn() };
    await expect(servicesFor(db, storage, verifyGoogle).authenticate("session")).rejects.toThrow("verified @helixnmbu.no");
    expect(verifyGoogle).toHaveBeenCalledWith("google-id-token");
    expect(calls.some((sql) => sql.includes("onboard_member"))).toBe(false);
  });

  it("does not require a fresh Google ID token after the Workspace link is stored", async () => {
    const verifyGoogle = vi.fn();
    const db: CvDatabase = { query: async <T,>(sql: string) => {
      if (sql.includes("neon_auth")) return { rows: [{ email: "ase@helixnmbu.no", name: "Åse", email_verified: true, banned: false, account_id: "google-ase", id_token: null }] as T[] };
      if (sql.includes("from identity.members")) return { rows: [{ id: memberId, google_sub: "google-ase", email: "ase@helixnmbu.no", full_name: "Åse", helix_role: "Mechanical lead" }] as T[] };
      if (sql.includes("onboard_member")) return { rows: [{ onboard_member: memberId }] as T[] };
      throw new Error(sql);
    } };
    const identity = await servicesFor(db, { putPdf: vi.fn(), remove: vi.fn(), presign: vi.fn() }, verifyGoogle).authenticate("session");
    expect(identity).toMatchObject({ userId: memberId, email: "ase@helixnmbu.no", googleSub: "google-ase", helixRole: "Mechanical lead" });
    expect(verifyGoogle).not.toHaveBeenCalled();
  });
});

describe("CV file cleanup", () => {
  function fixture({ storageFails = false, queuedPath = retiredPath, settlementFails = false, notBefore = new Date(0).toISOString() } = {}) {
    let queueExists = true;
    let removed = false;
    const requests: string[] = [];
    const db: CvDatabase = { query: async <T,>(sql: string) => {
      requests.push(sql);
      if (sql.includes("settle_upload")) {
        if (settlementFails) throw new Error("database unavailable");
        return { rows: [] };
      }
      if (sql.includes("delete from cv.file_cleanup")) { queueExists = false; return { rows: [] }; }
      if (sql.includes("from cv.file_cleanup")) return { rows: (queueExists ? [{ path: queuedPath, not_before: notBefore }] : []) as T[] };
      if (sql.includes("published_path")) return { rows: [{ published_path: currentPath, cv_path: currentPath }] as T[] };
      if (sql.includes("upload_candidates")) return { rows: [] };
      throw new Error(sql);
    } };
    const storage: CvObjectStorage = {
      putPdf: vi.fn(),
      presign: vi.fn(),
      remove: vi.fn(async () => {
        if (storageFails) throw new Error("storage unavailable");
        removed = true;
      }),
    };
    return { service: servicesFor(db, storage), requests, queueExists: () => queueExists, removed: () => removed };
  }

  it("keeps the cleanup row when object deletion fails", async () => {
    const f = fixture({ storageFails: true });
    await expect(f.service.cleanup(memberId)).rejects.toThrow("retired file deletion is pending");
    expect(f.queueExists()).toBe(true);
    expect(f.requests.some((sql) => sql.includes("delete from cv.file_cleanup"))).toBe(false);
  });

  it("never deletes the current PDF when a stale cleanup row names it", async () => {
    const f = fixture({ queuedPath: currentPath });
    await f.service.cleanup(memberId);
    expect(f.removed()).toBe(false);
    expect(f.queueExists()).toBe(false);
  });

  it("does not touch storage unless settlement succeeded", async () => {
    const f = fixture({ settlementFails: true });
    await expect(f.service.cleanup(memberId)).rejects.toThrow("cleanup is pending");
    expect(f.removed()).toBe(false);
    expect(f.requests).toHaveLength(1);
  });

  it("waits out an uncertain upload before deleting the object", async () => {
    const now = Date.now();
    const f = fixture({ notBefore: new Date(now + 15 * 60 * 1000).toISOString() });
    await expect(f.service.cleanup(memberId)).rejects.toThrow("uncertain upload settles");
    expect(f.removed()).toBe(false);
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 16 * 60 * 1000);
    try {
      await f.service.cleanup(memberId);
      expect(f.removed()).toBe(true);
      expect(f.queueExists()).toBe(false);
    } finally { clock.mockRestore(); }
  });
});
