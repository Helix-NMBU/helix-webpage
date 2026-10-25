import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCvRepository,
  CvRequestError,
  memberLoginDestination,
} from "./repository";
import { createDemoRepository, DEMO_STORAGE_KEY, fictionalCv } from "./demo";
import type { CvEnvelope } from "./types";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("member CV repository", () => {
  it("uses the current session token and never sends a user ID selected by the client", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const token = vi
      .fn()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("refreshed-token");
    const repository = createCvRepository(token, request);
    await repository.load();
    await repository.mutate({ action: "withdraw", expectedRevision: 4 });
    expect(request.mock.calls[0]).toEqual([
      "/api/member-cv",
      { method: "GET", headers: { Authorization: "Bearer first-token" } },
    ]);
    expect(request.mock.calls[1]).toEqual([
      "/api/member-cv",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer refreshed-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "withdraw", expectedRevision: 4 }),
      },
    ]);
  });
  it("reports stale saves as a typed conflict and never retries an uncertain mutation", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Revision conflict" }), {
          status: 409,
        }),
      );
    const repository = createCvRepository(async () => "token", request);
    await expect(
      repository.mutate({
        action: "save",
        draft: fictionalCv(),
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 409, message: "Revision conflict" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("fails before sending a request when a session has ended", async () => {
    const request = vi.fn<typeof fetch>();
    const repository = createCvRepository(async () => {
      throw new CvRequestError("Session ended", 401);
    }, request);
    await expect(repository.load()).rejects.toMatchObject({ status: 401 });
    expect(request).not.toHaveBeenCalled();
  });
  it("previews submitted data without requesting a save", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("pdf bytes", {
          headers: { "Content-Type": "application/pdf" },
        }),
      );
    const repository = createCvRepository(async () => "token", request);
    const blob = await repository.preview({
      action: "preview",
      draft: fictionalCv(),
      sharing: { cv: false, email: false, phone: false },
    });
    expect(blob.type).toBe("application/pdf");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).action).toBe(
      "preview",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("published CV download", () => {
  it("requests the caller's presigned file and surfaces a missing publication", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://storage.example/signed", expiresIn: 120 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "No published CV is available to download." }), { status: 404 }),
      );
    const repository = createCvRepository(async () => "member-token", request);
    await expect(repository.downloadPublished()).resolves.toEqual({
      url: "https://storage.example/signed",
      expiresIn: 120,
    });
    expect(request.mock.calls[0]).toEqual([
      "/api/member-cv-file",
      { method: "GET", headers: { Authorization: "Bearer member-token" } },
    ]);
    await expect(repository.downloadPublished()).rejects.toMatchObject({
      status: 404,
      message: "No published CV is available to download.",
    });
  });
});

describe("pending retired file cleanup", () => {
  it("keeps a successful publication response and its new revision when cleanup is pending", async () => {
    const envelope = {
      identity: { email: "alex@example.invalid", name: "Alex Example" },
      document: {
        draft: fictionalCv(),
        sharing: { cv: true, email: false, phone: false },
        revision: 2,
        publishedRevision: 2,
        publishedAt: "2026-10-06T12:00:00Z",
      },
      cleanupPending: true,
    };
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify(envelope), { status: 200 }),
      );
    const repository = createCvRepository(async () => "token", request);
    const saved = await repository.mutate({
      action: "publish",
      draft: fictionalCv(),
      expectedRevision: 1,
    });
    expect(saved).toEqual(envelope);
    expect(saved.document.revision).toBe(2);
    expect(saved.document.publishedRevision).toBe(2);
    const reloaded = await repository.load();
    expect(reloaded).toMatchObject({
      cleanupPending: true,
      document: { revision: 2 },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe("fictional demo lifecycle", () => {
  beforeEach(() => {
    vi.stubEnv("MODE", "member-local");
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5190" } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it.each([
    { mode: "development", dev: true, origin: "http://127.0.0.1:5190" },
    { mode: "member-local", dev: true, origin: "http://192.168.1.20:5190" },
    { mode: "member-local", dev: false, origin: "http://127.0.0.1:5190" },
  ])("rejects fixture access outside dedicated loopback development: %j", ({ mode, dev, origin }) => {
    vi.stubEnv("MODE", mode);
    vi.stubEnv("DEV", dev);
    vi.stubGlobal("window", { location: { origin } });
    expect(() => createDemoRepository(storage(), true)).toThrow("only available in development");
  });
  it("keeps saved drafts across reloads and separate from the published version", async () => {
    const local = storage();
    const repository = createDemoRepository(local, true);
    const initial = await repository.load();
    expect(initial.document.publishedRevision).toBeNull();
    const draft = fictionalCv();
    const sharing = { cv: true, email: false, phone: false };
    await repository.mutate({
      action: "save",
      draft,
      sharing,
      expectedRevision: 0,
    });
    const restored = await createDemoRepository(local, true).load();
    expect(restored.document.draft.fullName).toBe("Alex Example");
    expect(restored.document.publishedRevision).toBeNull();
    const published = await repository.mutate({
      action: "publish",
      draft,
      sharing,
      expectedRevision: 1,
    });
    expect(published.document.publishedRevision).toBe(2);
    const changed = { ...draft, summary: "Private edits" };
    await repository.mutate({
      action: "save",
      draft: changed,
      sharing,
      expectedRevision: 2,
    });
    const saved = JSON.parse(local.getItem(DEMO_STORAGE_KEY)!) as CvEnvelope & {
      published: { draft: typeof draft } | null;
    };
    expect(saved.document.draft.summary).toBe("Private edits");
    expect(saved.published?.draft.summary).toBe(draft.summary);
    expect(saved.document.publishedRevision).toBe(2);
    const withdrawn = await repository.mutate({
      action: "withdraw",
      expectedRevision: 3,
    });
    expect(withdrawn.document.publishedRevision).toBeNull();
    expect(withdrawn.document.draft.summary).toBe("Private edits");
    expect(JSON.parse(local.getItem(DEMO_STORAGE_KEY)!).published).toBeNull();
  });
  it("rejects stale tabs without changing the persisted draft", async () => {
    const local = storage();
    const first = createDemoRepository(local, true);
    const second = createDemoRepository(local, true);
    await first.mutate({
      action: "save",
      draft: fictionalCv(),
      expectedRevision: 0,
    });
    await expect(
      second.mutate({
        action: "save",
        draft: { ...fictionalCv(), fullName: "Stale tab" },
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await first.load()).document.draft.fullName).toBe("Alex Example");
  });
  it("allows incomplete private drafts and rejects incomplete publication", async () => {
    const repository = createDemoRepository(storage(), true);
    const draft = (await repository.load()).document.draft;
    await repository.mutate({ action: "save", draft, expectedRevision: 0 });
    await expect(
      repository.mutate({ action: "publish", draft, expectedRevision: 1 }),
    ).rejects.toThrow("institution and degree");
    expect((await repository.load()).document.revision).toBe(1);
  });
  it("fails closed when the development demo is disabled", () => {
    expect(() => createDemoRepository(storage(), false)).toThrow(
      "only available in development",
    );
  });
});

describe("member login destination", () => {
  it("accepts existing router string and Location state", () => {
    expect(memberLoginDestination({ from: "/member/profile" })).toBe(
      "/member/profile",
    );
    expect(
      memberLoginDestination({
        from: { pathname: "/member/opportunities", search: "?ignored=1" },
      }),
    ).toBe("/member/profile");
  });
  it.each([
    null,
    {},
    { from: "https://evil.invalid" },
    { from: "//evil.invalid" },
    { from: "/portal" },
    { from: { pathname: "javascript:alert(1)" } },
  ])("rejects unsafe and unrelated destinations %j", (state) => {
    expect(memberLoginDestination(state)).toBe("/member/profile");
  });
});
