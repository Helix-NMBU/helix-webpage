// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { createDepartmentBudgetRepository } from "./department-budget-repository";
const auth = vi.hoisted(() => ({
  token: vi.fn(async () => "member-token"),
  watch: vi.fn(() => () => undefined),
}));
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: auth.token,
  watchMemberSession: auth.watch,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => false,
  localMemberSignedIn: () => true,
}));
beforeEach(() => {
  auth.token.mockClear();
});
it("uses existing scoped entrypoints and a package revision rather than a project header revision", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ viewVersion: 2, departments: [], packages: [] }),
  );
  vi.stubGlobal("fetch", fetcher);
  const repository = createDepartmentBudgetRepository();
  await repository.queue("dep");
  expect(fetcher.mock.calls[0]).toEqual([
    "/api/finance?action=departmentBudgetPackages&departmentId=dep",
    expect.objectContaining({
      cache: "no-store",
      headers: { Authorization: "Bearer member-token" },
    }),
  ]);
  fetcher.mockResolvedValueOnce(
    Response.json({
      ok: true,
      id: "package",
      viewVersion: 3,
      revision: 7,
      warnings: [],
      errors: [],
    }),
  );
  const change = {
    action: "approveDepartmentBudgetPackage" as const,
    packageId: "package",
    expectedRevision: 6,
    requestId: crypto.randomUUID(),
  };
  await repository.mutate(change);
  expect(fetcher.mock.calls[1]).toEqual([
    "/api/finance",
    expect.objectContaining({ method: "POST", body: JSON.stringify(change) }),
  ]);
  repository.watchSession?.(() => undefined);
  expect(auth.watch).toHaveBeenCalled();
});
it("reports malformed successful reads as recoverable errors instead of silently inventing empty packages", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ viewVersion: 1, scopes: [], budgets: [] }),
    ),
  );
  await expect(
    createDepartmentBudgetRepository().queue(),
  ).rejects.toMatchObject({ status: 503 });
});
it.each([401, 403, 409])(
  "preserves authoritative response errors (%s)",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "Current authority or snapshot changed" },
          { status },
        ),
      ),
    );
    await expect(
      createDepartmentBudgetRepository().detail("package"),
    ).rejects.toMatchObject({
      status,
      message: "Current authority or snapshot changed",
    });
  },
);
