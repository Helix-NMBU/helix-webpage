// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberPlatform from "./MemberPlatform";
import { isMemberPlatform, memberPaths } from "./routes";
import { googleSignInRequest } from "../MemberCV/session";
import { memberLoginDestination } from "../MemberCV/repository";

const session = vi.hoisted(() => ({ landing: vi.fn(), signOut: vi.fn() }));
vi.mock("../MemberCV/session", async (original) => ({
  ...await original<typeof import("../MemberCV/session")>(),
  authClient: {},
  memberAuthConfigured: true,
  ensureMemberLanding: session.landing,
  watchMemberSession: () => () => undefined,
  signOutMember: session.signOut,
}));
vi.mock("../MemberCV/MemberCV", () => ({ default: () => <p>Private CV editor</p> }));

const signedOut = { phase: "signed-out", token: null, userId: null, status: 401, error: null };
const signedIn = { phase: "signed-in", token: "test-token", userId: "member", status: 200, error: null };

describe("internal member platform", () => {
  let container: HTMLDivElement;
  let root: Root;
  let router: ReturnType<typeof createMemoryRouter>;
  beforeEach(() => {
    vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
    session.landing.mockReset().mockResolvedValue(signedOut);
    session.signOut.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllEnvs();
  });
  async function open(path: string) {
    router = createMemoryRouter([{ path: "*", element: <MemberPlatform /> }], { initialEntries: [path] });
    await act(async () => root.render(<RouterProvider router={router} />));
  }

  it.each(["/", "/profile", "/garage"])("sends signed-out visitors at %s to /login without rendering private content", async (path) => {
    await open(path);
    expect(router.state.location.pathname).toBe("/login");
    expect(container.textContent).toContain("Log in to your account");
    expect(container.textContent).not.toContain("Private CV editor");
    expect(container.textContent).not.toContain("Open profile and CV");
    expect(container.querySelector('a[href="https://helixnmbu.no"]')).toBeNull();
  });

  it("keeps the root private until membership verification completes", async () => {
    let release!: (landing: typeof signedIn) => void;
    session.landing.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await open("/");
    expect(container.textContent).not.toContain("Open profile and CV");
    await act(async () => release(signedIn));
    expect(container.textContent).toContain("Open profile and CV");
    expect(router.state.location.pathname).toBe("/");
  });

  it("returns signed-in visitors from /login to / and supports sign-out", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/login");
    expect(router.state.location.pathname).toBe("/");
    session.landing.mockResolvedValue(signedOut);
    await act(async () => container.querySelector("button")?.click());
    expect(session.signOut).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/login");
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
    expect(container.textContent).not.toContain("Open profile and CV");
    session.landing.mockResolvedValue(signedIn);
    await act(async () => container.querySelector("button")?.click());
    expect(container.textContent).toContain("Open profile and CV");
  });

  it("changes only the internal host and rejects unsafe internal return URLs", () => {
    const origin = "https://internal.helixnmbu.no";
    expect(isMemberPlatform(origin)).toBe(true);
    expect(isMemberPlatform("https://helixnmbu.no")).toBe(false);
    expect(isMemberPlatform("https://www.helixnmbu.no")).toBe(false);
    expect(isMemberPlatform("https://internal.helixnmbu.no.evil.invalid")).toBe(false);
    expect(memberPaths(origin)).toEqual({ home: "/", login: "/login", profile: "/profile" });
    expect(googleSignInRequest(undefined, origin)).toEqual({ provider: "google", callbackURL: `${origin}/`, errorCallbackURL: `${origin}/login` });
    expect(googleSignInRequest("/member/profile?tab=cv", origin).callbackURL).toBe(`${origin}/profile?tab=cv`);
    for (const value of ["//evil.invalid", "https://evil.invalid", "/login", "/garage", "/\\evil.invalid"]) {
      expect(googleSignInRequest(value, origin).callbackURL).toBe(`${origin}/`);
      expect(memberLoginDestination({ from: value })).toBe("/");
    }
    expect(memberLoginDestination({ from: "/profile" })).toBe("/profile");
  });
});
