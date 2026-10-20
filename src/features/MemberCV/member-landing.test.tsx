// @vitest-environment happy-dom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CVBankLogin from "../CVBank/Login";
import { MemberNavProvider } from "@libs/components/navbar/member-nav";
import MemberCV from "./MemberCV";
import { clearMemberLanding, memberAuthConfigured } from "./session";

const auth = vi.hoisted(() => {
  vi.stubEnv("VITE_NEON_AUTH_URL", "/api/auth");
  return {
    getSession: vi.fn(),
    token: vi.fn(),
    signOut: vi.fn(async () => ({})),
    social: vi.fn(),
  };
});

vi.mock("@neondatabase/neon-js/auth", () => ({
  createAuthClient: () => ({
    getSession: auth.getSession,
    token: auth.token,
    signOut: auth.signOut,
    signIn: { social: auth.social },
  }),
}));

vi.mock("@neondatabase/neon-js/auth/vanilla/adapters", () => ({
  BetterAuthVanillaAdapter: () => ({}),
}));

const routers: { current: ReturnType<typeof createMemoryRouter> | null } = { current: null };

function Shell({ entry }: { entry: string }) {
  const [router] = useState(() => {
    const created = createMemoryRouter(
      [
        { path: "/member/login", element: <CVBankLogin /> },
        { path: "/member/profile", element: <MemberCV /> },
      ],
      { initialEntries: [entry] },
    );
    routers.current = created;
    return created;
  });
  const [tick, setTick] = useState(0);
  return (
    <StrictMode>
      <MemberNavProvider>
        <button type="button" onClick={() => setTick((value) => value + 1)}>Rerender {tick}</button>
        <RouterProvider router={router} />
      </MemberNavProvider>
    </StrictMode>
  );
}

describe("member page landing", () => {
  let container: HTMLDivElement;
  let root: Root;
  let posts: number;
  let releaseSession: (value: { data: { user: { id: string } } }) => void;

  beforeEach(() => {
    clearMemberLanding();
    posts = 0;
    releaseSession = () => undefined;
    window.localStorage.setItem("helix-member-ui-language-v1", "en");
    auth.getSession.mockReset();
    auth.token.mockReset();
    auth.token.mockResolvedValue({ data: { token: "member-jwt" } });
    auth.getSession.mockImplementation(() => new Promise((resolve) => {
      releaseSession = resolve;
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/member-login") && (init?.method ?? "GET") === "POST") {
        posts += 1;
        return Response.json({ ok: true });
      }
      if (url.includes("/api/member-cv")) return new Promise(() => undefined);
      return new Response("unexpected", { status: 500 });
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    clearMemberLanding();
    vi.unstubAllGlobals();
  });

  it("claims the verifier before yielding and posts member login once across rerender, route changes and a full remount", async () => {
    expect(memberAuthConfigured).toBe(true);
    window.history.replaceState({}, "", "/member/profile?neon_auth_session_verifier=once");
    await act(async () => {
      root.render(<Shell entry="/member/profile?neon_auth_session_verifier=once" />);
    });

    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(window.location.search).not.toContain("neon_auth_session_verifier");
    expect(posts).toBe(0);
    expect(container.textContent).toContain("Verifying your Helix account…");
    expect(container.textContent).not.toContain("Sign in to build your CV");

    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(posts).toBe(0);

    await act(async () => {
      releaseSession({ data: { user: { id: "member" } } });
    });
    expect(posts).toBe(1);

    await act(async () => {
      await routers.current?.navigate("/member/login");
    });
    await act(async () => {
      await routers.current?.navigate("/member/profile");
    });
    expect(posts).toBe(1);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Sign in to build your CV");

    await act(async () => { root.unmount(); });
    window.history.replaceState({}, "", "/member/profile?neon_auth_session_verifier=again");
    root = createRoot(container);
    await act(async () => {
      root.render(<Shell entry="/member/profile?neon_auth_session_verifier=again" />);
    });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(posts).toBe(1);
    expect(container.textContent).not.toContain("Sign in to build your CV");
  });
});
