// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberThemeProvider } from "./MemberTheme";
import { MemberNotificationsPage, MemberNotificationsProvider, useMemberNotifications } from "./MemberNotifications";

function SendNotification() {
  const notifications = useMemberNotifications();
  return <><button onClick={() => notifications?.notify("CV visible in Talent Directory", "Sponsors can see your published CV.")}>Publish CV</button><output>{notifications?.unread} unread</output></>;
}

describe("member notifications", () => {
  let root: Root;
  let container: HTMLDivElement;
  let router: ReturnType<typeof createMemoryRouter>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    router = createMemoryRouter([{ path: "/", element: <SendNotification /> }, { path: "/notifications", element: <MemberNotificationsPage /> }]);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function render(member = "member-one") {
    await act(async () => root.render(<MemberThemeProvider><MemberNotificationsProvider key={member}><RouterProvider router={router} /></MemberNotificationsProvider></MemberThemeProvider>));
  }
  it("keeps real messages across navigation, marks them read, and positions the popup at the top right", async () => {
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(container.querySelector("output")?.textContent).toBe("1 unread");
    expect(container.querySelector('[data-sonner-toaster]')?.getAttribute("data-x-position")).toBe("right");
    expect(container.querySelector('[data-sonner-toaster]')?.getAttribute("data-y-position")).toBe("top");
    await act(async () => router.navigate("/notifications"));
    expect(container.querySelector("article")?.textContent).toContain("CV visible in Talent Directory");
    await act(async () => router.navigate("/"));
    expect(container.querySelector("output")?.textContent).toBe("0 unread");
  });
  it("starts with no messages when the verified member changes", async () => {
    await render();
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    await render("member-two");
    expect(container.querySelector("output")?.textContent).toBe("0 unread");
    await act(async () => router.navigate("/notifications"));
    expect(container.querySelector("article")).toBeNull();
    expect(container.textContent).toContain("You're all caught up");
  });
});
