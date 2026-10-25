// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEMBER_THEME_KEY, MemberThemeProvider, useMemberTheme, validMemberTheme } from "./MemberTheme";

function Controls() {
  const { theme, setTheme } = useMemberTheme();
  return <><p>{theme}</p><button onClick={() => setTheme("light")}>Light</button><button onClick={() => setTheme("dark")}>Dark</button><button onClick={() => setTheme("system")}>System</button></>;
}
describe("member theme preference", () => {
  let root: Root;
  let container: HTMLDivElement;
  let matches: boolean;
  let change: (() => void) | undefined;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.removeItem(MEMBER_THEME_KEY);
    matches = false;
    change = undefined;
    vi.spyOn(window, "matchMedia").mockImplementation(() => ({
      get matches() { return matches; }, media: "(prefers-color-scheme: dark)", onchange: null,
      addEventListener: (_type: string, callback: EventListenerOrEventListenerObject) => { change = callback as () => void; },
      removeEventListener: () => { change = undefined; }, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
    }));
    container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function mount() { await act(async () => root.render(<MemberThemeProvider><Controls /></MemberThemeProvider>)); }
  async function choose(label: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)?.click()); }

  it("follows system changes, while an explicit choice overrides them", async () => {
    await mount();
    expect(document.documentElement.dataset.memberTheme).toBe("light");
    await act(async () => { matches = true; change?.(); });
    expect(document.documentElement.dataset.memberTheme).toBe("dark");
    await choose("Light");
    await act(async () => { matches = true; change?.(); });
    expect(document.documentElement.dataset.memberTheme).toBe("light");
    await choose("System");
    expect(document.documentElement.dataset.memberTheme).toBe("dark");
  });
  it("loads a saved preference and cleans up the theme when leaving the member app", async () => {
    localStorage.setItem(MEMBER_THEME_KEY, "dark");
    await mount();
    expect(document.documentElement.dataset.memberTheme).toBe("dark");
    await act(async () => root.unmount());
    expect(document.documentElement.dataset.memberTheme).toBeUndefined();
    root = createRoot(container);
  });
  it("keeps theme controls working when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await mount(); await choose("Dark");
    expect(document.documentElement.dataset.memberTheme).toBe("dark");
  });
  it("treats unknown stored values as system preference", () => {
    expect(validMemberTheme("invalid")).toBe("system");
    expect(validMemberTheme(null)).toBe("system");
  });
});
