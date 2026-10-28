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
import type { WorkspaceMember } from "../Workspace/types";

const recruitment = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), positions: vi.fn() }));
vi.mock("../Recruitment/website-api", async original => ({ ...await original<typeof import("../Recruitment/website-api")>(), createRecruitmentApi: () => recruitment }));
import { RecruitmentRequestError } from "../Recruitment/website-api";

const session = vi.hoisted(() => ({ landing: vi.fn(), signOut: vi.fn(), editorNavigate: vi.fn(), editorSignOut: vi.fn() }));
vi.mock("../MemberCV/session", async (original) => ({
  ...await original<typeof import("../MemberCV/session")>(),
  authClient: {},
  memberAuthConfigured: true,
  memberSessionToken: async () => "test-session-token",
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

const memberCapabilities = {
  publicBudgets: true, publicEarmarks: true, registerActual: true, ownRequests: true,
  financing: false, manageFunding: false, purchaseRegister: false, filesAndRefunds: false, paymentsVoidReview: false,
  draftBudgetItems: false, permittedImports: false, createBudget: false, approveBudget: false, protectedBudgetEdits: false, decideRequests: false,
};
let financialsAllowed = true;
function financeResponse(url: string): Response {
  const action = new URL(url, "https://member.example").searchParams.get("action");
  if (!financialsAllowed) return { ok: false, status: 403, json: async () => ({ error: "Financials access is required." }) } as unknown as Response;
  if (action === "financing") return { ok: false, status: 403, json: async () => ({ error: "Financing access is required." }) } as unknown as Response;
  const body = action === "capabilities"
    ? { memberId: "member", viewVersion: 0, profiles: [], capabilities: memberCapabilities, seasonCode: null, approvalThresholdNok: null, today: "2026-10-26" }
    : action === "overview"
      ? { viewVersion: 0, seasonCode: null, budgetStatus: "absent", approvedOn: null, departments: [], publicEarmarks: [] }
      : action === "budgets"
        ? { viewVersion: 0, seasonCode: null, budgetStatus: "absent", departments: [] }
        : action === "purchases"
          ? { viewVersion: 0, ownRequests: [] }
          : {};
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
const signedOut = { phase: "signed-out", token: null, userId: null, status: 401, error: null };
const signedIn = { phase: "signed-in", token: "test-token", userId: "member", status: 200, error: null, account: { name: "Henrik Engdal", email: "henrik.engdal@helixnmbu.no", role: "Admin" } };
let selfAccess = {
  memberId: "member", email: signedIn.account.email, name: signedIn.account.name, departmentId: "finance",
  roles: [], features: ["team.business-marketing", "team.finance", "team.mechanical-production", "recruitment.manage", "member_access.manage"],
};
const departmentDirectory = ["Business & Marketing", "Finance", "Mechanical & Production"].map((name, index) => ({
  id: `department-${index}`, name, season: "S27", revision: 1, leadId: null, memberIds: ["member"],
}));
const workspaceDirectory = {
  viewerId: "member", canAdmin: false, projectAccess: true, canManageProjects: false,
  members: [] as WorkspaceMember[], projects: [],
  departments: [...departmentDirectory],
};

describe("internal member platform", () => {
  let container: HTMLDivElement;
  let root: Root;
  let router: ReturnType<typeof createMemoryRouter>;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.removeItem("helix-member-theme");
    vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
    recruitment.session.mockReset().mockRejectedValue(new RecruitmentRequestError("Recruiter access required", 403));
    recruitment.list.mockReset().mockResolvedValue([]);
    recruitment.positions.mockReset().mockResolvedValue([]);
    session.landing.mockReset().mockResolvedValue(signedOut);
    session.signOut.mockReset().mockResolvedValue(undefined);
    session.editorNavigate.mockReset();
    session.editorSignOut.mockReset();
    selfAccess = {
      memberId: "member", email: signedIn.account.email, name: signedIn.account.name, departmentId: "finance",
      roles: [], features: ["team.business-marketing", "team.finance", "team.mechanical-production", "recruitment.manage", "member_access.manage"],
    };
    workspaceDirectory.departments = [...departmentDirectory];
    financialsAllowed = true;
    workspaceDirectory.members = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/finance")) return financeResponse(url);
      const body = url.startsWith("/api/member-access?action=self") ? selfAccess : url === "/api/member-login?__module=workspace" ? workspaceDirectory : url === "/api/gmail-status" ? { connected: false } : {};
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }));
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

  it("redirects old access links to Members and removes the separate sidebar entry", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/admin/access");
    expect(router.state.location.pathname).toBe("/members");
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Members"));
    expect(container.querySelector('[aria-label="Member access"]')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("action=members"))).toBe(false);
  });

  it("retains the workspace directory across navigation", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/members");
    await act(async () => router.navigate("/departments"));
    await act(async () => router.navigate("/members"));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/member-login?__module=workspace")).toHaveLength(1);
    await act(async () => window.dispatchEvent(new Event("helix-workspace-updated")));
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/member-login?__module=workspace")).toHaveLength(2);
  });

  it("lets a granted platform administrator edit access from an icon in Members", async () => {
    session.landing.mockResolvedValue(signedIn);
    workspaceDirectory.members = [{ id: "other", name: "Other Member", helixRole: null, role: "Member", joinedAt: null, lastSeenAt: null, revision: 1 }];
    const request = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/member-access?action=members") return new Response(JSON.stringify({
        departments: [{ id: "finance", name: "Finance" }],
        roles: [{ key: "team_member", label: "Team Member" }, { key: "platform_administrator", label: "Platform administrator" }],
        members: [{ id: "other", name: "Other Member", email: "other@example.test", departmentId: "finance", roleKeys: ["team_member"], spaceKeys: [] }],
      }));
      if (String(input) === "/api/member-access" && init?.method === "POST") return new Response(JSON.stringify({ saved: true }));
      return request(input, init);
    });
    await open("/members");
    const edit = container.querySelector<HTMLButtonElement>('[aria-label="Edit Other Member"]')!;
    expect(edit.querySelector("svg")).not.toBeNull();
    expect(edit.textContent).toBe("");
    await act(async () => edit.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Department access");
    expect(dialog.textContent).toContain("Space access");
    for (const space of ["Season Overview", "Recruiting", "Financials"]) expect(dialog.textContent).toContain(space);
    expect(dialog.textContent).not.toContain("Assigned Helix Position");
    const adminLabel = [...dialog.querySelectorAll("label")].find(label => label.textContent === "Financials")!;
    await act(async () => adminLabel.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/member-access", expect.objectContaining({
      method: "POST", body: JSON.stringify({ action: "save_workspace_access", memberId: "other", expectedRevision: 1, departments: departmentDirectory.map(d => ({ id: d.id, revision: d.revision, member: false, lead: false, access: null })), spaceKeys: ["financials"] }),
    }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("hides member editing from members without an administrator grant", async () => {
    session.landing.mockResolvedValue(signedIn);
    selfAccess = { ...selfAccess, features: [] };
    workspaceDirectory.members = [{ id: "other", name: "Other Member", helixRole: null, role: "Member", joinedAt: null, lastSeenAt: null, revision: 1 }];
    await open("/members");
    expect(container.textContent).toContain("Other Member");
    expect(container.querySelector('[aria-label="Edit Other Member"]')).toBeNull();
  });

  it.each([
    { name: "Henrik Engdal", email: "henrik.engdal@helixnmbu.no", role: "Admin" },
    { name: "Åse Hansen", email: "ase@helixnmbu.no", role: "Member" },
  ])("shows the signed-in account $name and its role in the sidebar", async (account) => {
    session.landing.mockResolvedValue({ ...signedIn, account });
    await open("/");
    const trigger = container.querySelector('[aria-label="Profile menu"]');
    expect(trigger?.textContent).toContain(account.name);
    expect(trigger?.textContent).toContain(account.role);
    expect(trigger?.textContent).not.toContain("Member account");
    await profileMenu();
    const menu = document.querySelector('[aria-label="Account menu"]');
    expect(menu?.textContent).not.toContain(account.name);
    expect(menu?.textContent).not.toContain(account.role);
  });

  it.each(["/", "/settings", "/teams/business-marketing/campaigns"])("removes preview notices from %s", async (path) => {
    session.landing.mockResolvedValue(signedIn);
    await open(path);
    expect(container.textContent).not.toMatch(/\bpreview\b|\bmockup\b|\bfictional\b|\bexample mode\b|added later/i);
    if (path === "/settings") {
      expect(container.querySelector('[aria-labelledby="member-settings-title"]')?.textContent).not.toMatch(/\bAdmin\b/);
    }
  });

  it.each(["/", "/profile", "/settings", "/notifications", "/mail", "/recruiting", "/admin/access", "/teams/finance/budget", "/garage"])("sends signed-out visitors at %s to /login without rendering private content", async (path) => {
    await open(path);
    expect(router.state.location.pathname).toBe("/login");
    expect(container.textContent).toContain("Log in to your account");
    expect(container.textContent).not.toContain("Private CV editor");
    expect(container.textContent).not.toContain("What are we working on?");
    expect(container.querySelector('a[href="https://helixnmbu.no"]')).toBeNull();
  });

  it("hides Recruiting and denies direct links to ordinary members", async () => {
    session.landing.mockResolvedValue({ ...signedIn, account: { ...signedIn.account, role: "Member" } });
    await open("/recruitment");
    expect(router.state.location.pathname).toBe("/");
    expect(container.querySelector('[aria-label="Recruiting"]')).toBeNull();
    expect(recruitment.list).not.toHaveBeenCalled();
  });

  it("shows only the assigned department team and blocks direct access to another team", async () => {
    session.landing.mockResolvedValue(signedIn);
    selfAccess = { ...selfAccess, features: ["team.finance"] };
    workspaceDirectory.departments = departmentDirectory.filter(department => department.name === "Finance");
    await open("/");
    expect(container.textContent).toContain("Finance");
    expect(container.textContent).not.toContain("Business & Marketing");
    expect(container.textContent).not.toContain("Financing");
    await act(async () => router.navigate("/teams/business-marketing/campaigns"));
    expect(router.state.location.pathname).toBe("/");
    expect(container.textContent).not.toContain("Partner Spotlight");
  });

  it.each([
    { department: true, financials: true },
    { department: true, financials: false },
    { department: false, financials: true },
    { department: false, financials: false },
  ])("shows Finance and Financials in Your spaces according to independent access: $department / $financials", async ({ department, financials }) => {
    session.landing.mockResolvedValue(signedIn);
    workspaceDirectory.departments = department ? departmentDirectory.filter((item) => item.name === "Finance") : [];
    financialsAllowed = financials;
    await open("/");
    const group = [...container.querySelectorAll('[data-sidebar="group"]')].find((item) => item.querySelector('[data-sidebar="group-label"]')?.textContent === "Your spaces");
    expect(group).toBeTruthy();
    const names = [...group!.querySelectorAll("button")].map((button) => button.textContent?.trim());
    expect(names.includes("Finance")).toBe(department);
    expect(names.includes("Financials")).toBe(financials);
  });

  it("redirects legacy recruitment links to the Recruiting route", async () => {
    session.landing.mockResolvedValue(signedIn);
    recruitment.session.mockResolvedValue({ email: signedIn.account.email });
    await open("/recruitment?season=S27#applications");
    expect(router.state.location.pathname).toBe("/recruiting");
    expect(router.state.location.search).toBe("?season=S27");
    expect(router.state.location.hash).toBe("#applications");
  });

  it.each(["Admin", "Member"])("uses the server grant for %s and opens recruitment in the member shell", async role => {
    session.landing.mockResolvedValue({ ...signedIn, account: { ...signedIn.account, role } });
    recruitment.session.mockResolvedValue({ email: signedIn.account.email });
    await open("/");
    const link = container.querySelector<HTMLButtonElement>('[aria-label="Recruiting"]');
    expect(link).not.toBeNull();
    await act(async () => link!.click());
    expect(router.state.location.pathname).toBe("/recruiting");
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Applications"));
    expect(container.querySelector('[aria-label="Profile menu"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Recruiter sign in");
  });

  it("preloads once at login and retains data and access across navigation and focus", async () => {
    session.landing.mockResolvedValue(signedIn);
    recruitment.session.mockResolvedValue({ email: signedIn.account.email });
    recruitment.list.mockResolvedValue([{ id: "app", created_at: "2026-10-26", season: "S27", full_name: "Applicant One", email: "one@example.test", position_title: "Engineer", study_program: "Robotics" }]);
    await open("/");
    expect(recruitment.list).toHaveBeenCalledOnce();
    expect(recruitment.positions).toHaveBeenCalledOnce();
    await act(async () => router.navigate("/recruiting"));
    await vi.waitFor(() => expect(container.textContent).toContain("Applicant One"));
    await act(async () => router.navigate("/profile"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => router.navigate("/recruiting"));
    expect(container.textContent).toContain("Applicant One");
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith("/api/member-access?action=self"))).toHaveLength(1);
    expect(recruitment.session).toHaveBeenCalledOnce();
    expect(recruitment.list).toHaveBeenCalledOnce();
    expect(recruitment.positions).toHaveBeenCalledOnce();
    recruitment.list.mockResolvedValue([]);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Refresh applications"]')?.click());
    expect(container.textContent).not.toContain("Applicant One");
    expect(recruitment.list).toHaveBeenCalledTimes(2);
    expect(recruitment.session).toHaveBeenCalledOnce();
  });

  it("clears private data and the sidebar grant when an operation is denied", async () => {
    session.landing.mockResolvedValue(signedIn);
    recruitment.session.mockResolvedValue({ email: signedIn.account.email });
    await open("/recruiting");
    recruitment.list.mockRejectedValue(new RecruitmentRequestError("Revoked", 403));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Refresh applications"]')?.click());
    expect(router.state.location.pathname).toBe("/");
    expect(container.querySelector('[aria-label="Recruiting"]')).toBeNull();
    expect(container.textContent).not.toContain("Applications");
  });

  it("preserves recruitment as a safe member login destination", () => {
    expect(memberLoginDestination({ from: "/recruiting" })).toBe("/recruiting");
    expect(googleSignInRequest("/recruiting", "https://internal.helixnmbu.no").callbackURL).toBe("https://internal.helixnmbu.no/recruiting");
  });

  it("opens financial pages for an authorized member and keeps financing capability checks", async () => {
    session.landing.mockResolvedValue(signedIn);
    selfAccess = { ...selfAccess, features: ["*"] };
    await open("/");
    expect(container.querySelector('a[href="/finance/budgets"]')).not.toBeNull();
    expect(container.querySelector('a[href="/finance/purchases"]')).not.toBeNull();
    expect(container.querySelector('a[href="/finance/financing"]')).toBeNull();
    expect(container.textContent).not.toContain("Expenses");
    await act(async () => router.navigate("/finance/financing"));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/finance"));
    await vi.waitFor(() => expect(container.textContent).toContain("No season is configured yet"));
    expect(container.textContent).not.toContain("Hidden Supplier");
    await act(async () => router.navigate("/teams/finance/budget?season=S27#items"));
    expect(router.state.location.pathname).toBe("/finance/budgets");
    expect(router.state.location.search).toBe("?season=S27");
    expect(router.state.location.hash).toBe("#items");
    await act(async () => router.navigate("/teams/finance/expenses?view=open#claims"));
    expect(router.state.location.pathname).toBe("/finance/purchases");
    expect(router.state.location.search).toBe("?view=open");
    expect(router.state.location.hash).toBe("#claims");
  });

  it("preserves finance pages as member login destinations", () => {
    const origin = "https://internal.helixnmbu.no";
    expect(memberLoginDestination({ from: "/finance/budgets?season=S27#items" })).toBe("/finance/budgets?season=S27#items");
    expect(memberLoginDestination({ from: "/teams/finance/expenses?legacy=1#claims" })).toBe("/finance/purchases?legacy=1#claims");
    expect(googleSignInRequest("/finance/purchases", origin).callbackURL).toBe(`${origin}/finance/purchases`);
    expect(googleSignInRequest("/teams/finance/budget", origin).callbackURL).toBe(`${origin}/teams/finance/budget`);
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
    const appearance = [...document.querySelectorAll<HTMLButtonElement>('[aria-labelledby="member-appearance-label member-appearance-value"]')][0];
    await act(async () => appearance?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })));
    const dark = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(item => item.textContent?.includes("Dark"));
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
