// @vitest-environment happy-dom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberThemeProvider } from "./MemberTheme";
import { MemberNotificationsPage, MemberNotificationsProvider, useMemberNotifications } from "./MemberNotifications";

const retry = vi.fn();
function SendNotification() {
  const notifications = useMemberNotifications();
  const sequence = useRef(0);
  return <>
    <button onClick={() => notifications?.notify(`CV update ${++sequence.current}`, "Your CV visibility changed.")}>Publish CV</button>
    <button onClick={() => notifications?.notify("Save delayed", "Try again.", { id: "save-status", variant: "warning", href: null, action: { label: "Retry", onClick: retry } })}>Warn</button>
    <button onClick={() => notifications?.notify("Save failed", "Your input has been kept.", { id: "save-status", variant: "error", href: null, action: { label: "Retry", onClick: retry } })}>Fail</button>
    <output>{notifications?.unread} unread</output>
  </>;
}

describe("member notifications", () => {
  let root: Root;
  let container: HTMLDivElement;
  let router: ReturnType<typeof createMemoryRouter>;
  beforeEach(() => {
    retry.mockReset();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    router = createMemoryRouter([{ path: "/", element: <p>Home</p> }, { path: "/notifications", element: <MemberNotificationsPage /> }]);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function render(member = "member-one") {
    await act(async () => root.render(<MemberThemeProvider><MemberNotificationsProvider key={member}><SendNotification /><RouterProvider router={router} /></MemberNotificationsProvider></MemberThemeProvider>));
  }
  const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name)!;
  async function click(name: string) {
    await act(async () => {
      button(name).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  async function openNotifications(count: number) {
    await render();
    for (let i = 0; i < count; i++) await click("Publish CV");
    await act(async () => router.navigate("/notifications"));
  }
  const rows = () => [...container.querySelectorAll("article")];

  it("keeps messages unread when the page is opened and positions the popup at the top right", async () => {
    await openNotifications(1);
    expect(rows()[0].textContent).toContain("CV update 1");
    expect(container.querySelector("output")?.textContent).toBe("1 unread");
    expect(container.querySelector('[data-sonner-toaster]')?.getAttribute("data-x-position")).toBe("right");
    expect(container.querySelector('[data-sonner-toaster]')?.getAttribute("data-y-position")).toBe("top");
    expect(button("Mark as read").disabled).toBe(true);
    await act(async () => router.navigate("/"));
    expect(container.querySelector("output")?.textContent).toBe("1 unread");
  });
  it("removes only selected messages and updates the unread count", async () => {
    await openNotifications(3);
    await act(async () => rows()[0].querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    await act(async () => rows()[2].querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    expect(container.textContent).toContain("2 selected");
    await click("Mark as read");
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("CV update 2");
    expect(container.querySelector("output")?.textContent).toBe("1 unread");
    expect(button("Mark as read").disabled).toBe(true);
  });
  it("selects and deselects all messages and returns to the empty state after marking all read", async () => {
    await openNotifications(2);
    await click("Select all");
    expect(container.textContent).toContain("2 selected");
    await click("Deselect all");
    expect(button("Mark as read").disabled).toBe(true);
    await click("Select all");
    await click("Mark as read");
    expect(rows()).toHaveLength(0);
    expect(container.textContent).toContain("You're all caught up");
    expect(container.querySelector("output")?.textContent).toBe("0 unread");
    expect(document.activeElement).toBe(container.querySelector("h1"));
  });
  it("leaves messages that arrive after Select all unselected", async () => {
    await openNotifications(2);
    await click("Select all");
    await click("Publish CV");
    expect(rows()[0].querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("2 selected");
    await click("Mark as read");
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("CV update 3");
  });
  it("starts with no messages when the verified member changes", async () => {
    await render();
    await click("Publish CV");
    await render("member-two");
    expect(container.querySelector("output")?.textContent).toBe("0 unread");
    await act(async () => router.navigate("/notifications"));
    expect(rows()).toHaveLength(0);
    expect(container.textContent).toContain("You're all caught up");
  });
  it("updates recurring status notifications and keeps recovery actions in the popup and feed", async () => {
    await render();
    await click("Warn");
    expect(container.querySelector('[data-sonner-toast]')?.getAttribute("data-type")).toBe("warning");
    await click("Fail");
    expect(container.querySelector("output")?.textContent).toBe("1 unread");
    const popup = container.querySelector('[data-sonner-toast][data-type="error"]');
    expect(popup?.textContent).toContain("Save failed");
    await act(async () => popup?.querySelector<HTMLButtonElement>('[data-button]')?.click());
    expect(retry).toHaveBeenCalledOnce();
    await act(async () => router.navigate("/notifications"));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Your input has been kept.");
    await act(async () => rows()[0].querySelector<HTMLButtonElement>('button:not([role="checkbox"])')?.click());
    expect(retry).toHaveBeenCalledTimes(2);
  });
});
