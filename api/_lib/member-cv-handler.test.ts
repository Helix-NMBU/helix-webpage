import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { emptyCv } from "../../src/features/MemberCV/model.js";
import type { CvData, CvSharing } from "../../src/features/MemberCV/types.js";
import { createMemberCvHandler } from "./member-cv-handler.js";
import { MemberCvError, type CvServices, type StoredCv } from "./member-cv-service.js";

const userId = "cfccf73f-0043-4a02-86c8-e86d4d2f02fd";
const privateChoices: CvSharing = { cv: false, email: false, phone: false };
function publishedData(): CvData {
  return { ...emptyCv("Åse Ødegård", "ase@helixnmbu.no"), phone: "+47 12345678", education: [{ id: "one", institution: "NMBU", degree: "MSc", startDate: "", endDate: "", description: "" }] };
}
function response() {
  let status = 0;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = { setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }), status: vi.fn((code: number) => { status = code; return res; }), json: vi.fn((value: unknown) => { body = value; return res; }), send: vi.fn((value: unknown) => { body = value; return res; }) };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) };
}
function fixture() {
  let state: StoredCv = { draft: emptyCv(), sharing: privateChoices, revision: 0, publishedRevision: null, publishedAt: null, publishedPath: null };
  let snapshot: CvData | null = null;
  const stored = new Map<string, Uint8Array>();
  const retired = new Set<string>();
  const candidates = new Map<string, "pending" | "current" | "retired" | "deleted">();
  let pathIndex = 0;
  const services: CvServices = {
    authenticate: vi.fn(async (token) => { if (token !== "member-token") throw new MemberCvError(401, "Invalid session."); return { userId, googleSub: "google-sub", email: "ase@helixnmbu.no", name: "Åse" }; }),
    read: vi.fn(async (id) => { expect(id).toBe(userId); return structuredClone(state); }),
    commit: vi.fn(async (id, change) => {
      expect(id).toBe(userId);
      if (change.expectedRevision !== state.revision) throw new MemberCvError(409, "Revision conflict.");
      if (change.path && candidates.get(change.path) !== "pending") throw new MemberCvError(409, "Upload candidate cancelled.");
      if (change.draft) state.draft = structuredClone(change.draft);
      if (change.sharing) state.sharing = structuredClone(change.sharing);
      state.revision++;
      if (change.action !== "save") {
        if (state.publishedPath) retired.add(state.publishedPath);
        state.publishedPath = change.path ?? null;
        if (change.path) candidates.set(change.path, "current");
        state.publishedRevision = change.action === "publish" ? state.revision : null;
        state.publishedAt = change.action === "publish" ? "2026-10-06" : null;
        snapshot = change.action === "publish" ? structuredClone(change.draft!) : null;
      }
      return structuredClone(state);
    }),
    upload: vi.fn(async (path, bytes) => { stored.set(path, bytes); }),
    prepareUpload: vi.fn(async (id, path, revision) => {
      expect(id).toBe(userId);
      if (revision !== state.revision) throw new MemberCvError(409, "Revision conflict.");
      candidates.set(path, "pending");
    }),
    settleUpload: vi.fn(async (id, path) => {
      expect(id).toBe(userId);
      if (path && state.publishedPath !== path) { candidates.set(path, "retired"); retired.add(path); }
      return structuredClone(state);
    }),
    cleanup: vi.fn(async (id) => {
      expect(id).toBe(userId);
      for (const path of retired) { stored.delete(path); candidates.set(path, "deleted"); }
      retired.clear();
    }),
    newPath: () => `${userId}/${++pathIndex}.pdf`,
  };
  const render = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
  const handler = createMemberCvHandler(render, () => services);
  async function request(body?: unknown, token = "member-token", method = body ? "POST" : "GET") {
    const res = response();
    await handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} } as VercelRequest, res.res);
    return res.result();
  }
  return { request, services, render, stored, candidates, state: () => state, snapshot: () => snapshot };
}

describe("member CV handler", () => {
  it("requires a live member session and does not expose a storage path", async () => {
    const f = fixture();
    expect((await f.request(undefined, "")).status).toBe(401);
    expect((await f.request(undefined, "expired")).status).toBe(401);
    const result = await f.request();
    expect(result.status).toBe(200);
    expect(result.body).not.toHaveProperty("document.publishedPath");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });
  it("rejects a token without server-verified Workspace membership", async () => {
    const f = fixture();
    vi.mocked(f.services.authenticate).mockRejectedValue(new MemberCvError(403, "Verified Workspace required."));
    expect((await f.request()).status).toBe(403);
    expect(f.services.read).not.toHaveBeenCalled();
  });
  it("uses authenticated ownership instead of client user IDs and retains incomplete drafts", async () => {
    const f = fixture();
    const draft = emptyCv();
    const result = await f.request({ action: "save", userId: "another-user", draft, sharing: privateChoices, expectedRevision: 0 });
    expect(result.status).toBe(200);
    expect(f.services.commit).toHaveBeenCalledWith(userId, expect.objectContaining({ expectedRevision: 0 }));
    expect(f.state().draft).toEqual(draft);
    expect(f.snapshot()).toBeNull();
  });
  it("rejects malformed, oversized, unsafe-link and incomplete-publication input before writing", async () => {
    const f = fixture();
    for (const draft of [undefined, { ...emptyCv(), summary: "x".repeat(8001) }, { ...emptyCv(), links: [{ id: "x", label: "Website", url: "javascript:alert(1)" }] }]) {
      expect((await f.request({ action: "save", draft, sharing: privateChoices, expectedRevision: 0 })).status).toBe(400);
    }
    expect((await f.request({ action: "publish", draft: emptyCv(), sharing: privateChoices, expectedRevision: 0 })).status).toBe(400);
    expect((await f.request({ action: "save", draft: emptyCv(), sharing: privateChoices, expectedRevision: -1 })).status).toBe(400);
    expect(f.services.commit).not.toHaveBeenCalled();
  });
  it("previews redacted unsaved input without changing drafts or publications", async () => {
    const f = fixture();
    const result = await f.request({ action: "preview", draft: publishedData(), sharing: privateChoices });
    expect(result.status).toBe(200);
    expect(result.headers["Content-Type"]).toBe("application/pdf");
    expect(f.render).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: "", phone: "", fullName: "Åse Ødegård" }), privateChoices);
    expect(f.services.commit).not.toHaveBeenCalled();
    expect(f.services.upload).not.toHaveBeenCalled();
  });
  it("publishes generated bytes, keeps publication independent of draft saves, replaces files and withdraws", async () => {
    const f = fixture();
    const sharing = { cv: true, email: false, phone: false };
    expect((await f.request({ action: "publish", draft: publishedData(), sharing, expectedRevision: 0 })).status).toBe(200);
    const firstPath = f.state().publishedPath!;
    expect(f.stored.has(firstPath)).toBe(true);
    expect(f.render).toHaveBeenLastCalledWith(expect.objectContaining({ contactEmail: "", phone: "" }), sharing);
    expect((await f.request({ action: "save", draft: { ...publishedData(), fullName: "New draft" }, sharing, expectedRevision: 1 })).status).toBe(200);
    expect(f.snapshot()?.fullName).toBe("Åse Ødegård");
    expect(f.state().publishedRevision).toBe(1);
    expect((await f.request({ action: "publish", draft: { ...publishedData(), fullName: "Published update" }, sharing, expectedRevision: 2 })).status).toBe(200);
    expect(f.stored.has(firstPath)).toBe(false);
    expect(f.stored.size).toBe(1);
    expect((await f.request({ action: "withdraw", expectedRevision: 3 })).status).toBe(200);
    expect(f.state().publishedRevision).toBeNull();
    expect(f.state().draft.fullName).toBe("Published update");
    expect(f.stored.size).toBe(0);
  });
  it("removes a newly generated PDF when a stale publication loses its revision race", async () => {
    const f = fixture();
    const upload = vi.mocked(f.services.upload).getMockImplementation()!;
    vi.mocked(f.services.upload).mockImplementationOnce(async (path, bytes) => {
      // Another editor saves after this request registered its upload candidate.
      await f.services.commit(userId, { action: "save", expectedRevision: 0, draft: emptyCv(), sharing: privateChoices });
      await upload(path, bytes);
    });
    expect((await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 })).status).toBe(409);
    expect(f.services.settleUpload).toHaveBeenCalled();
    expect(f.stored.size).toBe(0);
    expect(f.state().revision).toBe(1);
    expect(f.snapshot()).toBeNull();
  });
  it("does not change publication when renderer or upload fails", async () => {
    const f = fixture();
    f.render.mockRejectedValueOnce(new Error("Renderer failed"));
    expect((await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 })).status).toBe(503);
    vi.mocked(f.services.upload).mockRejectedValueOnce(new MemberCvError(503, "Upload failed"));
    expect((await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 })).status).toBe(503);
    expect(f.state().revision).toBe(0);
    expect(f.services.commit).not.toHaveBeenCalled();
    expect(f.services.settleUpload).toHaveBeenCalledWith(userId, expect.any(String), true);
  });
  it("reports post-commit cleanup failure and allows subsequent cleanup retry without undoing visibility", async () => {
    const f = fixture();
    vi.mocked(f.services.cleanup).mockRejectedValueOnce(new MemberCvError(503, "Retired file deletion is pending."));
    const result = await f.request({ action: "publish", draft: publishedData(), sharing: privateChoices, expectedRevision: 0 });
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty("cleanupPending", true);
    expect(f.state().publishedRevision).toBe(1);
    expect((await f.request()).status).toBe(200);
  });
  it("recovers an applied publication after its RPC response is lost without deleting its PDF", async () => {
    const f = fixture();
    const originalCommit = vi.mocked(f.services.commit).getMockImplementation()!;
    vi.mocked(f.services.commit).mockImplementationOnce(async (id, change) => {
      await originalCommit(id, change);
      throw new MemberCvError(503, "RPC transport failed after commit.");
    });
    // PostgreSQL JSONB readback orders object keys differently from the input.
    vi.mocked(f.services.settleUpload).mockImplementationOnce(async () => ({ ...structuredClone(f.state()), draft: Object.fromEntries(Object.entries(f.state().draft).reverse()) as CvData, sharing: { phone: false, email: false, cv: true } }));
    const result = await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 });
    expect(result.status).toBe(200);
    expect(f.stored.has(f.state().publishedPath!)).toBe(true);
    expect(f.services.settleUpload).toHaveBeenCalled();
  });
  it("preserves uploaded bytes when an uncertain RPC and readback both fail", async () => {
    const f = fixture();
    const originalCommit = vi.mocked(f.services.commit).getMockImplementation()!;
    vi.mocked(f.services.commit).mockImplementationOnce(async (id, change) => {
      await originalCommit(id, change);
      throw new MemberCvError(503, "Unknown publication result.");
    });
    vi.mocked(f.services.settleUpload).mockRejectedValueOnce(new MemberCvError(503, "Settlement unavailable."));
    const result = await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: expect.stringContaining("result could not be confirmed") });
    expect(f.services.settleUpload).toHaveBeenCalled();
    expect(f.stored.has(f.state().publishedPath!)).toBe(true);
    expect(f.candidates.get(f.state().publishedPath!)).toBe("current");
    expect((await f.request()).status).toBe(200);
  });
  it("cleans a definitely unused upload when readback confirms the publication did not apply", async () => {
    const f = fixture();
    vi.mocked(f.services.commit).mockRejectedValueOnce(new MemberCvError(503, "Database request failed."));
    expect((await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 })).status).toBe(503);
    expect(f.stored.size).toBe(0);
    expect(f.state().revision).toBe(0);
  });
  it("allows GET, draft save and visibility withdrawal during a retired-file Storage outage", async () => {
    const f = fixture();
    await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 });
    const publishedPath = f.state().publishedPath!;
    vi.mocked(f.services.cleanup).mockRejectedValue(new MemberCvError(503, "Storage unavailable."));
    const get = await f.request();
    expect(get.status).toBe(200);
    expect(get.body).toHaveProperty("cleanupPending", true);
    const save = await f.request({ action: "save", draft: { ...publishedData(), fullName: "New private draft" }, sharing: privateChoices, expectedRevision: 1 });
    expect(save.status).toBe(200);
    expect(save.body).toHaveProperty("document.revision", 2);
    const withdraw = await f.request({ action: "withdraw", expectedRevision: 2 });
    expect(withdraw.status).toBe(200);
    expect(withdraw.body).toHaveProperty("cleanupPending", true);
    expect(f.state().publishedPath).toBeNull();
    expect(f.state().publishedRevision).toBeNull();
    expect(f.state().draft.fullName).toBe("New private draft");
    expect(f.stored.has(publishedPath)).toBe(true);
  });
  it("persists the upload candidate before any bytes are sent and tracks failed settlement", async () => {
    const f = fixture();
    vi.mocked(f.services.upload).mockImplementationOnce(async (path, bytes) => {
      expect(f.candidates.get(path)).toBe("pending");
      f.stored.set(path, bytes);
      throw new MemberCvError(503, "Upload response lost.");
    });
    vi.mocked(f.services.settleUpload).mockRejectedValueOnce(new MemberCvError(503, "Database unavailable."));
    expect((await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0 })).status).toBe(503);
    expect(f.state().revision).toBe(0);
    expect(f.stored.size).toBe(1);
    expect([...f.candidates.values()]).toEqual(["pending"]);
  });
  it("never trusts client-provided PDF bytes", async () => {
    const f = fixture();
    await f.request({ action: "publish", draft: publishedData(), sharing: { ...privateChoices, cv: true }, expectedRevision: 0, pdf: "private injected file" });
    expect(f.services.upload).toHaveBeenCalledWith(expect.any(String), new Uint8Array([37, 80, 68, 70]));
  });
});
