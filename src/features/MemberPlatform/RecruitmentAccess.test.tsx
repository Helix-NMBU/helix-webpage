// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecruitmentAccessProvider, useRecruitmentAccess } from "./RecruitmentAccess";
import { RecruitmentRequestError, type ApplicationRow } from "../Recruitment/website-api";
import type { RecruitmentPosition } from "../Recruitment/positions";
const mocks = vi.hoisted(() => ({ api: { session: vi.fn(), list: vi.fn(), positions: vi.fn(), savePosition: vi.fn(), deletePosition: vi.fn(), remove: vi.fn(), reject: vi.fn() }, notify: vi.fn() }));
vi.mock("../Recruitment/website-api", async original => ({ ...await original<typeof import("../Recruitment/website-api")>(), createRecruitmentApi: () => mocks.api }));
vi.mock("./MemberNotifications", () => ({ useNotify: () => mocks.notify }));
let container: HTMLDivElement; let root: Root;
let session: ReturnType<typeof useRecruitmentAccess>;
let router: ReturnType<typeof createMemoryRouter>;
const position: RecruitmentPosition = { id: "position", title: "Engineer", department: "Software", applyUrl: "", contact: { name: "Recruiter", email: "recruiter@example.test" }, about: "Build", tasks: [], achieve: [], visible: true };
const application = { id: "application", full_name: "Applicant" } as ApplicationRow;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function Probe() { session = useRecruitmentAccess(); return <p>{session.access}: {session.positions.map(row => row.title).join()} {session.applications.map(row => row.full_name).join()}</p>; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  mocks.api.session.mockResolvedValue({ email: "recruiter@example.test" });
  mocks.api.list.mockResolvedValue([application]); mocks.api.positions.mockResolvedValue([position]);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function mount() {
  router = createMemoryRouter([{ element: <RecruitmentAccessProvider userId="member"><Outlet /></RecruitmentAccessProvider>, children: [{ path: "/", element: <Probe /> }, { path: "/elsewhere", element: <p>Another page</p> }] }], { initialEntries: ["/"] });
  await act(async () => root.render(<StrictMode><RouterProvider router={router} /></StrictMode>));
}
it("renders unrelated pages while the recruitment check is pending", async () => {
  const check = deferred<{ email: string }>();
  mocks.api.session.mockReturnValueOnce(check.promise);
  await mount();
  expect(session.access).toBe("loading");
  await act(async () => router.navigate("/elsewhere"));
  expect(container.textContent).toContain("Another page");
  expect(mocks.api.list).not.toHaveBeenCalled();
  await act(async () => { check.resolve({ email: "recruiter@example.test" }); await check.promise; });
  expect(mocks.api.list).toHaveBeenCalledOnce();
});
it("grants the recruitment shell after its access check while data continues loading", async () => {
  const rows = deferred<ApplicationRow[]>();
  mocks.api.list.mockReturnValueOnce(rows.promise);
  await mount();
  expect(session.access).toBe("allowed");
  expect(session.loading).toBe(true);
  expect(session.applications).toEqual([]);
  await act(async () => { rows.resolve([application]); await rows.promise; });
  expect(session.applications).toEqual([application]);
  expect(session.loading).toBe(false);
});
it("deduplicates StrictMode bootstrap and retains data while routed content unmounts", async () => {
  await mount(); expect(mocks.api.session).toHaveBeenCalledOnce(); expect(mocks.api.list).toHaveBeenCalledOnce(); expect(mocks.api.positions).toHaveBeenCalledOnce();
  await act(async () => router.navigate("/elsewhere")); await act(async () => router.navigate("/"));
  expect(container.textContent).toContain("Engineer Applicant"); expect(mocks.api.session).toHaveBeenCalledOnce(); expect(mocks.api.list).toHaveBeenCalledOnce();
});
it("announces temporary login access failure from Home and retries on demand", async () => {
  mocks.api.session.mockRejectedValueOnce(new RecruitmentRequestError("Unavailable", 503));
  await mount(); expect(session.access).toBe("unavailable");
  const options = mocks.notify.mock.calls[0][2];
  expect(options.action.label).toBe("Try again");
  await act(async () => options.action.onClick());
  expect(session.access).toBe("allowed"); expect(session.positions).toEqual([position]);
  expect(mocks.api.session).toHaveBeenCalledTimes(2);
});
it("does not overwrite a saved position with an older refresh response", async () => {
  await mount(); const oldPositions = deferred<RecruitmentPosition[]>();
  mocks.api.positions.mockReturnValueOnce(oldPositions.promise);
  let refreshing!: Promise<void>; await act(async () => { refreshing = session.refresh(); });
  const saved = { ...position, title: "Updated engineer" }; mocks.api.savePosition.mockResolvedValue(saved);
  await act(async () => session.savePosition(saved));
  await act(async () => { oldPositions.resolve([position]); return refreshing; });
  expect(session.positions).toEqual([saved]); expect(session.loading).toBe(false);
});
it("keeps a completed application deletion after leaving its page and ignores old refresh data", async () => {
  await mount(); const oldRows = deferred<ApplicationRow[]>(); const removal = deferred<{ emailStatus: "skipped"; cleanupPending: boolean }>();
  mocks.api.list.mockReturnValueOnce(oldRows.promise); mocks.api.remove.mockReturnValueOnce(removal.promise);
  let refreshing!: Promise<void>; let deleting!: Promise<unknown>;
  await act(async () => { refreshing = session.refresh(); deleting = session.removeApplication(application.id, false); });
  await act(async () => router.navigate("/elsewhere"));
  await act(async () => { removal.resolve({ emailStatus: "skipped", cleanupPending: false }); return deleting; });
  await act(async () => { oldRows.resolve([application]); return refreshing; });
  await act(async () => router.navigate("/"));
  expect(session.applications).toEqual([]); expect(session.loading).toBe(false);
});
it("clears all private data when a refreshed operation loses its server grant", async () => {
  await mount(); mocks.api.list.mockRejectedValue(new RecruitmentRequestError("Revoked", 403));
  await act(async () => session.refresh());
  expect(session.access).toBe("denied"); expect(session.applications).toEqual([]); expect(session.positions).toEqual([]);
});
it("ignores an old account's outstanding preload after a new session mounts", async () => {
  const oldCatalog = deferred<RecruitmentPosition[]>();
  mocks.api.positions.mockReturnValueOnce(oldCatalog.promise);
  await mount();
  expect(container.textContent).not.toContain("Applicant");
  mocks.api.list.mockResolvedValue([]); mocks.api.positions.mockResolvedValue([{ ...position, title: "Other account position" }]);
  const otherRouter = createMemoryRouter([{ path: "/", element: <RecruitmentAccessProvider key="other" userId="other"><Probe /></RecruitmentAccessProvider> }]);
  await act(async () => root.render(<RouterProvider key="other" router={otherRouter} />));
  await act(async () => oldCatalog.resolve([position]));
  expect(session.positions[0].title).toBe("Other account position"); expect(session.applications).toEqual([]);
  expect(container.textContent).not.toContain("Applicant");
});

it("does not restore a deleted posting when an earlier save response arrives after navigation", async () => {
  await mount(); const saving = deferred<RecruitmentPosition>();
  mocks.api.savePosition.mockReturnValueOnce(saving.promise); mocks.api.deletePosition.mockResolvedValue(undefined);
  const updated = { ...position, title: "Earlier edit" };
  let saved!: Promise<void>;
  await act(async () => { saved = session.savePosition(updated); });
  await act(async () => router.navigate("/elsewhere"));
  await act(async () => router.navigate("/"));
  await act(async () => session.deletePosition(position.id));
  expect(session.positions).toEqual([]);
  await act(async () => { saving.resolve(updated); return saved; });
  expect(session.positions).toEqual([]);
});
