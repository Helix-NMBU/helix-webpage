// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectComposer } from "./ProjectComposer";
import { addDays, formatDate, osloDate } from "./model";
import { TASK_CATEGORIES, type ProjectMutation, type TaskCategory } from "./types";
const notify = vi.hoisted(() => vi.fn());
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));

describe("project creation composer", () => {
  let root: Root, container: HTMLDivElement;
  const save = vi.fn<(mutation: ProjectMutation) => Promise<unknown>>();
  const close = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    notify.mockReset();save.mockReset().mockResolvedValue(undefined);close.mockReset();
    container=document.createElement("div");document.body.append(container);root=createRoot(container);
  });
  afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();vi.useRealTimers();});
  async function open(categories: TaskCategory[] = [...TASK_CATEGORIES], assignDefaultLead = true) {
    await act(async()=>root.render(<ProjectComposer category="production" members={[{id:"00000000-0000-4000-8000-000000000001",name:"Alex Example"}]} taskLeadCategories={categories} busy={false} onSave={save} onClose={close} />));
    if (assignDefaultLead) await assignLead();
  }
  const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
  async function click(text:string){await act(async()=>button(text).click());}
  async function assignLead(){
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Choose project leads"]')!.click());
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Assign Alex Example as lead"]')!.click());
    await click("Done");
  }
  async function field(id:string,value:string){
    const input=document.getElementById(id) as HTMLInputElement|HTMLTextAreaElement;
    const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    await act(async()=>{Object.getOwnPropertyDescriptor(prototype,"value")!.set!.call(input,value);input.dispatchEvent(new Event("input",{bubbles:true}));});
  }
  // Radix restores focus on a deferred unmount callback. Let it finish before
  // the next simulated interaction opens a sibling popover.
  async function settleFocus(){await act(async()=>{await new Promise<void>(resolve=>setTimeout(resolve,0));});}
  async function date(label:string,value=addDays(osloDate(),1)){
    await settleFocus();
    await act(async()=>document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click());
    await act(async()=>document.querySelector<HTMLButtonElement>(`[role="grid"] [aria-label="${formatDate(value)}"]`)!.click());
    await settleFocus();
  }
  async function milestone(title:string){
    await click("Add milestone");await field("project-milestone-title",title);await date("Milestone target date");await click("Add milestone");
  }
  it("queues, edits and removes milestones before a single project save",async()=>{
    await open();await field("project-name","Vehicle build");await field("project-description","Fabrication and assembly");
    await click("Milestones");await milestone("Design review");await milestone("Temporary goal");
    expect(save).not.toHaveBeenCalled();
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Remove milestone Temporary goal"]')!.click());
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Edit milestone Design review"]')!.click());
    await field("project-milestone-description","Drawings approved");await click("Save milestone");
    await click("Create project");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({action:"save_project",expectedRevision:0,project:expect.objectContaining({name:"Vehicle build",description:"Fabrication and assembly"}),milestones:[expect.objectContaining({title:"Design review",description:"Drawings approved",deadline:addDays(osloDate(),1)})]}));
  });
  it("keeps drafts and their IDs after a save error so the user can retry",async()=>{
    save.mockRejectedValueOnce(new Error("Connection interrupted"));
    await open();await field("project-name","Retry build");await click("Milestones");await milestone("Review");await click("Create project");
    expect(notify).toHaveBeenCalledWith("Could not save project","Connection interrupted",expect.objectContaining({variant:"error"}));
    expect((document.getElementById("project-name") as HTMLInputElement).value).toBe("Retry build");
    await click("Create project");expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);expect(close).not.toHaveBeenCalled();
  });
  it("requires milestone title and date, and prevents an unadded draft from being lost",async()=>{
    await open();await field("project-name","Build");await click("Milestones");await click("Add milestone");
    expect(button("Create project").disabled).toBe(true);
    await click("Add milestone");expect(notify).toHaveBeenCalled();expect(save).not.toHaveBeenCalled();
    await field("project-milestone-title","Review");await click("Add milestone");
    expect(notify.mock.calls[notify.mock.calls.length-1]?.[1]).toContain("deadline");
    await click("Cancel milestone");await click("Create project");expect(save.mock.calls[0][0]).not.toHaveProperty("milestones");
  });
  it("allows project-only creation without granting milestone creation to a manager",async()=>{
    await open([]);await field("project-name","Manager project");await click("Milestones");
    expect(button("Add milestone")).toBeUndefined();expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Department Lead");
    await click("Create project");expect(save).toHaveBeenCalledWith(expect.objectContaining({project:expect.objectContaining({name:"Manager project"})}));
  });
  it("requires a project Lead before saving",async()=>{
    await open([...TASK_CATEGORIES],false);await field("project-name","Unassigned project");await click("Create project");
    expect(save).not.toHaveBeenCalled();expect(notify.mock.calls[notify.mock.calls.length - 1]?.[1]).toContain("at least one project Lead");
  });
  it("preserves milestones when changing area and requires a scoped Lead or their removal",async()=>{
    await open(["production"]);await field("project-name","Build");await click("Milestones");await milestone("Review");
    await act(async()=>document.getElementById("project-category")!.click());
    await act(async()=>[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(o=>o.textContent==="Operations")!.click());
    await click("Create project");expect(save).not.toHaveBeenCalled();expect(notify.mock.calls[notify.mock.calls.length-1]?.[1]).toContain("area you lead");
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Remove milestone Review"]')!.click());await click("Create project");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({project:expect.objectContaining({category:"operations"})}));
  });
  it("supports keyboard calendar navigation, bounded target dates and clearing optional dates",async()=>{
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    await open();await date("Start date");
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Target date"]')!.click());
    const previous=document.querySelector<HTMLButtonElement>(`[role="grid"] [aria-label="${formatDate(osloDate())}"]`)!;
    expect(previous).not.toBeNull();
    expect(previous.disabled).toBe(true);
    const focused=document.querySelector<HTMLButtonElement>('[role="grid"] button[tabindex="0"]')!;
    const next=addDays(focused.dataset.day!,1);
    await act(async()=>focused.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true})));
    expect((document.activeElement as HTMLElement).dataset.day).toBe(next);
    await act(async()=>document.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)!.click());
    await settleFocus();
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Target date"]')!.click());
    await click("Clear date");expect(document.querySelector<HTMLButtonElement>('[aria-label="Target date"]')?.textContent).toBe("Target date");
  });
});
