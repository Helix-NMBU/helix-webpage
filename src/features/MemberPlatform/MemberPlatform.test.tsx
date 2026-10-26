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

import { initialLocalWorkspace } from '../ProjectManagement/local-repository';
import { ProjectRequestError } from '../ProjectManagement/repository';
const projectTasks = vi.hoisted(() => ({load:vi.fn(),mutate:vi.fn()}));
vi.mock('../ProjectManagement/repository', async original => ({...await original<typeof import('../ProjectManagement/repository')>(),projectRepository:async()=>projectTasks}));
import { directoryFixture } from '../Workspace/fixtures.test-support';
const departmentHome = vi.hoisted(() => ({load:vi.fn(),save:vi.fn()}));
vi.mock('../Workspace/department-home-repository', async original => ({...await original<typeof import('../Workspace/department-home-repository')>(),departmentHomeRepository:async()=>departmentHome}));
const workspace = vi.hoisted(() => ({ load:vi.fn(),saveMember:vi.fn(),saveProject:vi.fn() }));
vi.mock('../Workspace/repository', async original => ({...await original<typeof import('../Workspace/repository')>(),workspaceRepository:async()=>workspace}));
const recruitment = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), positions: vi.fn() }));
vi.mock("../Recruitment/website-api", async original => ({ ...await original<typeof import("../Recruitment/website-api")>(), createRecruitmentApi: () => recruitment }));
import { RecruitmentRequestError } from "../Recruitment/website-api";

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
    projectTasks.load.mockReset().mockResolvedValue(initialLocalWorkspace());
    projectTasks.mutate.mockReset();
    departmentHome.load.mockReset().mockImplementation(async departmentId => ({departmentId,description:'',driveFolderUrl:null,revision:0,canEdit:true}));
    departmentHome.save.mockReset();
    workspace.load.mockReset().mockResolvedValue(directoryFixture());
    workspace.saveMember.mockReset();
    workspace.saveProject.mockReset();
    recruitment.session.mockReset().mockRejectedValue(new RecruitmentRequestError("Recruiter access required", 403));
    recruitment.list.mockReset().mockResolvedValue([]);
    recruitment.positions.mockReset().mockResolvedValue([]);
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
    expect(menu?.textContent).toContain("Profile");
    expect(menu?.textContent).toContain("Sign out");
  });

  it.each(["/", "/settings", "/teams/business-marketing/campaigns"])("removes preview notices from %s", async (path) => {
    session.landing.mockResolvedValue(signedIn);
    await open(path);
    expect(container.textContent).not.toMatch(/\bpreview\b|\bmockup\b|\bfictional\b|\bexample mode\b|added later/i);
    if (path === "/settings") {
      expect(container.querySelector('[aria-labelledby="member-settings-title"]')?.textContent).not.toContain("Admin");
    }
  });

  it.each(["/", "/profile", "/settings", "/notifications", "/mail", "/tasks", "/project-management/overview", "/recruiting", "/teams/finance/budget", "/garage"])("sends signed-out visitors at %s to /login without rendering private content", async (path) => {
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
    expect(container.querySelector("h1")?.textContent).toBe("Applications");
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
    expect(container.textContent).toContain("Applicant One");
    await act(async () => router.navigate("/profile"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => router.navigate("/recruiting"));
    expect(container.textContent).toContain("Applicant One");
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

  it.each(["/members", "/projects", "/departments/mechanical-and-production", "/tasks", "/project-management/overview", "/project-management/production?view=timeline#tasks", "/project-management/partnership-deliverables"])("preserves %s through both member login and Google callback", path => {
    expect(memberLoginDestination({ from: path })).toBe(path);
    expect(googleSignInRequest(path, "https://internal.helixnmbu.no").callbackURL).toBe(`https://internal.helixnmbu.no${path}`);
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
    const appearance = document.querySelector('button[aria-labelledby="member-appearance-label member-appearance-value"]');
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
    expect(container.textContent).toContain("Workspace");
    expect(container.textContent).toContain("Your spaces");
    expect(container.textContent).toContain("Project Overview");
    const mail = container.querySelector('[aria-label="Mail"]')!;
    const tasks = container.querySelector('[aria-label="Tasks"]')!;
    expect(mail.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.textContent).toContain("Mechanical & Production");
    expect(container.querySelector('[aria-label="Business & Marketing"]')).toBeNull();
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

  it("shows an unlabeled platform group, a collapsible Workspace, and only accessible spaces", async () => {
    session.landing.mockResolvedValue(signedIn);
    await open("/members");
    expect(container.querySelector('[data-sidebar="group-label"]')?.textContent).toBe("Workspace");
    expect(container.querySelector('[aria-label="Home"] svg')?.classList.contains('tabler-icon-smart-home')).toBe(true);
    expect(container.querySelector('[aria-label="Project Overview"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Mechanical & Production"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Electronics"]')).toBeNull();
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Toggle Workspace"]')?.click());
    expect(container.querySelector('button[aria-label="Members"]')).toBeNull();
    expect(container.querySelector('[aria-label="Mechanical & Production"]')).not.toBeNull();
  });

  it("lets ordinary members view members and all projects without editing controls", async () => {
    session.landing.mockResolvedValue(signedIn);
    const data=directoryFixture();data.canAdmin=false;data.canManageProjects=false;data.departments=data.departments.map(d=>({...d,leadId:null}));workspace.load.mockResolvedValue(data);
    await open('/members');
    expect(container.querySelector('h1')?.textContent).toBe('Members');
    expect(container.querySelector('table')?.textContent).toContain('Sam Example');
    expect(container.querySelector('[aria-label="Edit Sam Example"]')).toBeNull();
    expect(container.textContent).not.toContain('Invite');
    await act(async()=>router.navigate('/projects'));
    expect(container.querySelector('h1')?.textContent).toBe('Projects');
    expect(container.querySelector('table')?.textContent).toContain('Chassis & assembly');
    expect([...container.querySelectorAll('button')].some(b=>b.textContent==='New project')).toBe(false);
    expect(container.querySelector('table')?.textContent).toContain('Department');
    expect(container.querySelector('table')?.textContent).not.toContain('Health');
  });

  it.each(['manager','lead'])("lets a %s open the project creation form",async role=>{
    session.landing.mockResolvedValue(signedIn);
    const data=directoryFixture();data.canAdmin=false;data.canManageProjects=role==='manager';workspace.load.mockResolvedValue(data);
    await open('/projects');
    const create=[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='New project');
    expect(create).toBeDefined();await act(async()=>create!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('New project');
    expect(document.querySelector('#project-leads')).not.toBeNull();
    expect(document.querySelector('#project-priority')).not.toBeNull();
  });

  it("lists every department but only opens the viewer's departments",async()=>{
    session.landing.mockResolvedValue(signedIn);await open('/departments');
    const table=container.querySelector('table')!;
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
    expect(table.querySelector('tbody tr td')?.textContent).toBe('Mechanical & Production');
    expect(table.querySelectorAll('tbody tr')[2].textContent).toContain('Sam Example');
    expect([...table.querySelectorAll('button')].map(b=>b.textContent)).toEqual(['Mechanical & Production']);
    await act(async()=>[...table.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Mechanical & Production')!.click());
    expect(router.state.location.pathname).toBe('/departments/mechanical-and-production');
    expect(container.querySelector('h1')?.textContent).toBe('Mechanical & Production');
    await act(async()=>router.navigate('/departments/finance'));
    expect(router.state.location.pathname).toBe('/departments');
    expect(container.querySelector('h1')?.textContent).toBe('Departments');
  });


  it("opens the department workspace from both entry points and navigates its tabs", async()=>{
    session.landing.mockResolvedValue(signedIn);await open('/departments');
    await act(async()=>container.querySelector<HTMLButtonElement>('table button')!.click());
    expect(container.querySelector('h1')?.textContent).toBe('Mechanical & Production');
    expect(container.textContent).toContain('Department resources');
    expect([...container.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent)).toEqual(['Overview','Documents','Members']);
    await act(async()=>container.querySelector<HTMLButtonElement>('[role="tab"][data-state="inactive"]')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
    expect(router.state.location.search).toBe('?tab=documents');
    expect(container.textContent).toContain('Documents are stored in the department’s shared Google Drive folder.');
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab=>tab.textContent==='Members')!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
    expect(container.querySelector('table')?.textContent).toContain('Sam Example');
    expect(container.querySelector('table')?.textContent).toContain('Lead');
    await act(async()=>router.navigate('/members'));
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Mechanical & Production"]')!.click());
    expect(router.state.location.pathname).toBe('/departments/mechanical-and-production');
    expect(container.textContent).toContain('Department resources');
  });

  it("saves a Drive folder through department settings and shows it as a document resource",async()=>{
    session.landing.mockResolvedValue(signedIn);await open('/departments/mechanical-and-production');
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Department settings')!.click());
    const description=document.querySelector<HTMLTextAreaElement>('#department-description')!;
    const folder=document.querySelector<HTMLInputElement>('#department-drive-folder')!;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(description,'Design and build the S27 car.');description.dispatchEvent(new Event('input',{bubbles:true}));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(folder,'https://drive.google.com/drive/u/0/folders/shared-folder?usp=sharing');folder.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const id=directoryFixture().departments.find(d=>d.name==='Mechanical & Production')!.id;
    departmentHome.save.mockResolvedValue({departmentId:id,description:'Design and build the S27 car.',driveFolderUrl:'https://drive.google.com/drive/folders/shared-folder',revision:1,canEdit:true});
    await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(departmentHome.save).toHaveBeenCalledWith(expect.objectContaining({description:'Design and build the S27 car.',driveFolderUrl:'https://drive.google.com/drive/folders/shared-folder',expectedRevision:0}));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('a[href="https://drive.google.com/drive/folders/shared-folder"]')?.getAttribute('target')).toBe('_blank');
    expect(container.textContent).toContain('Design and build the S27 car.');
  });

  it("keeps department settings read-only for ordinary members and opens filtered projects",async()=>{
    session.landing.mockResolvedValue(signedIn);
    departmentHome.load.mockImplementation(async departmentId=>({departmentId,description:'Department description',driveFolderUrl:null,revision:0,canEdit:false}));
    await open('/departments/mechanical-and-production');
    expect([...container.querySelectorAll('button')].some(button=>button.textContent==='Department settings')).toBe(false);
    const quickLinks=container.querySelector('nav[aria-label="Department quick links"]')!;
    await act(async()=>[...quickLinks.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.startsWith('Projects'))!.click());
    expect(router.state.location.pathname).toBe('/projects');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('table')?.textContent).toContain('Chassis & assembly');
  });


  function detailFixture(){
    const data=initialLocalWorkspace();const milestone=data.tasks.find(t=>t.kind==='milestone'&&t.category==='production')!;const base=data.tasks.find(t=>t.kind==='task'&&t.category==='production')!;
    const id=(number:number)=>`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
    data.tasks.push({...milestone,id:id(40),title:'Manufacturing sign-off'}, {...base,id:id(41),title:'Verify dimensions',milestoneId:id(40),status:'todo',completedAt:null}, {...base,id:id(42),title:'Legacy inspection',milestoneId:null,status:'todo',completedAt:null}, {...milestone,id:id(50),title:'Planning review'});
    return data;
  }

  it("opens project tasks with Properties, Milestones and whole-project Progress",async()=>{
    session.landing.mockResolvedValue(signedIn);projectTasks.load.mockResolvedValue(detailFixture());await open('/projects');
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('table button')].find(b=>b.textContent==='Chassis & assembly')!.click());
    expect(router.state.location.pathname).toBe('/projects/00000000-0000-4000-8000-000000000100');
    const breadcrumb=container.querySelector('nav[aria-label="breadcrumb"]')!;
    expect(breadcrumb.textContent).toContain('Helix NMBU');expect(breadcrumb.textContent).toContain('Projects');expect(breadcrumb.querySelector('[aria-current="page"]')?.textContent).toBe('Chassis & assembly');
    expect(container.querySelector('[aria-label="Chassis & assembly project"] header')).toBeNull();
    const tasks=container.querySelector('[aria-label="Project tasks"]')!;
    expect(tasks.textContent).toContain('Complete chassis design review');expect(tasks.textContent).toContain('Verify dimensions');expect(tasks.textContent).not.toContain('Publish workshop update');
    const details=container.querySelector('[aria-label="Project details"]')!;
    expect(details.textContent).toContain('Properties');expect(details.textContent).toContain('Milestones');expect(details.textContent).toContain('Progress');
    expect(details.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('20');
    await act(async()=>[...breadcrumb.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Projects')!.click());
    expect(router.state.location.pathname).toBe('/projects');
  });

  it("toggles a milestone filter off on a second click and keeps progress scoped to the whole project",async()=>{
    session.landing.mockResolvedValue(signedIn);projectTasks.load.mockResolvedValue(detailFixture());await open('/projects/00000000-0000-4000-8000-000000000100');
    const milestone=container.querySelector<HTMLButtonElement>('[aria-label="Filter tasks by milestone Chassis ready for assembly"]')!;
    await act(async()=>milestone.click());
    const list=()=>container.querySelector('[aria-label="Project tasks"]')!;
    expect(milestone.getAttribute('aria-pressed')).toBe('true');expect(list().textContent).toContain('Confirm material delivery');expect(list().textContent).not.toContain('Verify dimensions');expect(list().textContent).not.toContain('Legacy inspection');
    expect(container.querySelector('[aria-label="Project details"] [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('20');
    await act(async()=>milestone.click());expect(milestone.getAttribute('aria-pressed')).toBe('false');expect(list().textContent).toContain('Verify dimensions');expect(list().textContent).toContain('Legacy inspection');expect(router.state.location.search).toBe('');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Filter tasks by milestone Manufacturing sign-off"]')!.click());expect(list().textContent).toContain('Verify dimensions');expect(list().textContent).not.toContain('Confirm material delivery');
    await act(async()=>[...list().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='New task')!.click());expect(document.querySelector('#new-task-milestone')?.textContent).toBe('Manufacturing sign-off');
    await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent?.startsWith('Cancel'))!.click());
    await act(async()=>[...list().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Clear milestone filter')!.click());expect(list().textContent).toContain('Confirm material delivery');
  });

  it("restores milestone filters from the URL and handles an empty milestone",async()=>{
    session.landing.mockResolvedValue(signedIn);projectTasks.load.mockResolvedValue(detailFixture());await open('/projects/00000000-0000-4000-8000-000000000100?milestone=00000000-0000-4000-8000-000000000040');
    expect(container.querySelector('[aria-label="Project tasks"]')?.textContent).toContain('Verify dimensions');expect(container.querySelector('[aria-label="Project tasks"]')?.textContent).not.toContain('Confirm material delivery');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Filter tasks by milestone Planning review"]')!.click());expect(container.querySelector('[aria-label="Project tasks"]')?.textContent).toContain('No matching tasks');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Filter tasks by milestone Planning review"]')!.click());expect(container.querySelector('[aria-label="Project tasks"]')?.textContent).toContain('Verify dimensions');
    const noMilestone=[...container.querySelectorAll<HTMLButtonElement>('[aria-label="Project details"] button')].find(b=>b.textContent?.startsWith('No milestone'))!;
    await act(async()=>noMilestone.click());expect(container.querySelector('[aria-label="Project tasks"]')?.textContent).toContain('Legacy inspection');expect(container.querySelector('[aria-label="Project tasks"]')?.textContent).not.toContain('Verify dimensions');
  });

  it("updates task completion, milestone progress and project progress together",async()=>{
    session.landing.mockResolvedValue(signedIn);const data=detailFixture();projectTasks.load.mockResolvedValue(data);
    await open('/projects/00000000-0000-4000-8000-000000000100?milestone=00000000-0000-4000-8000-000000000040');
    const next=structuredClone(data);const task=next.tasks.find(t=>t.title==='Verify dimensions')!;task.status='done';task.completedAt=new Date().toISOString();task.revision+=1;projectTasks.mutate.mockResolvedValue(next);
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Complete Verify dimensions"]')!.click());
    expect(projectTasks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'set_status',id:task.id,status:'done',expectedRevision:1}));
    expect(container.querySelector('[aria-label="Reopen Verify dimensions"]')?.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[aria-label="Filter tasks by milestone Manufacturing sign-off"]')?.textContent).toContain('100%');
    expect(container.querySelector('[aria-label="Project details"] [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');
  });

  it("keeps the project task modal open when Create more is enabled",async()=>{
    session.landing.mockResolvedValue(signedIn);const data=detailFixture();projectTasks.load.mockResolvedValue(data);
    projectTasks.mutate.mockImplementation(async change=>({...data,tasks:[...data.tasks,{...change.task,id:change.id,season:'S27',revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),completedAt:null}]}));
    await open('/projects/00000000-0000-4000-8000-000000000100?milestone=00000000-0000-4000-8000-000000000040');
    await act(async()=>[...container.querySelectorAll<HTMLButtonElement>('[aria-label="Project tasks"] button')].find(button=>button.textContent==='New task')!.click());
    const title=document.querySelector<HTMLTextAreaElement>('#new-task-title')!;
    const description=document.querySelector<HTMLTextAreaElement>('#new-task-description')!;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(title,'Inspect suspension clearances');title.dispatchEvent(new Event('input',{bubbles:true}));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(description,'Check the assembly drawing before inspection.');description.dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('create-another-task')!.click();
    });
    await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(projectTasks.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'save_task',task:expect.objectContaining({title:'Inspect suspension clearances',description:'Check the assembly drawing before inspection.'})}));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(document.querySelector<HTMLTextAreaElement>('#new-task-title')?.value).toBe('');expect(document.querySelector<HTMLTextAreaElement>('#new-task-description')?.value).toBe('');expect(document.querySelector('#new-task-milestone')?.textContent).toBe('Manufacturing sign-off');
  });

  it("preserves project-module access requirements for task lists",async()=>{
    session.landing.mockResolvedValue(signedIn);const data=directoryFixture();data.projectAccess=false;workspace.load.mockResolvedValue(data);
    await open('/projects/00000000-0000-4000-8000-000000000100');expect(projectTasks.load).not.toHaveBeenCalled();expect(container.textContent).toContain('Project task access required');expect(container.textContent).not.toContain('Complete chassis design review');
  });

  it("keeps tasks hidden when the server revokes project access",async()=>{
    session.landing.mockResolvedValue(signedIn);projectTasks.load.mockRejectedValue(new ProjectRequestError('Access revoked',403));
    await open('/projects/00000000-0000-4000-8000-000000000100');expect(container.textContent).toContain('Project task access required');expect(container.textContent).not.toContain('Complete chassis design review');
  });

  it("saves member edits through the admin action and retains the form on a failed save",async()=>{
    session.landing.mockResolvedValue(signedIn);await open('/members');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Edit Sam Example"]')!.click());
    const input=document.querySelector<HTMLInputElement>('#member-name')!;
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Sam Updated');input.dispatchEvent(new Event('input',{bubbles:true}));});
    workspace.saveMember.mockRejectedValueOnce(new Error('Record changed. Reload before saving.'));
    await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(document.querySelector<HTMLInputElement>('#member-name')?.value).toBe('Sam Updated');
    expect(workspace.saveMember).toHaveBeenCalledWith(expect.objectContaining({name:'Sam Updated',expectedRevision:1,departments:expect.any(Array)}));
    const saved=directoryFixture();saved.members[1].name='Sam Updated';workspace.saveMember.mockResolvedValue(saved);
    await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('table')?.textContent).toContain('Sam Updated');
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
