import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyCvRequestFailure, createPrivateAutosave, type CvAutosaveSnapshot } from "./autosave";
import { emptyCv, privateSharing } from "./model";
import { CvRequestError, validateMutation } from "./repository";
import type { CvEnvelope, CvMutation } from "./types";

function initial(): CvEnvelope {
  return {
    identity: { name: "Ada Eksempel", email: "ada@example.no" },
    document: {
      draft: emptyCv("Ada Eksempel"), sharing: { ...privateSharing }, revision: 4,
      publishedRevision: 2, publishedAt: "2026-10-06T12:00:00Z",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function saved(mutation: CvMutation, revision: number): CvEnvelope {
  const value = initial();
  return { ...value, document: { ...value.document, draft: mutation.draft!, sharing: mutation.sharing!, revision } };
}

function setup(mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>(async (mutation) => saved(mutation, 5))) {
  const onSaved = vi.fn();
  const onFailure = vi.fn();
  const onState = vi.fn();
  const controller = createPrivateAutosave({ initialEnvelope: initial(), mutate, onSaved, onFailure, onState });
  const edit = (summary: string, sharing = privateSharing) => controller.update({ ...emptyCv("Ada Eksempel"), summary }, sharing);
  return { controller, mutate, onSaved, onFailure, onState, edit };
}

describe("shared CV request failure classification", () => {
  it.each([
    [new CvRequestError("Invalid input", 400), "validation"],
    [new CvRequestError("Stale revision", 409), "conflict"],
    [new CvRequestError("Expired session", 401), "session"],
    [new CvRequestError("Rejected identity", 403), "session"],
    [new CvRequestError("Transport failed", 500), "uncertain"],
    [new Error("Failed to fetch"), "uncertain"],
    [{ status: 400, message: "Unverified native failure" }, "uncertain"],
    [null, "uncertain"],
  ] as const)("classifies %s as %s", (failure, kind) => {
    expect(classifyCvRequestFailure(failure)).toBe(kind);
  });
});

describe("private debounced CV autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces edits and sharing, sends only a private save, and preserves publication metadata", async () => {
    const { controller, edit, mutate, onSaved } = setup();
    edit("First");
    await vi.advanceTimersByTimeAsync(500);
    edit("Latest", { cv: true, email: false, phone: true });
    await vi.advanceTimersByTimeAsync(799);
    expect(mutate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ action: "save", expectedRevision: 4, draft: { summary: "Latest" }, sharing: { cv: true, email: false, phone: true } });
    expect(onSaved.mock.calls[0][0].document).toMatchObject({ publishedRevision: 2, publishedAt: initial().document.publishedAt });
    expect(controller.getState()).toEqual({ saving: false, pending: false, paused: null });
  });

  it("captures submitted input and sends later live edits only after the first acknowledgment using its new revision", async () => {
    const first = deferred<CvEnvelope>();
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (mutation) => saved(mutation, 6));
    const { controller, onSaved } = setup(mutate);
    const live = emptyCv("Ada Eksempel");
    live.summary = "Submitted";
    controller.update(live, privateSharing);
    await vi.advanceTimersByTimeAsync(800);
    live.summary = "Later live input";
    controller.update(live, { ...privateSharing, email: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].draft?.summary).toBe("Submitted");
    first.resolve(saved(mutate.mock.calls[0][0], 5));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSaved.mock.calls[0][1].draft.summary).toBe("Submitted");
    expect(live.summary).toBe("Later live input");
    expect(controller.getState().pending).toBe(true);
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[1][0]).toMatchObject({ expectedRevision: 5, draft: { summary: "Later live input" }, sharing: { email: true } });
  });

  it("locks immediately, drains an active save and keeps new autosaves stopped throughout a manual action", async () => {
    const first = deferred<CvEnvelope>();
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>().mockReturnValueOnce(first.promise).mockImplementation(async (mutation) => saved(mutation, 7));
    const { controller, edit } = setup(mutate);
    edit("First");
    await vi.advanceTimersByTimeAsync(800);
    edit("Latest");
    const settled = vi.fn();
    const lock = controller.lock().then((value) => { settled(); return value; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(settled).not.toHaveBeenCalled();
    first.resolve(saved(mutate.mock.calls[0][0], 5));
    expect((await lock).document.revision).toBe(5);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mutate).toHaveBeenCalledTimes(1);
    const manual = saved({ action: "save", draft: { ...emptyCv("Ada Eksempel"), summary: "Latest" }, sharing: privateSharing }, 6);
    controller.acknowledge(manual);
    controller.unlock();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mutate).toHaveBeenCalledTimes(1);
    edit("After manual action");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[1][0].expectedRevision).toBe(6);
  });

  it("cancels the debounce while blocked and resumes dirty input after context is available", async () => {
    const { controller, edit, mutate } = setup();
    edit("Changed");
    controller.setBlocked(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mutate).not.toHaveBeenCalled();
    controller.setBlocked(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate).toHaveBeenCalledTimes(1);
    edit("Pending manual input");
    await controller.lock();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("reports local validation once and waits for a genuinely new edit", async () => {
    const { controller, edit, mutate, onFailure } = setup();
    edit("x".repeat(8001));
    await vi.advanceTimersByTimeAsync(800);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][1]).toBe("validation");
    expect(mutate).not.toHaveBeenCalled();
    edit("x".repeat(8001));
    await vi.advanceTimersByTimeAsync(10000);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(controller.getState().paused).toBe("validation");
    edit("Fixed");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("supports shared date validation and resumes a partial date only after an edit completes it", async () => {
    const mutate = vi.fn(async (mutation: CvMutation) => saved(mutation, 5));
    const onFailure = vi.fn();
    const validate = vi.fn((mutation: CvMutation) => {
      if (mutation.draft?.education.some((row) => row.startDate === "2026-")) throw new Error("Complete the date before saving.");
      return validateMutation(mutation);
    });
    const controller = createPrivateAutosave({ initialEnvelope: initial(), mutate, validate, onSaved: vi.fn(), onFailure });
    const draft = emptyCv("Ada Eksempel");
    draft.education = [{ id: "education", institution: "NMBU", degree: "", startDate: "2026-", endDate: "", description: "" }];
    controller.update(draft, privateSharing);
    await vi.advanceTimersByTimeAsync(5000);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(onFailure.mock.calls[0][1]).toBe("validation");
    draft.education[0].startDate = "2026-10";
    controller.update(draft, privateSharing);
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[0][0].draft?.education[0].startDate).toBe("2026-10");
  });

  it.each([
    [new Error("Failed to fetch"), "uncertain"],
    [new CvRequestError("Stale revision", 409), "conflict"],
    [new CvRequestError("Session expired", 401), "session"],
    [new CvRequestError("Transport failed", 500), "uncertain"],
  ] as const)("pauses after %s and preserves live input without automatic retries", async (failure, kind) => {
    const first = deferred<CvEnvelope>();
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>().mockReturnValue(first.promise);
    const { controller, edit, onSaved, onFailure } = setup(mutate);
    edit("Submitted");
    await vi.advanceTimersByTimeAsync(800);
    edit("Typed while request was active");
    first.reject(failure);
    await vi.advanceTimersByTimeAsync(10000);
    edit("More input after failure");
    await vi.advanceTimersByTimeAsync(10000);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(failure, kind);
    expect(controller.getState()).toEqual({ saving: false, pending: true, paused: kind });
    expect((await controller.lock()).document).toEqual(initial().document);
    controller.unlock();
    await vi.advanceTimersByTimeAsync(10000);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("clears a failure only after an explicit acknowledgment or reload", async () => {
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>()
      .mockRejectedValueOnce(new CvRequestError("Stale revision", 409))
      .mockImplementation(async (mutation) => saved(mutation, 10));
    const { controller, edit } = setup(mutate);
    edit("Unsaved");
    await vi.advanceTimersByTimeAsync(800);
    const reloaded = initial();
    reloaded.document.revision = 9;
    controller.reset(reloaded);
    expect(controller.getState()).toEqual({ saving: false, pending: false, paused: null });
    edit("After explicit reload");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[1][0].expectedRevision).toBe(9);
  });

  it("resumes after an explicit successful retry, without automatically retrying an uncertain result", async () => {
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>()
      .mockRejectedValueOnce(new Error("The save result could not be confirmed"))
      .mockImplementation(async (mutation) => saved(mutation, 9));
    const { controller, edit } = setup(mutate);
    edit("Unsaved");
    await vi.advanceTimersByTimeAsync(800);
    expect(controller.getState().paused).toBe("uncertain");
    await controller.lock();
    const raw = { draft: { ...emptyCv("Ada Eksempel"), summary: "Unsaved" }, sharing: privateSharing };
    controller.acknowledge(saved({ action: "save", ...raw }, 8), raw);
    controller.unlock();
    edit("Next edit");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[1][0].expectedRevision).toBe(8);
  });

  it("keeps failed manual saves paused across unlocking and later edits until explicitly acknowledged", async () => {
    const { controller, edit, mutate, onFailure } = setup();
    edit("Pending input");
    await controller.lock();
    const manualSave = vi.fn().mockRejectedValue(new Error("Response was lost"));
    await expect(manualSave()).rejects.toThrow("Response was lost");
    controller.pause("uncertain");
    controller.unlock();
    edit("Later input");
    await vi.advanceTimersByTimeAsync(10000);
    expect(mutate).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({ saving: false, pending: true, paused: "uncertain" });
    await controller.lock();
    const raw = { draft: { ...emptyCv("Ada Eksempel"), summary: "Later input" }, sharing: privateSharing };
    controller.acknowledge(saved({ action: "save", ...raw }, 8), raw);
    controller.unlock();
    edit("Next edit");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[0][0].expectedRevision).toBe(8);
  });

  it("keeps a manual validation failure paused until a changed edit", async () => {
    const { controller, edit, mutate, onFailure } = setup();
    edit("Invalid input");
    await controller.lock();
    controller.pause("validation");
    controller.unlock();
    edit("Invalid input");
    await vi.advanceTimersByTimeAsync(10000);
    expect(mutate).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(controller.getState().paused).toBe("validation");
    edit("Corrected input");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("accepts both submitted and normalized saved snapshots without trimming live input or creating a save loop", async () => {
    const { controller, edit, mutate } = setup();
    edit("  Whitespace  ");
    await vi.advanceTimersByTimeAsync(800);
    expect(mutate.mock.calls[0][0].draft?.summary).toBe("Whitespace");
    edit("  Whitespace  ");
    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.getState().pending).toBe(false);
    edit("Whitespace");
    await vi.advanceTimersByTimeAsync(5000);
    expect(mutate).toHaveBeenCalledTimes(1);
    const raw: CvAutosaveSnapshot = { draft: { ...emptyCv("Ada Eksempel"), summary: "  Manual whitespace  " }, sharing: privateSharing };
    controller.update(raw.draft, raw.sharing);
    await controller.lock();
    const manual = saved({ action: "save", draft: { ...raw.draft, summary: "Manual whitespace" }, sharing: raw.sharing }, 6);
    controller.acknowledge(manual, raw);
    controller.unlock();
    await vi.advanceTimersByTimeAsync(5000);
    expect(controller.getState().pending).toBe(false);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it.each(["resolve", "reject"] as const)("ignores a late %s after disposal for logout, expiry or a changed account", async (outcome) => {
    const first = deferred<CvEnvelope>();
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>().mockReturnValue(first.promise);
    const { controller, edit, onSaved, onFailure, onState } = setup(mutate);
    edit("In flight");
    await vi.advanceTimersByTimeAsync(800);
    const lock = controller.lock();
    controller.dispose();
    onState.mockClear();
    if (outcome === "resolve") first.resolve(saved(mutate.mock.calls[0][0], 5));
    else first.reject(new CvRequestError("Expired", 401));
    await lock;
    await vi.advanceTimersByTimeAsync(5000);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
    edit("Must not restart");
    controller.unlock();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("revokes a queued timer on disposal and ignores old generation results after a reload", async () => {
    const queued = setup();
    queued.edit("Pending");
    queued.controller.dispose();
    await vi.advanceTimersByTimeAsync(800);
    expect(queued.mutate).not.toHaveBeenCalled();
    const old = deferred<CvEnvelope>();
    const mutate = vi.fn<(mutation: CvMutation) => Promise<CvEnvelope>>().mockReturnValue(old.promise);
    const { controller, edit, onSaved, onState } = setup(mutate);
    edit("Old session input");
    await vi.advanceTimersByTimeAsync(800);
    const fresh = initial();
    fresh.document.revision = 20;
    controller.reset(fresh);
    onState.mockClear();
    old.resolve(saved(mutate.mock.calls[0][0], 5));
    await vi.advanceTimersByTimeAsync(5000);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
    expect((await controller.lock()).document.revision).toBe(20);
  });
});
