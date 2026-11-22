// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPurchaseLauncher } from "./ProjectPurchaseLauncher";
import { projectBudgetDevelopmentFixture } from "./project-budget-fixtures";
import type { ProjectBudgetWorkspace } from "./project-budget-types";
const notify = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({ load: vi.fn(), watchSession: vi.fn() }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({
  useNotify: () => notify,
}));
vi.mock("./project-budget-repository", () => ({
  createProjectBudgetRepository: () => repository,
}));
vi.mock("../MemberPlatform/local-mode", () => ({
  isLocalMemberMode: () => true,
  localMemberSignedIn: () => true,
}));
vi.mock("./ProjectBudgetPurchases", () => ({
  ProjectBudgetPurchases: ({ projectId }: { projectId: string }) => (
    <button>Purchase for {projectId}</button>
  ),
}));
let root: Root,
  container: HTMLDivElement,
  mounted: boolean,
  endSession: (() => void) | undefined;
const workspace = (): ProjectBudgetWorkspace =>
  projectBudgetDevelopmentFixture("finance")!;
const changed = vi.fn(async () => undefined);
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value: T) => resolve(value),
  };
}
async function render() {
  await act(async () =>
    root.render(<ProjectPurchaseLauncher onChanged={changed} />),
  );
}
function recovery(): () => void {
  return notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notify.mockReset();
  repository.load.mockReset();
  repository.watchSession.mockReset();
  changed.mockClear();
  endSession = undefined;
  repository.watchSession.mockImplementation((callback: () => void) => {
    endSession = callback;
    return () => undefined;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("project purchase launcher loading", () => {
  it.each([
    {
      name: "a different Finance response",
      response: { viewVersion: 0, ownRequests: [] },
    },
    {
      name: "a malformed project scope",
      response: {
        viewVersion: 0,
        budgets: [],
        scopes: [
          {
            projectId: "project",
            projectName: "Frame",
            responsibleDepartmentId: "department",
            capabilities: null,
          },
        ],
      },
    },
  ])(
    "reports $name through a recoverable shared notification",
    async ({ response }) => {
      repository.load
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(workspace());
      await render();
      expect(notify).toHaveBeenCalledOnce();
      expect(notify).toHaveBeenCalledWith(
        "Could not load projects",
        "The project list could not be read. Try loading projects again.",
        expect.objectContaining({
          variant: "error",
          href: null,
          action: expect.objectContaining({ label: "Try again" }),
        }),
      );
      expect(container.textContent).not.toContain("Could not load projects");
      expect(container.querySelector("button")).toBeNull();
      await act(async () => recovery()());
      expect(repository.load).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain("Register a project purchase");
      expect(container.textContent).toContain(
        `Purchase for ${workspace().scopes[0].projectId}`,
      );
      expect(notify).toHaveBeenCalledOnce();
    },
  );
  it("accepts a valid empty workspace without treating it as a failure", async () => {
    repository.load.mockResolvedValue({
      viewVersion: 0,
      budgets: [],
      scopes: [],
    });
    await render();
    expect(container.textContent).toBe("");
    expect(notify).not.toHaveBeenCalled();
  });
  it("disarms saved recovery actions when the session ends or the launcher unmounts", async () => {
    repository.load.mockRejectedValue(new Error("Try loading projects again."));
    await render();
    const retry = recovery();
    await act(async () => endSession?.());
    await act(async () => retry());
    expect(repository.load).toHaveBeenCalledOnce();
    await act(async () => {
      root.unmount();
      mounted = false;
    });
    await act(async () => retry());
    expect(repository.load).toHaveBeenCalledOnce();
  });
  it("ignores a late project response after session invalidation", async () => {
    const pending = deferred<ProjectBudgetWorkspace>();
    repository.load.mockReturnValue(pending.promise);
    await render();
    await act(async () => endSession?.());
    await act(async () => pending.resolve(workspace()));
    expect(container.textContent).toBe("");
    expect(notify).not.toHaveBeenCalled();
  });
  it("ignores a stale session callback after Strict Mode effect replacement", async () => {
    repository.load.mockResolvedValue(workspace());
    await act(async () =>
      root.render(
        <StrictMode>
          <ProjectPurchaseLauncher onChanged={changed} />
        </StrictMode>,
      ),
    );
    expect(repository.watchSession).toHaveBeenCalledTimes(2);
    const stale = repository.watchSession.mock.calls[0][0] as () => void;
    await act(async () => stale());
    expect(container.textContent).toContain("Register a project purchase");
    expect(notify).not.toHaveBeenCalled();
  });
  it("makes a saved recovery action obsolete after its successful retry", async () => {
    repository.load
      .mockRejectedValueOnce(new Error("Connection interrupted."))
      .mockResolvedValueOnce(workspace());
    await render();
    const retry = recovery();
    await act(async () => retry());
    expect(repository.load).toHaveBeenCalledTimes(2);
    await act(async () => retry());
    expect(repository.load).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Register a project purchase");
  });
});
