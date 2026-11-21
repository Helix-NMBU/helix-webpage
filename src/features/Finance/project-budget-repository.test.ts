// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectBudgetRepository } from "./project-budget-repository";
const auth = vi.hoisted(() => ({
  token: vi.fn(async (_owner: { current: string | null }) => "member-token"),
  watch: vi.fn(() => () => undefined),
  local: false,
  signedIn: true,
}));
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: auth.token,
  watchMemberSession: auth.watch,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => auth.local,
  localMemberSignedIn: () => auth.signedIn,
}));
beforeEach(() => {
  localStorage.clear();
  auth.local = false;
  auth.signedIn = true;
  auth.token.mockClear();
});
describe("project budget API repository", () => {
  it("sends scoped requests with session binding and the authoritative header revision", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _options?: RequestInit) =>
        Response.json({
          ok: true,
          id: "budget",
          revision: 8,
          viewVersion: 12,
          scopes: [],
          budgets: [],
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const repo = createProjectBudgetRepository();
    await repo.load({ projectId: "project", departmentId: "department" });
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/finance?action=projectBudgets&projectId=project&departmentId=department",
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      headers: { Authorization: "Bearer member-token" },
    });
    await repo.detail("budget");
    expect(fetcher.mock.calls[1][0]).toBe(
      "/api/finance?action=projectBudget&projectBudgetId=budget",
    );
    const change = {
      action: "approveDepartmentBudget" as const,
      projectBudgetId: "budget",
      expectedRevision: 7,
      requestId: crypto.randomUUID(),
    };
    await repo.mutate(change);
    expect(fetcher.mock.calls[2][0]).toBe("/api/finance");
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(change),
      headers: { "Content-Type": "application/json" },
    });
    const owner = auth.token.mock.calls[0][0];
    expect(auth.token.mock.calls.every((call) => call[0] === owner)).toBe(true);
    const end = vi.fn();
    repo.watchSession!(end);
    expect(auth.watch).toHaveBeenCalledWith(end, undefined, owner);
    vi.unstubAllGlobals();
  });
  it.each([401, 403, 409])(
    "retains the API status %s for access clearing and stale-write recovery",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            { error: "Budget changed or access ended" },
            { status },
          ),
        ),
      );
      await expect(
        createProjectBudgetRepository().load(),
      ).rejects.toMatchObject({
        status,
        message: "Budget changed or access ended",
      });
      vi.unstubAllGlobals();
    },
  );
  it("never selects fixture storage when the local member is signed out", async () => {
    auth.local = true;
    auth.signedIn = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Sign in" }, { status: 401 })),
    );
    await expect(createProjectBudgetRepository().load()).rejects.toMatchObject({
      status: 401,
    });
    expect(auth.token).toHaveBeenCalledOnce();
    expect(localStorage.getItem("helix-project-budgets-local-v1")).toBeNull();
    vi.unstubAllGlobals();
  });
});

it("notifies mounted views after a successful write, while reads and rejected writes do not notify", async () => {
  const changed = vi.fn();
  window.addEventListener("helix-workspace-updated", changed);
  try {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ scopes: [], budgets: [], viewVersion: 1 }))
      .mockResolvedValueOnce(Response.json({ ok: true, id: "budget", revision: 2, viewVersion: 2 }))
      .mockResolvedValueOnce(Response.json({ error: "Access revoked" }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    const repo = createProjectBudgetRepository(), controller = new AbortController();
    await repo.load({ projectId: "project" }, controller.signal);
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
    expect(changed).not.toHaveBeenCalled();
    const change = { action: "submitProjectBudget" as const, projectBudgetId: "budget", expectedRevision: 1, requestId: crypto.randomUUID() };
    await repo.mutate(change); expect(changed).toHaveBeenCalledOnce();
    await expect(repo.mutate(change)).rejects.toMatchObject({ status: 403 });
    expect(changed).toHaveBeenCalledOnce();
  } finally { window.removeEventListener("helix-workspace-updated", changed); }
});
