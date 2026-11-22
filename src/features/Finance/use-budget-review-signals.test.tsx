// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useBudgetReviewSignals } from "./use-budget-review-signals";
const mocks = vi.hoisted(() => ({ session: { access: "allowed", capabilities: { purchaseRegister: false }, viewVersion: 1, retry: vi.fn() }, queue: vi.fn(), projects: vi.fn(), detail: vi.fn(), notify: vi.fn(), end: undefined as (() => void) | undefined }));
vi.mock("../MemberPlatform/FinanceAccess", () => ({ useFinanceAccess: () => mocks.session }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => mocks.notify }));
vi.mock("./department-budget-repository", () => ({ createDepartmentBudgetRepository: () => ({ queue: mocks.queue, watchSession: (end: () => void) => { mocks.end = end; return () => undefined; } }) }));
vi.mock("./project-budget-repository", () => ({ createProjectBudgetRepository: () => ({ load: mocks.projects, detail: mocks.detail }) }));
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const queue = { viewVersion: 1, departments: [], packages: [{ snapshot: { departmentName: "Private pending department" } }] };
function Probe({ departmentId, includeDetails }: { departmentId?: string; includeDetails?: boolean } = {}) { const result = useBudgetReviewSignals({ departmentId, includeDetails }); return <p>{JSON.stringify(result.data)}</p>; }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); mocks.session.capabilities.purchaseRegister = false; mocks.queue.mockReset().mockResolvedValue(queue); mocks.projects.mockReset().mockResolvedValue({ viewVersion: 1, scopes: [], budgets: [] }); mocks.detail.mockReset(); mocks.notify.mockReset(); mocks.end = undefined; });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("avoids private queue reads for public budget readers and clears a previous Finance projection on downgrade", async () => {
  await act(async () => root.render(<Probe />)); expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.projects).not.toHaveBeenCalled();
  mocks.session.capabilities.purchaseRegister = true;
  await act(async () => root.render(<Probe />)); expect(container.textContent).toContain("Private pending department");
  mocks.session.capabilities.purchaseRegister = false;
  await act(async () => root.render(<Probe />)); expect(container.textContent).toBe("null");
});
it("clears session-ended queue data and drops a late refresh response", async () => {
  mocks.session.capabilities.purchaseRegister = true;
  await act(async () => root.render(<Probe />)); expect(container.textContent).toContain("Private pending department");
  let resolve!: (value: typeof queue) => void;
  mocks.queue.mockReturnValueOnce(new Promise<typeof queue>(done => { resolve = done; }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => mocks.end!()); expect(container.textContent).toBe("null");
  await act(async () => resolve(queue)); expect(container.textContent).toBe("null");
});

it("loads authorized candidates for the selected department and immediately hides them on a scope change", async () => {
  mocks.session.capabilities.purchaseRegister = true;
  mocks.projects.mockResolvedValue({ budgets: [
    { id: "requested", pendingVersionId: "v2", capabilities: { canRead: true } },
    { id: "approved-only", pendingVersionId: "v2", capabilities: { canRead: true, approvedOnly: true } },
    { id: "approved", pendingVersionId: null, capabilities: { canRead: true } },
  ] });
  mocks.detail.mockResolvedValue({ id: "requested", pendingVersion: { entries: [{ description: "Private candidate" }] } });
  await act(async () => root.render(<Probe departmentId="dep" includeDetails />));
  expect(mocks.queue).toHaveBeenCalledWith("dep"); expect(mocks.projects).toHaveBeenCalledWith({ departmentId: "dep" });
  expect(mocks.detail.mock.calls).toEqual([["requested"]]); expect(container.textContent).toContain("Private candidate");
  let resolve!: (value: typeof queue) => void;
  mocks.queue.mockReturnValueOnce(new Promise<typeof queue>(done => { resolve = done; }));
  await act(async () => root.render(<Probe departmentId="another" includeDetails />)); expect(container.textContent).toBe("null");
  await act(async () => mocks.end!());
  await act(async () => resolve(queue)); expect(mocks.detail).toHaveBeenCalledTimes(1); expect(container.textContent).toBe("null");
});
it("clears private package and project data if detail authorization ends", async () => {
  mocks.session.capabilities.purchaseRegister = true;
  mocks.projects.mockResolvedValue({ budgets: [{ id: "requested", pendingVersionId: "v2", capabilities: { canRead: true } }] });
  mocks.detail.mockRejectedValue(Object.assign(new Error("Access ended"), { status: 403 }));
  await act(async () => root.render(<Probe departmentId="dep" includeDetails />));
  expect(container.textContent).toBe("null"); expect(mocks.notify).toHaveBeenCalled();
});
