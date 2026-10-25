// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberPlatform from "./MemberPlatform";
import { isMemberPlatform, memberPaths } from "./routes";
import { googleSignInRequest } from "../MemberCV/session";
import { memberLoginDestination } from "../MemberCV/repository";
import { useMemberNavigation } from "./MemberNavigation";

const session = vi.hoisted(() => ({ landing: vi.fn(), signOut: vi.fn(), editorNavigate: vi.fn(), editorSignOut: vi.fn() }));
vi.mock("../MemberCV/session", async (original) => ({
  ...await original<typeof import("../MemberCV/session")>(),
  authClient: {},
  memberAuthConfigured: true,
  ensureMemberLanding: session.landing,
  watchMemberSession: () => () => undefined,
  signOutMember: session.signOut,
}));
vi.mock("../MemberCV/MemberCV", () => ({ default: function Editor() {
  const setEditor = useMemberNavigation()?.setEditor;
  useLayoutEffect(() => {
    setEditor?.({ busy: false, navigate: session.editorNavigate, signOut: session.editorSignOut });
    return () => setEditor?.(null);
  }, [setEditor]);
  return <p>Private CV editor</p>;
} }));

const signedOut = { phase: "signed-out", token: null, userId: null, status: 401, error: null };
const signedIn = { phase: "signed-in", token: "test-token", userId: "member", status: 200, error: null, account: { name: "Henrik Engdal", email: "henrik.engdal@helixnmbu.no", role: "Admin" } };

describe("internal member platform", () => {
  let container: HTMLDivElement;
  let root: Root;
  let router: ReturnType<typeof createMemoryRouter>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.removeItem("helix-member-theme");
    vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
    session.landing.mockReset().mockResolvedValue(signedOut);
    session.signOut.mockReset().mockResolvedValue(undefined);
    session.editorNavigate.mockReset();
    session.editorSignOut.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  async function open(path: string) {
    router = createMemoryRouter([{ path: "*", element: <MemberPlatform /> }], { initialEntries: [path] });
    await act(async () => root.render(<RouterProvider router={router} />));
  }
  async function profileMenu() {
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Profile menu"]')?.click());
  }

  it.each([
    { name: "Henrik Engdal", email: "henrik.engdal@helixnmbu.no", role: "Admin" },
    { name: "Åse Hansen", email: "ase@helixnmbu.no", role: "Member" },
  ])("shows the signed-in account $name and its role", async (account) => {
    session.landing.mockResolvedValue({ ...signedIn, account });
    await open("/");
    const trigger = container.querySelector('[aria-label="Profile menu"]');
    expect(trigger?.textContent).toContain(account.name);
    expect(trigger?.textContent).toContain(account.role);
    expect(trigger?.textContent).not.toContain("Member account");
    await profileMenu();
    const menu = document.querySelector('[aria-label="Account menu"]');
    expect(menu?.textContent).toContain(account.name);
    expect(menu?.textContent).toContain(account.role);
  });

  it.each(["/", "/settings", "/teams/business-marketing/campaigns"])("removes preview notices from %s", async (path) => {
    session.landing.mockResolvedValue(signedIn);
    await open(path);
    expect(container.textContent).not.toMatch(/\bpreview\b|\bmockup\b|\bfictional\b|\bexample mode\b|added later/i);
    if (path === "/settings") {
      expect(container.querySelector('[aria-labelledby="member-settings-title"]')?.textContent).not.toContain("Admin");
    }
  });

  it.each(["/", "/profile", "/settings", "/notifications", "/mail", "/teams/finance/budget", "/garage"])("sends signed-out visitors at %s to /login without rendering private content", async (path) => {
    await open(path);
    expect(router.state.location.pathname).toBe("/login");
    expect(container.textContent).toContain("Log in to your account");
    expect(container.textContent).not.toContain("Private CV editor");
    expect(container.textContent).not.toContain("What are we working on?");
    expect(container.querySelector('a[href="https://helixnmbu.no"]')).toBeNull();
  });

  it("opens Notifications from below Home and shows an honest empty state", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/");
    const home = container.querySelector('[aria-label="Home"]')!;
    const notifications = container.querySelector<HTMLButtonElement>('[aria-label="Notifications"]')!;
    expect(home.compareDocumentPosition(notifications) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => notifications.click());
    expect(router.state.location.pathname).toBe("/notifications");
    expect(container.textContent).toContain("You're all caught up");
    expect(container.querySelector("h1")?.textContent).toBe("Notifications");
  });

  it("keeps the root private until membership verification completes", async () => {
    let release!: (landing: typeof signedIn) => void;
    session.landing.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await open("/");
    expect(container.textContent).not.toContain("What are we working on?");
    await act(async () => release(signedIn));
    expect(container.textContent).toContain("What are we working on?");
    expect(router.state.location.pathname).toBe("/");
  });

  it("returns signed-in visitors from /login to / and supports sign-out", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/login");
    expect(router.state.location.pathname).toBe("/");
    session.landing.mockResolvedValue(signedOut);
    await profileMenu();
    const signOut = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent?.includes("Sign out"));
    await act(async () => signOut?.click());
    expect(session.signOut).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("changes and remembers appearance from the profile menu", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/");
    await profileMenu();
    const appearance = document.querySelector('[role="combobox"][aria-label="Appearance"]');
    await act(async () => appearance?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })));
    const dark = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent?.includes("Dark"));
    expect(dark).toBeDefined();
    await act(async () => dark?.click());
    expect(document.documentElement.dataset.memberTheme).toBe("dark");
    expect(window.localStorage.getItem("helix-member-theme")).toBe("dark");
    await act(async () => router.navigate("/profile"));
    expect(document.documentElement.dataset.memberTheme).toBe("dark");
    expect(container.querySelector('[aria-label="Profile menu"]')).not.toBeNull();
  });

  it("lets the editor save or confirm unsaved changes before sidebar navigation or sign-out", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/profile");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Home"]')?.click());
    expect(session.editorNavigate).toHaveBeenCalledWith("/", expect.any(HTMLButtonElement));
    expect(router.state.location.pathname).toBe("/profile");
    await profileMenu();
    const signOut = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent?.includes("Sign out"));
    await act(async () => signOut?.click());
    expect(session.editorSignOut).toHaveBeenCalledOnce();
    expect(session.signOut).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/profile");
  });

  it("keeps profile and CV access in the account panel and guards Settings navigation from the editor", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/");
    expect(container.textContent).toContain("Business & Marketing");
    expect(container.textContent).toContain("Finance");
    expect(container.textContent).toContain("Mechanical & Production");
    expect(container.querySelector('a[href^="/profile"]')).toBeNull();
    expect(container.querySelector('[aria-label="Profile"]')).toBeNull();
    await profileMenu();
    const profile = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent === "Profile");
    expect(profile).toBeDefined();
    await act(async () => profile?.click());
    expect(router.state.location.pathname).toBe("/profile");
    expect(container.textContent).toContain("Private CV editor");
    await profileMenu();
    const settings = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent === "Settings");
    await act(async () => settings?.click());
    expect(session.editorNavigate).toHaveBeenCalledWith("/settings", expect.any(HTMLButtonElement));
    expect(router.state.location.pathname).toBe("/profile");
  });

  it("sends the Helix suggestion as the message in one click", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/");
    const prompt = "Draft a Helix sponsor update";
    const suggestion = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === prompt);
    expect(suggestion).toBeDefined();
    await act(async () => suggestion?.click());
    const reply = container.querySelector('[aria-live="polite"]');
    expect(reply?.firstElementChild?.textContent).toBe(prompt);
    expect(reply?.textContent).toContain("Helix assistant");
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Ask Helix"]')?.value).toBe("");
  });

  it("preserves the one-time verifier when redirecting old profile links", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/member/profile?neon_auth_session_verifier=test#contact");
    expect(router.state.location.pathname).toBe("/profile");
    expect(router.state.location.search).toBe("?neon_auth_session_verifier=test");
    expect(router.state.location.hash).toBe("#contact");
    expect(container.textContent).toContain("Private CV editor");
  });

  it.each(["unavailable", "rejected"])("shows a retry and keeps private content hidden when verification is %s", async (failure) => {
    if (failure === "rejected") session.landing.mockRejectedValue(new Error("network failure"));
    else session.landing.mockResolvedValue({ ...signedOut, phase: "unavailable", status: 503 });
    await open("/");
    expect(router.state.location.pathname).toBe("/");
    expect(container.textContent).toContain("Try again");
    expect(container.textContent).not.toContain("What are we working on?");
    session.landing.mockResolvedValue(signedIn);
    await act(async () => container.querySelector("button")?.click());
    expect(container.textContent).toContain("What are we working on?");
  });

  it("changes only the internal host and rejects unsafe internal return URLs", () => {
    const origin = "https://internal.helixnmbu.no";
    expect(isMemberPlatform(origin)).toBe(true);
    expect(isMemberPlatform("https://helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app")).toBe(true);
    expect(isMemberPlatform("https://helixnmbu.no")).toBe(false);
    expect(isMemberPlatform("https://www.helixnmbu.no")).toBe(false);
    expect(isMemberPlatform("https://internal.helixnmbu.no.evil.invalid")).toBe(false);
    expect(memberPaths(origin)).toEqual({ home: "/", login: "/login", profile: "/profile" });
    expect(googleSignInRequest(undefined, origin)).toEqual({ provider: "google", callbackURL: `${origin}/`, errorCallbackURL: `${origin}/login`, additionalParams: { prompt: "select_account" } });
    expect(googleSignInRequest("/member/profile?tab=cv", origin).callbackURL).toBe(`${origin}/profile?tab=cv`);
    for (const value of ["//evil.invalid", "https://evil.invalid", "/login", "/garage", "/\\evil.invalid"]) {
      expect(googleSignInRequest(value, origin).callbackURL).toBe(`${origin}/`);
      expect(memberLoginDestination({ from: value })).toBe("/");
    }
    expect(memberLoginDestination({ from: "/profile" })).toBe("/profile");
  });
  it("uses notifications for unavailable connections across the app", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/settings");
    expect(container.querySelector('[data-sonner-toaster]')!.closest(".member-platform")).not.toBeNull();
    const connect = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Connect ChatGPT")!;
    await act(async () => {
      connect.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-sonner-toast][data-type="info"]')?.textContent).toContain("Connection unavailable");
    await act(async () => router.navigate("/notifications"));
    expect(container.querySelector("article")?.textContent).toContain("ChatGPT connections are currently unavailable.");
  });
});
