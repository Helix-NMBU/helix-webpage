// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceContentSkeleton, TaskListSkeleton, WorkspaceShellSkeleton } from "./LoadingSkeletons";

describe("page loading layouts", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  it.each([
    ["/tasks", "My tasks"], ["/tasks/123", "Properties"], ["/season-overview", "Progress"],
    ["/departments/mechanical-production", "Department resources"], ["/departments/mechanical-production?tab=documents", "Documents"], ["/projects/123", "Loading project"], ["/projects/123?tab=activity", "Activity"], ["/projects/123?tab=tasks", "Tasks"],
    ["/finance/budgets", "Budgets"], ["/recruiting", "Applications"], ["/settings", "App connections"],
    ["/notifications", "Notifications"], ["/profile", "Profile"],
  ])("shows the relevant layout while opening %s", async (path, expected) => {
    await act(async () => root.render(<MemoryRouter initialEntries={[path]}><WorkspaceShellSkeleton /></MemoryRouter>));
    expect(`${container.textContent} ${[...container.querySelectorAll("[aria-label]")].map(node => node.getAttribute("aria-label")).join(" ")}`).toContain(expected);
  });
  it("shows the board layout for a board task view", async () => {
    await act(async () => root.render(<TaskListSkeleton board />));
    expect(container.querySelectorAll(".sm\\:grid-cols-3 > div")).toHaveLength(3);
  });
  it("only shows the purchase registration form skeleton when the member can register", async () => {
    await act(async () => root.render(<FinanceContentSkeleton page="purchases" />));
    expect(container.querySelector(".md\\:grid-cols-2")).toBeNull();
    await act(async () => root.render(<FinanceContentSkeleton page="purchases" canRegister />));
    expect(container.querySelector(".md\\:grid-cols-2")).not.toBeNull();
  });
});
