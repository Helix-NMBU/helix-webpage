// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberViewportGate, isPhoneDevice, MIN_MEMBER_VIEWPORT_WIDTH } from "./MemberViewportGate";
import { Dialog, DialogContent, DialogTitle } from "@libs/components/ui/dialog";
import { Input } from "@libs/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@libs/components/ui/popover";

const mount = vi.fn();
function Content() {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    mount();
  }, []);
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Draft form</DialogTitle>
        <Input aria-label="Draft title" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Popover>
          <PopoverTrigger>Open date</PopoverTrigger>
          <PopoverContent>Calendar content</PopoverContent>
        </Popover>
      </DialogContent>
    </Dialog>
  );
}

describe("member viewport gate", () => {
  let root: Root, element: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Desktop browser");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    mount.mockReset();
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    element.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function open() {
    await act(async () =>
      root.render(
        <MemberViewportGate>
          <Content />
        </MemberViewportGate>,
      ),
    );
  }
  async function resize(width: number) {
    await act(async () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));
    });
  }
  it.each([390, MIN_MEMBER_VIEWPORT_WIDTH - 1])(
    "blocks an initial %i px window before platform content mounts",
    async (width) => {
      await resize(width);
      await open();
      expect(element.textContent).toContain("Increase your window size");
      expect(mount).not.toHaveBeenCalled();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    },
  );
  it("opens automatically at the exact supported width", async () => {
    await resize(600);
    await open();
    await resize(MIN_MEMBER_VIEWPORT_WIDTH);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(element.querySelector("#member-screen-title")).toBeNull();
    expect(document.querySelector('[aria-label="Draft title"]')).not.toBeNull();
  });
  it("keeps phone users blocked at landscape and desktop widths", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
    );
    await resize(844);
    await open();
    await resize(1440);
    expect(element.textContent).toContain("Use a desktop computer");
    expect(mount).not.toHaveBeenCalled();
  });
  it("contains open dialogs and popovers and preserves draft state across a temporary resize", async () => {
    await open();
    const input = document.querySelector<HTMLInputElement>('[aria-label="Draft title"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Unsaved build plan",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === "Open date")!
        .click(),
    );
    const content = element.querySelector<HTMLElement>("[data-member-viewport-content]")!;
    expect(content.contains(document.querySelector('[data-slot="dialog-content"]'))).toBe(true);
    expect(content.contains(document.querySelector('[data-slot="popover-content"]'))).toBe(true);
    await resize(500);
    expect(content.hidden).toBe(true);
    expect(content.hasAttribute("inert")).toBe(true);
    expect(content.style.display).toBe("none");
    expect(
      element.querySelector("#member-screen-title")?.closest('[aria-hidden="true"]'),
    ).toBeNull();
    await resize(1024);
    expect(content.hidden).toBe(false);
    expect(content.hasAttribute("inert")).toBe(false);
    expect(document.querySelector<HTMLInputElement>('[aria-label="Draft title"]')?.value).toBe(
      "Unsaved build plan",
    );
    expect(mount).toHaveBeenCalledTimes(1);
  });
  it("recognizes phone signals while allowing tablets and desktop devices", () => {
    for (const userAgent of [
      "iPhone",
      "iPod",
      "Android 15 Mobile Safari",
      "Windows Phone",
      "IEMobile",
      "Opera Mini",
    ])
      expect(isPhoneDevice({ userAgent })).toBe(true);
    expect(isPhoneDevice({ userAgent: "Desktop", userAgentData: { mobile: true } })).toBe(true);
    for (const userAgent of ["Macintosh", "iPad", "Android 15 Tablet"])
      expect(isPhoneDevice({ userAgent })).toBe(false);
  });
});
