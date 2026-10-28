// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavMain } from "./nav-main";
import { SidebarProvider } from "./ui/sidebar";
import { TooltipProvider } from "./ui/tooltip";

describe("space navigation", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  it("keeps navigation clickable and reorders entries with the keyboard without a separate handle", async () => {
    const navigate = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(<TooltipProvider><SidebarProvider><NavMain title="Your spaces" collapsible activeUrl="/" disabled={false} onNavigate={navigate} onReorder={save} items={[{ title: "First", url: "/first" }, { title: "Second", url: "/second", items: [{ title: "Home", url: "/second" }] }]} /></SidebarProvider></TooltipProvider>));
    const first = container.querySelector<HTMLButtonElement>('button[aria-label="First"]')!;
    expect(container.querySelector('[aria-label^="Reorder "]')).toBeNull();
    expect(first.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowUp Alt+ArrowDown");
    await act(async () => { first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true })); });
    expect(save).toHaveBeenCalledWith(["/second", "/first"]);
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => { first.click(); });
    expect(navigate).toHaveBeenCalledWith("/first", first);
    const group = [...container.querySelectorAll("button")].find(button => button.textContent === "Second")!;
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle Second pages"]')!;
    expect(group.getAttribute("aria-expanded")).toBe("false");
    await act(async () => { group.click(); });
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(navigate).toHaveBeenCalledTimes(1);
    await act(async () => { group.click(); });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    await act(async () => { toggle.click(); });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
