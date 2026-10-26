// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import ProjectManagement from "./ProjectManagement";
import { initialLocalWorkspace } from "./local-repository";
import { createProjectRepository, ProjectRequestError } from "./repository";
import { CvRequestError } from "../MemberCV/repository";

function NotificationProbe() {
  const notifications = useMemberNotifications();
  return <output data-testid="notifications">{notifications?.items.map(item => `${item.title} ${item.description} ${item.action?.label ?? ""}`).join(" ")}</output>;
}

describe("project management interface", () => {
  let root: Root, container: HTMLDivElement;
  const load = vi.fn(), mutate = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    load.mockReset().mockResolvedValue(initialLocalWorkspace());
    mutate.mockReset().mockResolvedValue(initialLocalWorkspace());
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  async function open(section = "overview", personal = false) {
    const router = createMemoryRouter([{ path: "/project-management/:section", element: <MemberThemeProvider><MemberNotificationsProvider><ProjectManagement personal={personal} repository={{ load, mutate }} /><NotificationProbe /></MemberNotificationsProvider></MemberThemeProvider> }], { initialEntries: [`/project-management/${section}`] });
    await act(async () => root.render(<RouterProvider key={`${section}-${personal}`} router={router} />));
  }
  const button = (title: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === title)!;
  async function click(title: string) { await act(async () => button(title).click()); }
  async function fill(id: string, value: string) {
    const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  it("shows only the signed-in member's assignments in My tasks", async () => {
    await open("overview", true);
    expect(container.querySelector("h1")?.textContent).toBe("My tasks");
    expect(container.textContent).toContain("Confirm material delivery");
    expect(container.textContent).not.toContain("Assemble suspension mounts");
    expect(container.textContent).not.toContain("Department progress");
    expect(button("New task")).toBeUndefined();
    expect(button("New project")).toBeUndefined();
    expect(container.querySelector('tbody[aria-label="Completed"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Task completion");
  });
  it("filters Production and its timeline to production work", async () => {
    await open("production");
    expect(container.textContent).toContain("Confirm material delivery");
    expect(container.textContent).not.toContain("Publish workshop update");
    await act(async () => { button("Timeline").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
    expect(container.textContent).toContain("Scheduled dates come from task deadlines");
    expect(container.textContent).toContain("Chassis ready for assembly");
  });
  it("creates a task through the repository and closes the editor on success", async () => {
    await open("marketing"); await click("New task"); await fill("new-task-title", "Publish sponsor interview");
    await click("Save");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_task", expectedRevision: 0, task: expect.objectContaining({ title: "Publish sponsor interview", category: "marketing" }) }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("retains unsaved input after a revision conflict", async () => {
    mutate.mockRejectedValue(new ProjectRequestError("This task changed. Reload before saving.", 409));
    await open("production"); await click("Confirm material delivery"); await fill("task-title", "My unsaved edit"); await click("Save task");
    expect((document.getElementById("task-title") as HTMLInputElement).value).toBe("My unsaved edit");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Could not save changes");
    expect(document.body.textContent).toContain("Reload tasks");
  });
  it("settles loading when a save supersedes a pending refresh", async () => {
    await open("production");
    let finish!: (data: ReturnType<typeof initialLocalWorkspace>) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click("Refresh"); await click("Confirm material delivery"); await click("Save task");
    await act(async () => finish(initialLocalWorkspace()));
    expect(button("Refresh").disabled).toBe(false);
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("false");
  });
  it.each(["refresh", "save"])("clears stale workspace and offers sign-in when token acquisition rejects during %s", async action => {
    const token = vi.fn().mockResolvedValueOnce("member-token").mockRejectedValue(new CvRequestError("Your session has ended.", 401));
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(initialLocalWorkspace())));
    const repository = createProjectRepository(token, request);
    load.mockImplementation(repository.load); mutate.mockImplementation(repository.mutate);
    await open("production");
    if (action === "save") { await click("Confirm material delivery"); await click("Save task"); }
    else await click("Refresh");
    expect(container.querySelector("h1")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="notifications"]')?.textContent).toContain("Sign in");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("uses shared notifications and recovery when access cannot load", async () => {
    load.mockRejectedValue(new ProjectRequestError("Project access is required.", 403));
    await open();
    expect(container.querySelector("h1")).toBeNull();
    expect(document.body.textContent).toContain("Project access unavailable");
    expect(button("Try again")).toBeDefined();
  });
  it("limits an assignee's editor to status updates", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: false, taskLeadCategories: [] });
    await open("production");
    expect(button("New task")).toBeUndefined();
    await click("Confirm material delivery");
    expect((document.getElementById("task-title") as HTMLInputElement).disabled || document.getElementById("task-title")!.closest("fieldset")?.disabled).toBe(true);
    expect(document.getElementById("task-status")?.getAttribute("disabled")).toBeNull();
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status", status: "blocked" }));
  });
  it("keeps creation out of Overview and restricts each subfolder to its Department Lead grant", async () => {
    await open();
    expect(button("New task")).toBeUndefined();
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: true, taskLeadCategories: ["marketing"] });
    await open("production");
    expect(button("New task")).toBeUndefined();
    await open("marketing");
    await click("New task");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Marketing");
    expect(document.getElementById("task-category")).toBeNull();
  });
  it("completes a personal task through status-only mutation and moves it to Completed", async () => {
    const workspace = initialLocalWorkspace();
    const task = workspace.tasks.find(item => item.title === "Confirm material delivery")!;
    mutate.mockResolvedValue({ ...workspace, tasks: workspace.tasks.map(item => item.id === task.id ? { ...item, status: "done", revision: 2 } : item) });
    await open("overview", true);
    await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="Complete ${task.title}"]`)!.click());
    expect(mutate).toHaveBeenCalledWith({ action: "set_status", id: task.id, expectedRevision: 1, status: "done", blockedReason: task.blockedReason });
    expect(container.querySelector('tbody[aria-label="Completed"]')?.textContent).toContain(task.title);
    expect(container.querySelector('tbody[aria-label="Overdue"]')).toBeNull();
  });
  it("reopens a completed personal task", async () => {
    const task = initialLocalWorkspace().tasks[0];
    await open("overview", true);
    await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="Reopen ${task.title}"]`)!.click());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status", status: "todo", id: task.id }));
  });
  it("keeps assignment in the project subfolder even when a Department Lead opens My tasks", async () => {
    await open("overview", true);
    await click("Confirm material delivery");
    expect(document.getElementById("task-assignee")?.hasAttribute("disabled")).toBe(true);
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status" }));
  });
  it("lets a scoped Lead without project-management permission update another member's status in Overview", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: false, taskLeadCategories: ["production"] });
    await open("overview");
    await click("Assemble suspension mounts");
    expect(document.getElementById("task-assignee")?.hasAttribute("disabled")).toBe(true);
    expect(document.getElementById("task-status")?.hasAttribute("disabled")).toBe(false);
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status", status: "in_progress" }));
  });
  it("can hide completed work through the personal view settings", async () => {
    await open("overview", true);
    await click("View settings");
    await act(async () => document.getElementById("view-completed")!.click());
    expect(container.querySelector('tbody[aria-label="Completed"]')).toBeNull();
    expect(container.querySelector('tbody[aria-label="Upcoming"]')).not.toBeNull();
  });
  it("keeps compact composer input on failure and can create several tasks in the same folder", async () => {
    await open("marketing"); await click("New task");
    await act(async () => document.getElementById("create-another-task")!.click());
    await fill("new-task-title", "First update"); await click("Save");
    expect((document.getElementById("new-task-title") as HTMLTextAreaElement).value).toBe("");
    const first = mutate.mock.calls[0][0];
    await fill("new-task-title", "Second update");
    mutate.mockRejectedValueOnce(new ProjectRequestError("Try again later.", 503));
    await click("Save");
    expect((document.getElementById("new-task-title") as HTMLTextAreaElement).value).toBe("Second update");
    const failedId = mutate.mock.calls[1][0].id;
    await click("Save");
    expect(mutate.mock.calls[2][0]).toMatchObject({ id: failedId, task: { category: "marketing", title: "Second update" } });
    expect(first.id).not.toBe(failedId);
  });
});
