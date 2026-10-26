// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecruitmentAccessProvider, RecruitmentAccess } from "../MemberPlatform/RecruitmentAccess";
import RecruitmentPortal from "./RecruitmentPortal";

const mocks = vi.hoisted(() => ({ token: vi.fn(), landing: vi.fn(), social: vi.fn(), signOut: vi.fn(), watch: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => mocks.error }));
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: mocks.token, ensureMemberLanding: mocks.landing, authClient: { signIn: { social: mocks.social } },
  googleSignInRequest: () => ({ provider: "google", additionalParams: { prompt: "select_account" } }),
  signOutMember: mocks.signOut, watchMemberSession: mocks.watch,
}));

let root: Root; let container: HTMLDivElement; let router: ReturnType<typeof createMemoryRouter>;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset(); mocks.token.mockResolvedValue("member-jwt"); mocks.landing.mockResolvedValue({ phase: "signed-out" });
  mocks.watch.mockReturnValue(() => undefined); mocks.social.mockResolvedValue({});
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function open(path: string) {
  router = createMemoryRouter([
    { path: "/login", element: <p>Member sign in</p> }, { element: <RecruitmentAccessProvider userId="member"><Outlet /></RecruitmentAccessProvider>, children: [{ path: "/recruiting", element: <RecruitmentAccess><RecruitmentPortal /></RecruitmentAccess> }] },
    { path: "/", element: <p>Home</p> },
  ], { initialEntries: [path] });
  await act(async () => root.render(<RouterProvider router={router} />));
}
describe("recruitment Neon UI", () => {
  it("does not display private data when the server rejects an otherwise valid member JWT", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Your account does not have recruiter access." }), { status: 403 }));
    await open("/recruiting");
    expect(router.state.location.pathname).toBe("/");
    expect(container.textContent).not.toContain("Motivation");
    expect(mocks.error).toHaveBeenCalled();
  });
  it("fetches applications using a member bearer token and removes data when leaving the session", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("action=session") ? Response.json({ email: "member@helixnmbu.no" }) : url.includes("manage-positions") ? Response.json({ positions: [] }) : new Response(JSON.stringify({ applications: [{ id: "test", created_at: "2026-10-26", season: "S27", full_name: "Test Applicant", email: "test@example.test", position_title: "Software Engineer", study_program: "Robotics" }], nextOffset: null })));
    await open("/recruiting");
    expect(container.textContent).toContain("Test Applicant");
    expect(fetchMock).toHaveBeenCalledWith("/api/website?action=applications&offset=0", expect.objectContaining({ headers: { Authorization: "Bearer member-jwt" } }));
    await act(async () => router.navigate("/login"));
    expect(container.textContent).not.toContain("Test Applicant");
    expect(router.state.location.pathname).toBe("/login");
  });
  it("reports transient errors through notifications and keeps a retry control", async () => {
    fetchMock.mockImplementation(async (url: string) => url.includes("action=session") ? Response.json({ email: "member@helixnmbu.no" }) : Response.json({ error: "Temporarily unavailable" }, { status: 503 }));
    await open("/recruiting");
    expect(router.state.location.pathname).toBe("/recruiting");
    expect(mocks.error).toHaveBeenCalled();
    expect(container.textContent).not.toContain("Temporarily unavailable");
    const refresh = container.querySelector<HTMLButtonElement>('[aria-label="Refresh applications"]');
    expect(refresh?.disabled).toBe(false);
  });
});
