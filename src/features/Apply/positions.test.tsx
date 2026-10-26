// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApplyPage from "./ApplyPage";
import ApplicationFormPage from "./ApplicationFormPage";
const notify = vi.hoisted(() => vi.fn());
vi.mock("@gsap/react", () => ({ useGSAP: () => ({ contextSafe: (callback: unknown) => callback }) }));
vi.mock("../MemberPlatform/MemberNotifications", () => ({ useNotify: () => notify }));
vi.mock("motion/react", () => {
  const element = (tag: string) => ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => {
    for (const key of ["initial", "animate", "exit", "transition", "custom", "variants", "layout"]) delete props[key];
    return createElement(tag, props, children);
  };
  return { AnimatePresence: ({ children }: { children: ReactNode }) => children, motion: { div: element("div"), form: element("form") } };
});
let container: HTMLDivElement; let root: Root;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); notify.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const position = { id: "new-position", title: "New engineering position", department: "Electrical", applyUrl: "", contact: { name: "Contact", email: "contact@example.test" }, about: "Build the car", tasks: ["Design"], achieve: ["Experience"], visible: true };
it("loads the website listing and application choices from the live public catalog", async () => {
  fetchMock.mockImplementation(async () => Response.json({ positions: [position] }));
  await act(async () => root.render(<MemoryRouter><ApplyPage /></MemoryRouter>));
  expect(fetchMock).toHaveBeenCalledWith("/api/website?action=positions", { cache: "no-store" });
  expect(container.textContent).toContain(position.title);
  await act(async () => root.render(<MemoryRouter><ApplicationFormPage /></MemoryRouter>));
  expect(container.querySelector('option[value="new-position"]')?.textContent).toContain(position.title);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("clears a stale posting link when a position has been hidden or deleted", async () => {
  fetchMock.mockResolvedValue(Response.json({ positions: [] }));
  await act(async () => root.render(<MemoryRouter initialEntries={["/apply/form?position=deleted"]}><ApplicationFormPage /></MemoryRouter>));
  expect(container.textContent).toContain("Which position are you applying for?");
  expect(container.querySelector('select')?.value).toBe("");
});
it("reports catalog failures through shared notifications with recovery", async () => {
  fetchMock.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
  await act(async () => root.render(<MemoryRouter><ApplyPage /></MemoryRouter>));
  expect(notify).toHaveBeenCalledWith("Could not load positions", expect.any(String), expect.objectContaining({ action: { label: "Reload", onClick: expect.any(Function) } }));
});

it("shows every visible open posting and department supplied by the catalog", async () => {
  fetchMock.mockResolvedValue(Response.json({ positions: [
    { ...position, department: "Software & Autonomous" },
    { ...position, id: "open-one", title: "Open One", department: "Open" },
    { ...position, id: "open-two", title: "Open Two", department: "Open" },
  ] }));
  await act(async () => root.render(<MemoryRouter><ApplyPage /></MemoryRouter>));
  expect(container.textContent).toContain("Open One");
  expect(container.textContent).toContain("Open Two");
  const filter = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Software & Autonomous")!;
  await act(async () => filter.click());
  expect(container.textContent).toContain(position.title);
});
