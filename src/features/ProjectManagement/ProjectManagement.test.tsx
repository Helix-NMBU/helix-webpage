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
    await act(async () => root.render(<RouterProvider router={router} />));
  }
  const button = (title: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === title)!;
  async function click(title: string) { await act(async () => button(title).click()); }
  async function fill(id: string, value: string) {
    const element = document.getElementById(id) as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  it("shows only the signed-in member's assignments in My tasks", async () => {
    await open("overview", true);
    expect(container.querySelector("h1")?.textContent).toBe("My tasks");
    expect(container.textContent).toContain("Confirm material delivery");
    expect(container.textContent).not.toContain("Assemble suspension mounts");
    expect(container.textContent).not.toContain("Department progress");
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
    await open("marketing"); await click("New task"); await fill("task-title", "Publish sponsor interview");
    await click("Save task");
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
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: false });
    await open("production");
    expect(button("New task")).toBeUndefined();
    await click("Confirm material delivery");
    expect((document.getElementById("task-title") as HTMLInputElement).disabled || document.getElementById("task-title")!.closest("fieldset")?.disabled).toBe(true);
    expect(document.getElementById("task-status")?.getAttribute("disabled")).toBeNull();
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status", status: "blocked" }));
  });
});
