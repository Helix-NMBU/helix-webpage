import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicPositions } from "./positions-api";

describe("fetchPublicPositions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads public positions from the Neon website endpoint and excludes explicitly hidden entries", async () => {
    const positions = [
      { id: "visible", title: "Visible", department: "Finance", visible: true },
      { id: "legacy-visible", title: "Visible", department: "Open" },
      { id: "hidden", title: "Hidden", department: "Finance", visible: false },
    ];
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ positions }) });
    vi.stubGlobal("fetch", fetch);

    await expect(fetchPublicPositions()).resolves.toEqual(positions.slice(0, 2));
    expect(fetch).toHaveBeenCalledWith("/api/website?action=positions", { cache: "no-store" });
  });

  it("rejects failed HTTP responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchPublicPositions()).rejects.toThrow("Could not load open positions.");
  });

  it("rejects malformed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ positions: null }) }));
    await expect(fetchPublicPositions()).rejects.toThrow("Could not load open positions.");
  });
});
