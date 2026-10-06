import { describe, expect, it, vi } from "vitest";
import {
  createAuthenticatedCvViewer,
  type CvPreviewState,
} from "./authenticatedCv";

const pdf = new Blob(["PDF"], { type: "application/pdf" });
function harness(
  download = vi.fn().mockResolvedValue({ data: pdf, error: null }),
) {
  const states: CvPreviewState[] = [];
  let id = 0;
  const urls = {
    createObjectURL: vi.fn(() => `blob:cv-${++id}`),
    revokeObjectURL: vi.fn(),
  };
  return {
    viewer: createAuthenticatedCvViewer(
      download,
      (state) => states.push(state),
      urls,
    ),
    download,
    states,
    urls,
  };
}

describe("authenticated CV viewer", () => {
  it("fetches the current storage object on every open and revokes a replaced preview", async () => {
    const { viewer, download, states, urls } = harness();
    expect(await viewer.open("member/version.pdf", "Member")).toBe(true);
    expect(states[states.length - 1]).toEqual({
      status: "ready",
      url: "blob:cv-1",
      name: "Member",
    });
    await viewer.open("member/version.pdf", "Member");
    expect(download.mock.calls).toEqual([
      ["member/version.pdf"],
      ["member/version.pdf"],
    ]);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:cv-1");
    expect(states[states.length - 1]).toMatchObject({
      status: "ready",
      url: "blob:cv-2",
    });
    viewer.dispose();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:cv-2");
  });
  it("denies expired or revoked access without producing a reusable URL", async () => {
    const { viewer, states, urls } = harness(
      vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "403 denied" } }),
    );
    expect(await viewer.open("member/version.pdf", "Member")).toBe(false);
    expect(states[states.length - 1]).toMatchObject({ status: "error" });
    expect(urls.createObjectURL).not.toHaveBeenCalled();
  });
  it("handles a thrown network failure with a visible error", async () => {
    const { viewer, states } = harness(
      vi.fn().mockRejectedValue(new Error("network")),
    );
    expect(await viewer.open("member/version.pdf", "Member")).toBe(false);
    expect(states[states.length - 1]).toMatchObject({ status: "error" });
  });
  it("does not expose a late response after the viewer closes or unmounts", async () => {
    let resolve!: (value: { data: Blob; error: null }) => void;
    const download = vi.fn(
      () =>
        new Promise<{ data: Blob; error: null }>((done) => {
          resolve = done;
        }),
    );
    const { viewer, states, urls } = harness(download);
    const pending = viewer.open("member/version.pdf", "Member");
    viewer.clear();
    resolve({ data: pdf, error: null });
    expect(await pending).toBe(false);
    expect(states[states.length - 1]).toEqual({ status: "idle" });
    expect(urls.createObjectURL).not.toHaveBeenCalled();
    viewer.dispose();
  });
  it("ignores an old download that finishes after a newer member's preview", async () => {
    let resolve!: (value: { data: Blob; error: null }) => void;
    const download = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue({ data: pdf, error: null });
    const { viewer, states, urls } = harness(download);
    const first = viewer.open("member-1/old.pdf", "First");
    expect(await viewer.open("member-2/new.pdf", "Second")).toBe(true);
    resolve({ data: pdf, error: null });
    expect(await first).toBe(false);
    expect(states[states.length - 1]).toEqual({
      status: "ready",
      url: "blob:cv-1",
      name: "Second",
    });
    expect(urls.createObjectURL).toHaveBeenCalledTimes(1);
    viewer.clear();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:cv-1");
  });
});
