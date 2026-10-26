// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionsPanel } from "./PositionsPanel";
import type { RecruitmentPosition } from "./positions";

const position: RecruitmentPosition = {
  id: "open-application", title: "Open Application", department: "Open", applyUrl: "/apply/form",
  contact: { name: "Recruiter", email: "recruiter@helixnmbu.no", linkedin: "https://www.linkedin.com/in/recruiter" },
  about: "Join the team.", tasks: ["Build", "Learn"], achieve: ["Experience"], visible: true,
};
let root: Root;
let container: HTMLDivElement;
const save = vi.fn<(position: Omit<RecruitmentPosition, "id"> & { id?: string }) => Promise<void>>();
const remove = vi.fn<(id: string) => Promise<void>>();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  save.mockReset().mockResolvedValue(undefined); remove.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(positions = [position], loading = false) {
  await act(async () => root.render(<PositionsPanel positions={positions} loading={loading} onSave={save} onDelete={remove} />));
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === text);
  expect(button, `Button ${text}`).toBeDefined();
  await act(async () => button!.click());
}
async function fill(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  expect(input).not.toBeNull();
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

describe("recruitment position editor", () => {
  it("creates hidden positions with normalized details and one task/outcome per line", async () => {
    await render([]); await click("Create position");
    expect(document.getElementById("position-visible")?.getAttribute("aria-checked")).toBe("false");
    await fill("position-title", " Software Engineer ");
    await fill("position-contact-name", " Recruiter ");
    await fill("position-contact-email", "recruiter@helixnmbu.no");
    await fill("position-about", " Build the car. ");
    await fill("position-tasks", " Develop software \n\n Test the car \n");
    await fill("position-outcomes", " Experience \n Teamwork ");
    await submit();
    expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Software Engineer", department: "Software", applyUrl: "",
      contact: { name: "Recruiter", email: "recruiter@helixnmbu.no" }, about: "Build the car.", tasks: ["Develop software", "Test the car"], achieve: ["Experience", "Teamwork"], visible: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps all edited details after a failed save and permits retry", async () => {
    save.mockRejectedValueOnce(new Error("Unavailable"));
    await render(); await click("Edit");
    expect((document.getElementById("position-tasks") as HTMLTextAreaElement).value).toBe("Build\nLearn");
    await fill("position-title", "Open opportunities");
    await fill("position-contact-linkedin", "https://www.linkedin.com/in/new-contact");
    await act(async () => (document.getElementById("position-visible") as HTMLButtonElement).click());
    await submit();
    expect((document.getElementById("position-title") as HTMLInputElement).value).toBe("Open opportunities");
    expect(document.body.textContent).not.toContain("Unavailable");
    await submit();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ id: "open-application", title: "Open opportunities", department: "Open", visible: false,
      contact: { linkedin: "https://www.linkedin.com/in/new-contact" } });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("prevents duplicate saves and closing the editor while a save is pending", async () => {
    let finish!: () => void;
    save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await render(); await click("Edit");
    await submit(); await submit();
    expect(save).toHaveBeenCalledTimes(1);
    const cancel = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Cancel")!;
    expect(cancel.disabled).toBe(true);
    expect(document.querySelector('[data-slot="dialog-close"]')).toBeNull();
    await act(async () => finish());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("requires deletion confirmation, retains failed selections, and prevents duplicate deletion", async () => {
    remove.mockRejectedValueOnce(new Error("Unavailable"));
    await render(); await click("Delete");
    expect(remove).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Existing applications keep their saved position details.");
    await click("Delete position");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    let finish!: () => void;
    remove.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    await click("Delete position");
    const deleting = [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Deleting…")!;
    expect(deleting.disabled).toBe(true);
    await act(async () => deleting.click());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith("open-application");
    await act(async () => finish());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
