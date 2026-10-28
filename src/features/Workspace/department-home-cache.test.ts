import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheDepartmentHomeRepository, clearDepartmentHomeCache, type DepartmentHomeRepository } from "./department-home-repository";
import { WorkspaceRequestError } from "./repository";
import type { DepartmentHome } from "./department-home";

const home: DepartmentHome = { departmentId: "engineering", revision: 1, description: "Hello", driveFolderUrl: null, canEdit: false };
const repository = (load: DepartmentHomeRepository["load"]): DepartmentHomeRepository => ({ load, save: vi.fn(async () => home) });
afterEach(() => { clearDepartmentHomeCache(); vi.useRealTimers(); });

describe("department home cache", () => {
  it("deduplicates requests, reuses recent data for the same member, and expires", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => home);
    const repo = cacheDepartmentHomeRepository("member-1", repository(load));
    await Promise.all([repo.load("engineering"), repo.load("engineering")]);
    await repo.load("engineering");
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_001);
    await repo.load("engineering");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("isolates members and invalidates after writes", async () => {
    const load = vi.fn(async () => home);
    const first = cacheDepartmentHomeRepository("member-1", repository(load));
    const second = cacheDepartmentHomeRepository("member-2", repository(load));
    await first.load("engineering");
    await second.load("engineering");
    expect(load).toHaveBeenCalledTimes(2);
    await first.save({ action: "save_department_home", departmentId: "engineering", expectedRevision: 1, description: "Changed", driveFolderUrl: null });
    await first.load("engineering");
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("does not allow an invalidated request to repopulate the cache", async () => {
    let resolve!: (data: DepartmentHome) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<DepartmentHome>(done => { resolve = done; })).mockResolvedValue(home);
    const repo = cacheDepartmentHomeRepository("member-1", repository(load));
    const old = repo.load("engineering");
    clearDepartmentHomeCache();
    resolve(home);
    await old;
    await repo.load("engineering");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("clears other cached data when authorization fails", async () => {
    const load = vi.fn(async (id: string) => { if (id === "denied") throw new WorkspaceRequestError("Denied", 403); return home; });
    const repo = cacheDepartmentHomeRepository("member-1", repository(load));
    await repo.load("engineering");
    await expect(repo.load("denied")).rejects.toThrow("Denied");
    await repo.load("engineering");
    expect(load).toHaveBeenCalledTimes(3);
  });
});
