// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isLocalMemberMode, localMemberAccount } from "../MemberPlatform/local-mode";
import { isProjectMemberPreview } from "../MemberPlatform/local-member-profile-selection";
import { localFinanceProfileSelection } from "../MemberPlatform/local-finance-profile";
import { localMemberHasFinancials, localMemberHasPartnerSpace } from "../MemberPlatform/member-access-api";
import { createLocalWorkspaceRepository } from "../Workspace/local-repository";
import { createLocalProjectBudgetRepository } from "../Finance/project-budget-local";
import { createLocalProjectRepository } from "./local-repository";

const key = "helix-member-local-projects-v1";
beforeEach(() => { vi.stubEnv("DEV", true); vi.stubEnv("MODE", "member-local"); localStorage.clear(); window.history.replaceState({}, "", "/"); });
afterEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/"); vi.unstubAllEnvs(); });
function member() { window.history.replaceState({}, "", "/?memberRole=project_member&financeRole=head_of_finance&budgetRole=head_of_finance"); }
it("shows a regular assigned member without changing the saved lead/admin assignments or granting Finance", async () => {
  const repo = createLocalProjectRepository(), before = await repo.load();
  member();
  const preview = await repo.load(), directory = await createLocalWorkspaceRepository().load();
  expect(preview.canManage).toBe(false);
  expect(preview.taskLeadCategories).toEqual([]);
  expect(preview.projects.every(project => !project.leadIds?.includes(preview.viewerId))).toBe(true);
  expect(preview.departments.every(department => !department.leadIds?.includes(preview.viewerId))).toBe(true);
  expect(preview.tasks.some(task => task.assigneeIds.includes(preview.viewerId))).toBe(true);
  expect(directory.canAdmin).toBe(false);
  expect(directory.canManageProjects).toBe(false);
  expect(directory.members.find(item => item.id === preview.viewerId)?.role).toBe("Member");
  expect(localMemberAccount.role).toBe("Member");
  expect(localMemberHasFinancials()).toBe(false);
  expect(localMemberHasPartnerSpace("pipeline")).toBe(false);
  expect(localFinanceProfileSelection()).toBeNull();
  expect((await createLocalProjectBudgetRepository().load()).budgets).toEqual([]);
  const stored = JSON.parse(localStorage.getItem(key)!);
  expect(stored.projects).toEqual(before.projects);
  expect(stored.departments).toEqual(before.departments);
  expect(stored.canManage).toBe(true);
});
it("allows assigned task status changes while denying project edits and preserving the reversible persona", async () => {
  const repo = createLocalProjectRepository(), before = await repo.load();
  member();
  const project = before.projects[0];
  await expect(repo.mutate({ action: "save_project", id: project.id, expectedRevision: project.revision, project })).rejects.toMatchObject({ status: 403 });
  const task = before.tasks.find(task => task.kind === "task" && task.assigneeIds.includes(before.viewerId) && task.status === "blocked")!;
  await repo.mutate({ action: "set_status", id: task.id, expectedRevision: task.revision, status: "in_progress", blockedReason: "" });
  const unassigned = before.tasks.find(task => task.kind === "task" && !task.assigneeIds.includes(before.viewerId))!;
  await expect(repo.mutate({ action: "set_status", id: unassigned.id, expectedRevision: unassigned.revision, status: "done", blockedReason: "" })).rejects.toMatchObject({ status: 403 });
  window.history.replaceState({}, "", "/?memberRole=default");
  const restored = await repo.load();
  expect(restored.canManage).toBe(true);
  expect(restored.projects).toEqual(before.projects);
  expect(restored.departments).toEqual(before.departments);
  expect(restored.tasks.find(item => item.id === task.id)?.status).toBe("in_progress");
  expect(localMemberAccount.role).toBe("Admin");
});
it("cannot select the preview outside the dedicated development and loopback gate", () => {
  member();
  expect(isProjectMemberPreview(isLocalMemberMode())).toBe(true);
  vi.stubEnv("DEV", false);
  expect(isProjectMemberPreview(isLocalMemberMode())).toBe(false);
  vi.stubEnv("DEV", true); vi.stubEnv("MODE", "production");
  expect(isProjectMemberPreview(isLocalMemberMode())).toBe(false);
  expect(isProjectMemberPreview(isLocalMemberMode("https://internal.helixnmbu.no"))).toBe(false);
});
