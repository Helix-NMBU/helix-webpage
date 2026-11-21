// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APPROVED_MEMBER_BUDGET_CAPABILITIES } from "../Finance/project-budget-member-view";
import type { ProjectBudgetRepository, ProjectBudgetWorkspaceView } from "../Finance/project-budget-repository";
import { MEMBER_ACCESS_CHANGED } from "../MemberPlatform/member-access-api";
import { ProjectBudgetWidget } from "./ProjectBudgetWidget";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
const capabilities = APPROVED_MEMBER_BUDGET_CAPABILITIES;
function workspace(projectId = "project", planned = "10500.75", actual = "8500.00"): ProjectBudgetWorkspaceView {
  return { viewVersion: 1, scopes: [{ memberId: "member", projectId, projectName: "Chassis", seasonId: "season", seasonCode: "S27", projectLeadIds: [], departments: [], responsibleDepartmentId: "department", capabilities }], budgets: [{ id: "budget", projectId, projectName: "Chassis", seasonId: "season", seasonCode: "S27", responsibleDepartmentId: "department", responsibleDepartmentName: "Mechanical & Production", revision: 1, approvedVersionId: "approved", approvedTotalNok: planned, actualNok: actual, unbudgetedNok: "0.00", pendingVersionId: "private-draft", pendingStage: "draft", pendingTotalNok: "999999.00", capabilities }] };
}
function repository(load = vi.fn().mockResolvedValue(workspace())): ProjectBudgetRepository {
  return { load, detail: vi.fn(), mutate: vi.fn() };
}
let container: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notify.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function render(repo: ProjectBudgetRepository, projectId = "project", viewerId = "member") {
  await act(async () => root.render(<MemoryRouter><input aria-label="Unfinished project note" defaultValue="Keep my input" /><ProjectBudgetWidget projectId={projectId} viewerId={viewerId} repository={repo} /></MemoryRouter>));
}
it("shows approved spending with the existing circle, without loading private details or offering a refresh", async () => {
  const repo = repository(); await render(repo);
  expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("80% used");
  expect(container.textContent).toContain("NOK 10,500.75"); expect(container.textContent).toContain("NOK 8,500.00");
  expect(container.textContent).not.toContain("999,999"); expect(container.textContent).not.toContain("Refresh");
  expect(repo.detail).not.toHaveBeenCalled(); expect(container.querySelector('a')).toBeNull();
  expect(repo.load).toHaveBeenCalledWith({ projectId: "project" }, expect.any(AbortSignal));
});
it.each([true, false])("offers budget drafting only when the scoped caller can draft: %s", async canDraft => {
  const data = workspace(); data.budgets = []; data.scopes[0].capabilities = { ...capabilities, approvedOnly: !canDraft, canDraft };
  await render(repository(vi.fn().mockResolvedValue(data)));
  expect(container.querySelector('[role="img"]')).toBeNull();
  const draft = container.querySelector('a[href="/projects/project?tab=budget"]');
  expect(!!draft).toBe(canDraft);
  expect(container.textContent).toContain(canDraft ? "Draft a budget" : "after Finance approves it");
});
it.each([["0.00", "0.00", "percentage unavailable"], ["0.00", "1.00", "over budget"], ["100.00", "125.00", "over budget"]])("handles an approved %s budget and %s spending without a draft prompt", async (planned, actual, label) => {
  await render(repository(vi.fn().mockResolvedValue(workspace("project", planned, actual))));
  expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain(label);
  expect(container.textContent).not.toContain("Draft a budget");
});
it("updates automatically on mutations, focus and cross-tab changes without disturbing surrounding input", async () => {
  const repo = repository(vi.fn().mockResolvedValueOnce(workspace()).mockResolvedValue(workspace("project", "12000.00", "9000.00")));
  await render(repo);
  for (const event of ["helix-workspace-updated", "focus", "storage"]) await act(async () => window.dispatchEvent(new Event(event)));
  expect(container.textContent).toContain("NOK 12,000.00"); expect(container.textContent).toContain("NOK 9,000.00");
  expect((container.querySelector('input') as HTMLInputElement).value).toBe("Keep my input");
  expect(repo.load).toHaveBeenCalledTimes(4);
});
it("supersedes an in-flight read when an approval arrives and ignores the old response", async () => {
  let finish!: (value: ProjectBudgetWorkspaceView) => void;
  const repo = repository(vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(workspace("project", "15000.00")));
  await render(repo);
  const signal = vi.mocked(repo.load).mock.calls[0][1]!;
  await act(async () => window.dispatchEvent(new Event("helix-workspace-updated")));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(workspace()));
  expect(container.textContent).toContain("NOK 15,000.00"); expect(container.textContent).not.toContain("NOK 10,500.75");
});
it("clears old amounts immediately on access/session loss and rejects late account responses", async () => {
  let end!: () => void, finish!: (value: ProjectBudgetWorkspaceView) => void;
  const repo = repository(vi.fn().mockResolvedValueOnce(workspace()).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(workspace("other", "200.00", "0.00")));
  repo.watchSession = callback => { end = callback; return () => undefined; };
  await render(repo);
  await act(async () => window.dispatchEvent(new Event(MEMBER_ACCESS_CHANGED)));
  expect(container.textContent).not.toContain("10,500.75");
  await render(repo, "other", "different-member");
  await act(async () => finish(workspace()));
  expect(container.textContent).toContain("NOK 200.00"); expect(container.textContent).not.toContain("10,500.75");
  await act(async () => end()); expect(container.textContent).not.toContain("NOK 200.00");
});
it("polls only visible pages and clears unavailable amounts with notification recovery", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const repo = repository(vi.fn().mockResolvedValueOnce(workspace()).mockRejectedValueOnce(Object.assign(new Error("Revoked"), { status: 403 })).mockResolvedValue(workspace("project", "200.00", "0.00")));
  await render(repo);
  await act(async () => { visibility.mockReturnValue("hidden"); await vi.advanceTimersByTimeAsync(30_000); }); expect(repo.load).toHaveBeenCalledTimes(1);
  await act(async () => { visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); });
  expect(container.textContent).not.toContain("10,500.75"); expect(container.textContent).toContain("Budget unavailable");
  await act(async () => notify.mock.calls[notify.mock.calls.length - 1][2].action.onClick()); expect(container.textContent).toContain("NOK 200.00");
});
