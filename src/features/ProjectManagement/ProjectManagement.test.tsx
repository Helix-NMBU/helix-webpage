// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberNotificationsProvider, useMemberNotifications } from "../MemberPlatform/MemberNotifications";
import { MemberThemeProvider } from "../MemberPlatform/MemberTheme";
import ProjectManagement from "./ProjectManagement";
import TaskDetailPage from "./TaskDetail";
import { ORGANIZATION_DEPARTMENTS } from "./types";
import { initialLocalWorkspace } from "./local-repository";
import { createProjectRepository, ProjectRequestError } from "./repository";
import { addDays, formatDate, osloDate } from "./model";
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
  async function open(section = "overview", personal = false, query = "") {
    const router = createMemoryRouter([{ path: personal ? "/tasks" : "/project-management/:section", element: <MemberThemeProvider><MemberNotificationsProvider><ProjectManagement personal={personal} repository={{ load, mutate }} /><NotificationProbe /></MemberNotificationsProvider></MemberThemeProvider> }, { path: "/tasks/:taskId", element: <MemberThemeProvider><MemberNotificationsProvider><TaskDetailPage repository={{ load, mutate }} /><NotificationProbe /></MemberNotificationsProvider></MemberThemeProvider> }], { initialEntries: [personal ? `/tasks${query}` : `/project-management/${section}${query}`] });
    await act(async () => root.render(<RouterProvider key={`${section}-${personal}`} router={router} />));
    return router;
  }
  const button = (title: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === title)!;
  async function click(title: string) { await act(async () => button(title).click()); }
  async function editTask() { await click(button("Edit task") ? "Edit task" : "Update status"); }
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
    expect(container.querySelector('[aria-label="Chassis ready for assembly: 1 of 3 tasks complete, 33%"]')?.getAttribute("aria-valuenow")).toBe("33");
  });
  it("creates a task through the repository and closes the editor on success", async () => {
    await open("marketing"); await click("New task"); await fill("new-task-title", "Publish sponsor interview"); await fill("new-task-description", "Share the approved partner interview with the team.");
    await click("Create task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_task", expectedRevision: 0, task: expect.objectContaining({ title: "Publish sponsor interview", description: "Share the approved partner interview with the team.", category: "marketing" }) }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("creates a task with its visible description, status, priority and blocked reason",async()=>{
    await open("marketing");await click("New task");await fill("new-task-title","Prepare launch assets");await fill("new-task-description","Use the approved partner photographs.");
    await act(async()=>document.getElementById("new-task-status")!.click());
    await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option=>option.textContent==="Blocked")!.click());
    await fill("new-task-blocked","Waiting for partner approval.");
    await act(async()=>document.getElementById("new-task-priority")!.click());
    await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option=>option.textContent==="High")!.click());
    await click("Create task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({action:"save_task",task:expect.objectContaining({title:"Prepare launch assets",description:"Use the approved partner photographs.",status:"blocked",priority:"high",blockedReason:"Waiting for partner approval."})}));
  });
  it("creates a task with several assignees through the avatar picker", async () => {
    await open("marketing"); await click("New task"); await fill("new-task-title", "Shared campaign");
    await act(async () => document.getElementById("new-task-assignee")!.click());
    for (const name of ["Alex Example", "Sam Example"]) await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="Assign ${name}"]`)!.click());
    expect(document.querySelector('[aria-label="Assign Alex Example"]')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('[aria-label="Assign Sam Example"]')?.getAttribute("aria-checked")).toBe("true");
    await click("Done"); await click("Create task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_task", task: expect.objectContaining({ assigneeIds: initialLocalWorkspace().members.map(member => member.id) }) }));
  });
  it("includes a shared task when the viewer is its second assignee and shows all assignment avatars", async () => {
    const workspace = initialLocalWorkspace();
    const secondMember = workspace.members[1];
    const shared = { ...workspace.tasks[0], assigneeIds: workspace.members.map(member => member.id), title: "Shared design review", status: "todo" as const };
    load.mockResolvedValue({ ...workspace, viewerId: secondMember.id, canManage: false, taskLeadCategories: [], tasks: [shared] });
    await open("overview", true);
    expect(container.textContent).toContain("Shared design review");
    expect(container.querySelector('[aria-label="Assigned to Alex Example, Sam Example"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Complete Shared design review"]')!.click());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status", id: shared.id, status: "done" }));
  });
  it("describes every assignee to screen readers in read-only task details", async () => {
    await open("overview", true);
    await click("Deliver partner team photographs");
    expect(container.querySelector('[aria-label="Task properties"] [aria-label="Assigned to Alex Example, Sam Example"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("removes one co-assignee without clearing the other member", async () => {
    await open("partnership-deliverables");
    await click("Deliver partner team photographs"); await editTask();
    await act(async () => document.getElementById("task-assignee")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Assign Sam Example"]')!.click());
    expect(document.querySelector('[aria-label="Assign Alex Example"]')?.getAttribute("aria-checked")).toBe("true");
    await click("Done"); await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ assigneeIds: [initialLocalWorkspace().viewerId] }) }));
  });
  it("retains unsaved input after a revision conflict", async () => {
    mutate.mockRejectedValue(new ProjectRequestError("This task changed. Reload before saving.", 409));
    await open("production"); await click("Confirm material delivery"); await editTask(); await fill("task-title", "My unsaved edit"); await click("Save task");
    expect((document.getElementById("task-title") as HTMLInputElement).value).toBe("My unsaved edit");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Could not save task");
    expect(document.body.textContent).toContain("Reload task");
  });
  it("ignores a pending list refresh after navigating to a task", async () => {
    await open("production");
    let finish!: (data: ReturnType<typeof initialLocalWorkspace>) => void;
    load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click("Refresh"); await click("Confirm material delivery"); await editTask(); await click("Save task");
    await act(async () => finish(initialLocalWorkspace()));
    expect(container.querySelector("h1")?.textContent).toBe("Confirm material delivery");
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("false");
  });
  it.each(["refresh", "save"])("clears stale workspace and offers sign-in when token acquisition rejects during %s", async action => {
    const token = vi.fn().mockResolvedValueOnce("member-token");
    if (action === "save") token.mockResolvedValueOnce("member-token");
    token.mockRejectedValue(new CvRequestError("Your session has ended.", 401));
    const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify(initialLocalWorkspace())));
    const repository = createProjectRepository(token, request);
    load.mockImplementation(repository.load); mutate.mockImplementation(repository.mutate);
    await open("production");
    if (action === "save") { await click("Confirm material delivery"); await editTask(); await click("Save task"); }
    else await click("Refresh");
    expect(container.querySelector("h1")).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="notifications"]')?.textContent).toContain("Sign in");
    expect(request).toHaveBeenCalledTimes(action === "save" ? 2 : 1);
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
    await click("Confirm material delivery"); await editTask();
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
    await click("Confirm material delivery"); await editTask();
    expect(document.getElementById("task-assignee")?.hasAttribute("disabled")).toBe(true);
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status" }));
  });
  it("lets a scoped Lead without project-management permission update another member's status in Overview", async () => {
    const workspace = initialLocalWorkspace();
    workspace.tasks = workspace.tasks.map(task => task.title === "Chassis ready for assembly" ? { ...task, deadline: addDays(osloDate(), 5), assigneeIds: [workspace.members[1].id] } : task);
    load.mockResolvedValue({ ...workspace, canManage: false, taskLeadCategories: ["production"] });
    await open("overview");
    await click("Chassis ready for assembly");
    expect(document.getElementById("task-assignee")?.hasAttribute("disabled")).toBe(true);
    expect(document.getElementById("task-status")?.hasAttribute("disabled")).toBe(false);
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status", status: "todo" }));
  });
  it("can hide completed work through the personal view settings", async () => {
    await open("overview", true);
    await click("View settings");
    await act(async () => document.getElementById("view-completed")!.click());
    expect(container.querySelector('tbody[aria-label="Completed"]')).toBeNull();
    expect(container.querySelector('tbody[aria-label="Upcoming"]')).not.toBeNull();
  });
  it("keeps task modal input on failure and can create several tasks in the same folder", async () => {
    await open("marketing"); await click("New task");
    await act(async () => document.getElementById("create-another-task")!.click());
    await fill("new-task-title", "First update"); await click("Create task");
    expect((document.getElementById("new-task-title") as HTMLTextAreaElement).value).toBe("");
    const first = mutate.mock.calls[0][0];
    await fill("new-task-title", "Second update");
    mutate.mockRejectedValueOnce(new ProjectRequestError("Try again later.", 503));
    await click("Create task");
    expect((document.getElementById("new-task-title") as HTMLTextAreaElement).value).toBe("Second update");
    const failedId = mutate.mock.calls[1][0].id;
    await click("Create task");
    expect(mutate.mock.calls[2][0]).toMatchObject({ id: failedId, task: { category: "marketing", title: "Second update" } });
    expect(first.id).not.toBe(failedId);
  });
  it("shows observed progress and project completion in Overview", async () => {
    await open();
    expect(container.querySelector('[aria-label="Task progress over time"]')).not.toBeNull();
    expect(container.querySelector('[aria-label^="Progress on"]')?.textContent).toBe("Scope5Started4Completed1");
    expect(container.querySelector('[aria-label="Chassis & assembly: 1 of 3 tasks complete, 33%"]')).not.toBeNull();
    expect(container.textContent).toContain("Shaded area: future");
    expect(container.querySelector("[data-progress-deadline]")?.getAttribute("data-progress-deadline")).toBe(initialLocalWorkspace().projects.map(project => project.deadline).filter(Boolean).sort().pop());
    expect(button("Refresh")).toBeUndefined();
    expect(container.textContent).not.toContain("Completion by department");
    expect(container.textContent).not.toContain("View progress data");
    expect(container.querySelector('.tabler-icon-cube')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label^="See tasks for project Chassis & assembly,"]')!.click());
    const tables = container.querySelectorAll("table");
    expect(document.getElementById("task-project-filter")?.textContent).toBe("Chassis & assembly");
    expect(tables[tables.length - 1].textContent).toContain("Complete chassis design review");
    expect(tables[tables.length - 1].textContent).not.toContain("Publish workshop update");
    expect(tables[tables.length - 1].textContent).not.toContain("Submit competition registration");
  });
  it("uses the latest project deadline for Overview rather than individual task deadlines", async () => {
    const workspace = initialLocalWorkspace();
    const latest = addDays(osloDate(), 45);
    workspace.projects = workspace.projects.map((project, index) => ({ ...project, deadline: index === 0 ? latest : index === 1 ? null : addDays(osloDate(), 5) }));
    workspace.tasks = workspace.tasks.map(task => ({ ...task, deadline: addDays(osloDate(), 80) }));
    load.mockResolvedValue(workspace);
    await open();
    expect(container.querySelector("[data-progress-deadline]")?.getAttribute("data-progress-deadline")).toBe(latest);
  });
  it("omits the Overview deadline region when none of the projects has a deadline", async () => {
    const workspace = initialLocalWorkspace();
    workspace.projects = workspace.projects.map(project => ({ ...project, deadline: null }));
    load.mockResolvedValue(workspace);
    await open();
    expect(container.querySelector("[data-progress-deadline]")).toBeNull();
  });
  it("reloads the workspace when entering Overview from another work area", async () => {
    const router = await open("production");
    const next = initialLocalWorkspace();
    next.projects[0].name = "Updated project";
    load.mockResolvedValueOnce(next);
    await act(async () => router.navigate("/project-management/overview"));
    expect(load).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[aria-label^="See tasks for project Updated project,"]')).not.toBeNull();
  });
  it("updates Overview progress when returning after a task completion", async () => {
    const next = initialLocalWorkspace();
    next.tasks = next.tasks.map(task => task.title === "Confirm material delivery" ? { ...task, status: "done" as const } : task);
    mutate.mockResolvedValueOnce(next);
    const router = await open("production"); await click("Confirm material delivery"); await editTask();
    await act(async () => document.getElementById("task-status")!.click());
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === "Done")!.click());
    await click("Save task");
    load.mockResolvedValueOnce(next);
    await act(async () => router.navigate("/project-management/overview"));
    expect(container.querySelector('[aria-label="Chassis & assembly: 2 of 3 tasks complete, 67%"]')).not.toBeNull();
    expect(container.querySelector('[aria-label^="Progress on"]')?.textContent).toBe("Scope5Started4Completed2");
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("hides project editing controls from members without management access", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: false, taskLeadCategories: [] });
    await open();
    expect(container.querySelector('[aria-label="Create project"]')).toBeNull();
    expect(container.querySelector('[aria-label^="Edit project"]')).toBeNull();
    expect(container.querySelector('[aria-label^="See tasks for project"]')).not.toBeNull();
  });
  it("places Upcoming Milestones directly after the overview widgets", async () => {
    await open();
    expect(container.textContent).not.toContain("Projects in S27");
    expect(container.textContent).not.toContain("Department progress");
    expect(container.textContent).not.toContain("Latest open task or milestone deadline");
    expect(container.querySelector('[data-project-progress]')?.nextElementSibling?.textContent).toMatch(/^Upcoming Milestones/);
  });
  it("always sorts the work list by earliest deadline with undated work last", async () => {
    const workspace = initialLocalWorkspace();
    const late = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    const early = workspace.tasks.find(task => task.title === "Confirm material delivery")!;
    const undated = { ...workspace.tasks.find(task => task.title === "Assemble suspension mounts")!, deadline: null };
    load.mockResolvedValue({ ...workspace, tasks: [late, undated, early] });
    await open("production");
    const tables = container.querySelectorAll("table");
    const table = tables[tables.length - 1];
    expect([...table.querySelectorAll("tbody tr")].map(row => row.querySelector("button")?.textContent)).toEqual([early.title, late.title, undated.title]);
    expect(table.querySelector('[aria-sort="ascending"]')?.textContent).toBe("Target date");
  });
  it("shows milestone completion from every linked active task, including children outside the date window", async () => {
    const workspace = initialLocalWorkspace();
    workspace.tasks = workspace.tasks.map(task => task.title === "Assemble suspension mounts" ? { ...task, status: "cancelled" as const } : task.kind === "milestone" ? { ...task, deadline: addDays(osloDate(), 5), assigneeIds: workspace.members.map(member => member.id) } : task);
    load.mockResolvedValue(workspace);
    await open();
    const row = button("Chassis ready for assembly").closest("tr")!;
    expect(row.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("50");
    expect(row.querySelector('[aria-label="1 of 2 tasks complete"]')?.textContent).toBe("1 / 2");
    expect(row.querySelectorAll('[role="progressbar"] circle')).toHaveLength(2);
    expect(row.querySelector('[aria-label="Leads: Alex Example, Sam Example"]')).not.toBeNull();
    expect(row.querySelector('.tabler-icon-diamonds')).not.toBeNull();
  });
  it("limits Upcoming Milestones to open goals due today through day 30", async () => {
    const workspace = initialLocalWorkspace();
    const goal = workspace.tasks.find(task => task.kind === "milestone")!;
    const today = osloDate();
    load.mockResolvedValue({ ...workspace, tasks: [
      { ...goal, id: "day31", title: "Beyond window", deadline: addDays(today, 31) },
      { ...goal, id: "day30", title: "Due in 30 days", deadline: addDays(today, 30) },
      { ...goal, id: "today", title: "Due today", deadline: today },
      { ...goal, id: "past", title: "Overdue milestone", deadline: addDays(today, -1) },
      { ...goal, id: "undated", title: "Undated milestone", deadline: null },
      { ...goal, id: "done", title: "Completed milestone", deadline: addDays(today, 1), status: "done" },
      { ...goal, id: "cancelled", title: "Cancelled milestone", deadline: addDays(today, 2), status: "cancelled" },
      { ...workspace.tasks[1], title: "An ordinary task", deadline: addDays(today, 1) },
    ] });
    await open();
    const tables = container.querySelectorAll("table");
    const table = tables[tables.length - 1];
    expect([...table.querySelectorAll("tbody tr")].map(row => row.querySelector("button")?.textContent)).toEqual(["Due today", "Due in 30 days"]);
    expect([...table.querySelectorAll("th")].map(cell => cell.textContent)).toEqual(["Milestone", "Department", "Priority", "Leads", "Target date", "Tasks", "Status"]);
    expect(container.querySelector('[aria-label="Search tasks"]')).toBeNull();
    expect(button("Timeline")).toBeUndefined();
  });
  function inlineWorkspace() {
    const workspace = initialLocalWorkspace();
    workspace.tasks = workspace.tasks.map(task => task.title === "Chassis ready for assembly" ? { ...task, deadline: addDays(osloDate(), 7) } : task);
    return workspace;
  }
  const inlineButton = (field: string) => document.querySelector<HTMLButtonElement>(`[aria-label="Change ${field} for Chassis ready for assembly"]`)!;
  it("keeps departments in a separate column and milestone names free of subtitles", async () => {
    load.mockResolvedValue(inlineWorkspace()); await open();
    const row = button("Chassis ready for assembly").closest("tr")!;
    const cells = row.querySelectorAll("td");
    expect(cells[0].textContent).toBe("Chassis ready for assembly");
    expect(cells[1].textContent).toBe("Mechanical & Production, Electronics");
    expect(cells[0].textContent).not.toContain("Chassis & assembly");
  });
  it("saves priority inline with the existing revision and unchanged hierarchy", async () => {
    const workspace = inlineWorkspace(); load.mockResolvedValue(workspace); await open();
    const goal = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    await act(async () => inlineButton("priority").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })));
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(item => item.textContent === "High")!.click());
    expect(mutate).toHaveBeenCalledWith({ action: "update_milestone", id: goal.id, expectedRevision: goal.revision, changes: { priority: "high" } });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it("saves several Leads inline without an invite option", async () => {
    const workspace = inlineWorkspace(); load.mockResolvedValue(workspace); await open();
    await act(async () => inlineButton("leads").click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Assign Sam Example as lead"]')!.click());
    expect(document.querySelector('[data-slot="popover-content"]')?.textContent).not.toContain("Invite");
    await click("Save leads");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "update_milestone", expectedRevision: 1, changes: { assigneeIds: workspace.members.map(member => member.id) } }));
  });
  it("discards an unsaved Lead selection when its menu is cancelled", async () => {
    load.mockResolvedValue(inlineWorkspace()); await open();
    await act(async () => inlineButton("leads").click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Assign Sam Example as lead"]')!.click());
    await click("Cancel");
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    await act(async () => inlineButton("leads").click());
    expect(document.querySelector('[aria-label="Assign Sam Example as lead"]')?.getAttribute("aria-checked")).toBe("false");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("lets a date change move a milestone out of the upcoming window", async () => {
    const workspace = inlineWorkspace(); load.mockResolvedValue(workspace); await open();
    const goal = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    const deadline = addDays(osloDate(), 31);
    mutate.mockResolvedValue({ ...workspace, tasks: workspace.tasks.map(task => task.id === goal.id ? { ...task, deadline, revision: 2 } : task) });
    await act(async () => inlineButton("target date").click());
    await fill(`milestone-date-${goal.id}`, deadline); await click("Save date");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "update_milestone", id: goal.id, expectedRevision: 1, changes: { deadline } }));
    expect(button(goal.title)).toBeUndefined();
  });
  it("supports arrow-key calendar navigation and selecting a day", async () => {
    const workspace = inlineWorkspace(); load.mockResolvedValue(workspace); await open();
    const goal = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    await act(async () => inlineButton("target date").click());
    const selected = document.querySelector<HTMLButtonElement>(`[data-day="${goal.deadline}"]`)!;
    await act(async () => { selected.focus(); selected.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    const next = addDays(goal.deadline!, 1);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(formatDate(next));
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    await click("Save date");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "update_milestone", changes: { deadline: next } }));
  });
  it("keeps the date draft after a conflict and reports recovery through notifications", async () => {
    const workspace = inlineWorkspace(); load.mockResolvedValue(workspace); await open();
    const goal = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    mutate.mockRejectedValueOnce(new ProjectRequestError("This milestone changed. Reload before saving.", 409));
    await act(async () => inlineButton("target date").click());
    const deadline = addDays(osloDate(), 10);
    await fill(`milestone-date-${goal.id}`, deadline); await click("Save date");
    expect((document.getElementById(`milestone-date-${goal.id}`) as HTMLInputElement).value).toBe(deadline);
    expect(container.querySelector('[data-testid="notifications"]')?.textContent).toContain("Reload tasks");
  });
  it("validates inline dates before sending and retains invalid drafts", async () => {
    const workspace = inlineWorkspace(); load.mockResolvedValue(workspace); await open();
    const goal = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    await act(async () => inlineButton("target date").click());
    await fill(`milestone-date-${goal.id}`, ""); await click("Save date");
    expect(mutate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="notifications"]')?.textContent).toContain("Set a deadline");
    expect(document.getElementById(`milestone-date-${goal.id}`)).not.toBeNull();
  });
  it("requires a scoped Department Lead grant but allows legacy placement for inline editing", async () => {
    const workspace = inlineWorkspace();
    load.mockResolvedValue({ ...workspace, canManage: true, taskLeadCategories: ["marketing"] }); await open();
    expect(inlineButton("priority")).toBeNull();
    expect(inlineButton("leads")).toBeNull();
    expect(inlineButton("target date")).toBeNull();
    load.mockResolvedValue({ ...workspace, tasks: workspace.tasks.map(task => task.kind === "milestone" ? { ...task, projectId: null } : task) });
    await open(); expect(inlineButton("priority")).not.toBeNull();
    expect(inlineButton("leads")).not.toBeNull();
    expect(inlineButton("target date")).not.toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });
  it("keeps Projects and Upcoming Milestones headings outside their cards", async () => {
    await open();
    for (const id of ["overview-projects-title", "upcoming-milestones-title"]) {
      const heading = document.getElementById(id)!;
      expect(heading.tagName).toBe("H2");
      expect(heading.closest('[data-slot="card"]')).toBeNull();
      expect(heading.parentElement?.parentElement?.querySelector('[data-slot="card"]')).not.toBeNull();
    }
  });
  it("saves an unorganized milestone field without submitting or changing placement", async () => {
    const workspace = inlineWorkspace();
    const goal = workspace.tasks.find(task => task.title === "Chassis ready for assembly")!;
    load.mockResolvedValue({ ...workspace, tasks: workspace.tasks.map(task => task.id === goal.id ? { ...task, projectId: null } : task) });
    await open();
    await act(async () => inlineButton("priority").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })));
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(item => item.textContent === "Low")!.click());
    expect(mutate).toHaveBeenCalledWith({ action: "update_milestone", id: goal.id, expectedRevision: goal.revision, changes: { priority: "low" } });
  });
  it("creates a milestone with multiple leads using the member picker", async () => {
    await open("marketing"); await click("New milestone");
    await fill("new-task-title", "Partner campaign launch");
    await click("Due date"); await fill("new-task-deadline", "2026-12-15");
    await click("15 Dec 2026");
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    const picker = document.getElementById("new-task-assignee")!;
    expect(picker.getAttribute("aria-label")).toBe("Choose milestone leads");
    await act(async () => picker.click());
    for (const name of ["Alex Example", "Sam Example"]) await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="Assign ${name} as lead"]`)!.click());
    await click("Done");
    expect(picker.textContent).toContain("2 leads");
    await click("Create milestone");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_task", task: expect.objectContaining({ kind: "milestone", assigneeIds: initialLocalWorkspace().members.map(member => member.id) }) }));
  });
  it("edits milestone leads without dropping the remaining lead", async () => {
    const workspace = initialLocalWorkspace();
    workspace.tasks = workspace.tasks.map(task => task.kind === "milestone" ? { ...task, assigneeIds: workspace.members.map(member => member.id) } : task);
    load.mockResolvedValue(workspace);
    await open("production");
    // The area project card also contains the milestone; use the table row's button.
    const tables = container.querySelectorAll("table");
    const table = tables[tables.length - 1];
    await act(async () => [...table.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "Chassis ready for assembly")!.click());
    const picker = document.getElementById("task-assignee")!;
    expect(document.querySelector('label[for="task-assignee"]')?.textContent).toBe("Leads");
    await act(async () => picker.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Assign Sam Example as lead"]')!.click());
    await click("Done"); await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_task", task: expect.objectContaining({ kind: "milestone", assigneeIds: [workspace.viewerId] }) }));
  });
  it("creates a dated milestone in its authorized work area", async () => {
    await open("marketing"); await click("New milestone");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Create milestone");
    await fill("new-task-title", "Campaign launch"); await click("Due date");
    await fill("new-task-deadline", "2026-12-15");
    // Dismiss the date popover before submitting the composer.
    await click("15 Dec 2026"); await click("Create milestone");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_task", task: expect.objectContaining({ title: "Campaign launch", kind: "milestone", milestoneId: null, category: "marketing", deadline: "2026-12-15" }) }));
  });
  it("shows the milestone link read-only for an assigned member", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: false, taskLeadCategories: [] });
    await open("overview", true); await click("Confirm material delivery"); await editTask();
    const field = document.getElementById("task-milestone");
    expect(field?.hasAttribute("disabled")).toBe(true);
    expect(field?.textContent).toContain("Chassis ready for assembly");
    await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status" }));
  });

  it("opens a routed milestone composer only inside an authorized area", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), taskLeadCategories: ["marketing"] });
    await open("production", false, "?create=milestone");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await open("marketing", false, "?create=milestone");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Create milestone");
  });
  it("keeps a task draft when a Lead clears its required milestone", async () => {
    await open("production"); await click("Confirm material delivery"); await editTask();
    await act(async () => document.getElementById("task-milestone")!.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === "Choose milestone")!;
    await act(async () => option.click()); await click("Save task");
    expect(mutate).not.toHaveBeenCalled();
    expect(document.getElementById("task-title")).not.toBeNull();
    expect(document.querySelector('[data-testid="notifications"]')?.textContent).toContain("Choose a milestone");
  });
  it("renders an empty Overview without inventing task completion or history", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), tasks: [], projects: [], progressEvents: [], departments: [], taskLeadCategories: [] });
    await open();
    expect(container.querySelector('[aria-label^="Progress on"]')?.textContent).toBe("Scope0Started0Completed0");
    expect(container.querySelectorAll('table[aria-label="Department progress"] tbody tr')).toHaveLength(7);
    expect(container.textContent).toContain("A project and milestone are needed before adding tasks.");
    expect(container.querySelector('[aria-label="New milestone"]')).toBeNull();
  });

  it("includes completed children when selecting a milestone through the work-area list filter", async () => {
    await open("production");
    await act(async () => document.getElementById("task-milestone-filter")!.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === "Chassis ready for assembly")!;
    await act(async () => option.click());
    const tables = container.querySelectorAll("table");
    expect(tables[tables.length - 1].textContent).toContain("Complete chassis design review");
    expect(document.getElementById("task-status-filter")?.textContent).toBe("All statuses");
  });

  it("retains legacy work in Needs organization and sends a Lead to its area editor", async () => {
    const workspace = initialLocalWorkspace();
    const legacy = { ...workspace.tasks[1], projectId: null, milestoneId: null };
    load.mockResolvedValue({ ...workspace, tasks: [legacy] });
    await open();
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.startsWith("Needs organization"))!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(legacy.title);
    await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="Organize ${legacy.title}"]`)!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Choose a project and milestone");
    expect(document.getElementById("task-project")?.hasAttribute("disabled")).toBe(false);
  });
  it("allows an assignee to update unorganized legacy work without changing its placement", async () => {
    const workspace = initialLocalWorkspace();
    load.mockResolvedValue({ ...workspace, tasks: [{ ...workspace.tasks[1], projectId: null, milestoneId: null }], canManage: false, taskLeadCategories: [] });
    await open("overview", true); await click("Confirm material delivery"); await editTask(); await click("Save task");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "set_status" }));
  });
  it("shows milestones and their tasks nested inside the department project in its work area", async () => {
    await open("production");
    const project = container.querySelector('[aria-label="Milestones in Chassis & assembly"]');
    expect(project?.textContent).toContain("Chassis ready for assembly");
    expect(project?.textContent).toContain("Confirm material delivery");
    expect(project?.textContent).not.toContain("Publish workshop update");
  });

  it("clears an unrelated search when opening a milestone from a project card", async () => {
    await open("production");
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search tasks"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "no matching task"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    const project = container.querySelector('[aria-label="Milestones in Chassis & assembly"]')!;
    const view = [...project.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "View tasks")!;
    await act(async () => view.click());
    expect(search.value).toBe("");
    const tables = container.querySelectorAll("table");
    expect(tables[tables.length - 1].textContent).toContain("Complete chassis design review");
  });
  it("shows one department per table row with members, Lead, task count and circular status", async () => {
    await open();
    const areas = container.querySelector('section[aria-labelledby="progress-areas-title"]')!;
    expect(areas.querySelector("h3")?.textContent).toBe("Areas");
    expect(areas.querySelector('[aria-label="Mechanical & Production: 1 of 3 tasks complete, 33%"]')).not.toBeNull();
    expect(areas.querySelector('[aria-label="Electronics: 1 of 3 tasks complete, 33%"]')).not.toBeNull();
    expect([...areas.querySelectorAll("tbody td:first-child")].map(cell => cell.textContent)).not.toContain("Production");
    expect(areas.textContent).toContain("Alex Example");
    const table = areas.querySelector("table")!;
    expect([...table.querySelectorAll("thead th")].map(cell => cell.textContent)).toEqual(["Department", "Members", "Lead", "Tasks", "Status"]);
    const mechanical = areas.querySelector('[aria-label="Edit department Mechanical & Production"]')!.closest("tr")!;
    expect(mechanical.querySelectorAll("td")[1].textContent).toBe("2");
    expect(mechanical.querySelectorAll("td")[3].textContent).toBe("1 / 3");
    expect(mechanical.querySelector('[aria-label="Leads: Alex Example"]')).not.toBeNull();
    expect(container.querySelector('[role="tablist"][aria-label="Progress breakdown"]')).toBeNull();
  });
  it("retains unallocated work in the department breakdown", async () => {
    const workspace = initialLocalWorkspace();
    load.mockResolvedValue({ ...workspace, projects: workspace.projects.map(project => ({ ...project, departments: [] })) });
    await open();
    const areas = container.querySelector('section[aria-labelledby="progress-areas-title"]')!;
    expect(areas.querySelector('[aria-label="No department: 1 of 5 tasks complete, 20%"]')).not.toBeNull();
  });

  it("edits members and Lead for a fixed department without offering department creation", async () => {
    await open();
    expect(button("Add department")).toBeUndefined();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Edit department Software & Autonomous"]')!.click());
    expect((document.getElementById("department-name") as HTMLInputElement).readOnly).toBe(true);
    await act(async () => document.getElementById("department-members")!.click());
    for (const name of ["Alex Example", "Sam Example"]) await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="Add ${name} to department"]`)!.click());
    await click("Done");
    await act(async () => document.getElementById("department-lead")!.click());
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === "Sam Example")!.click());
    await click("Save department");
    const workspace = initialLocalWorkspace();
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_department", expectedRevision: 1, department: { name: "Software & Autonomous", memberIds: workspace.members.map(member => member.id), leadId: workspace.members[1].id } }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("removes the Lead when that member is removed from a department", async () => {
    await open(); await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Edit department Mechanical & Production"]')!.click());
    expect((document.getElementById("department-name") as HTMLInputElement).readOnly).toBe(true);
    await act(async () => document.getElementById("department-members")!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Add Alex Example to department"]')!.click());
    await click("Done");
    expect(document.getElementById("department-lead")?.textContent).toBe("No Lead");
    await click("Save department");
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "save_department", expectedRevision: 1, department: { name: "Mechanical & Production", memberIds: [initialLocalWorkspace().members[1].id], leadId: null } }));
  });
  it("retains a department draft after a save conflict", async () => {
    mutate.mockRejectedValueOnce(new ProjectRequestError("This department changed. Reload before saving.", 409));
    await open(); await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Edit department Software & Autonomous"]')!.click()); await click("Save department");
    expect((document.getElementById("department-name") as HTMLInputElement).value).toBe("Software & Autonomous");
    expect(container.querySelector('[data-testid="notifications"]')?.textContent).toContain("Reload departments");
  });
  it("always shows the seven departments in organization order, including departments without projects", async () => {
    const workspace = initialLocalWorkspace(); load.mockResolvedValue({ ...workspace, projects: [], tasks: [] });
    await open();
    const rows = [...container.querySelectorAll('table[aria-label="Department progress"] tbody tr')];
    expect(rows.map(row => row.querySelector("td")?.textContent)).toEqual([...ORGANIZATION_DEPARTMENTS]);
    expect(rows[0].querySelectorAll("td")[1].textContent).toBe("0");
    expect(rows[0].querySelectorAll("td")[3].textContent).toBe("0 / 0");
  });
  it("offers only the fixed departments when editing a project", async () => {
    await open(); await click("New project");
    const group = document.getElementById("project-departments")!;
    expect([...group.querySelectorAll('[role="checkbox"]')].map(checkbox => checkbox.getAttribute("aria-label"))).toEqual([...ORGANIZATION_DEPARTMENTS]);
    expect(group.querySelector('input[type="text"]')).toBeNull();
  });
  it("hides department management from members without project-management access", async () => {
    load.mockResolvedValue({ ...initialLocalWorkspace(), canManage: false, taskLeadCategories: ["production"] }); await open();
    expect(button("Add department")).toBeUndefined();
    expect(container.querySelector('[aria-label="Edit department Mechanical & Production"]')).toBeNull();
    expect(container.querySelector('section[aria-labelledby="progress-areas-title"]')?.textContent).toContain("Mechanical & Production");
  });

});
