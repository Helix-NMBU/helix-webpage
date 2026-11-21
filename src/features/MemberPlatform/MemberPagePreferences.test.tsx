// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberPagePreferences } from "./MemberPagePreferences";
const gates = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("./local-mode", () => ({
  isLocalMemberMode: () => gates.local,
  localMemberSignedIn: () => gates.signedIn,
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  gates.local = true;
  gates.signedIn = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function open() {
  const router = createMemoryRouter(
    [{ path: "*", element: <MemberPagePreferences /> }],
    {
      initialEntries: [
        "/projects/existing?tab=budget&budgetRole=department_lead",
      ],
    },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
  return router;
}
describe("budget fixture role and view preferences", () => {
  it("preserves the local-only role through restoration but never stores it as a page preference", async () => {
    localStorage.setItem(
      "helix-member-view-preferences:member:/projects/existing",
      "tab=tasks&view=list",
    );
    const router = await open();
    expect(router.state.location.search).toContain(
      "budgetRole=department_lead",
    );
    expect(router.state.location.search).toContain("tab=budget");
    expect(router.state.location.search).toContain("view=list");
    expect(
      localStorage.getItem(
        "helix-member-view-preferences:member:/projects/existing",
      ),
    ).not.toContain("budgetRole");
  });
  it.each(["production", "signed-out"])(
    "does not preserve role parameters in %s",
    async (mode) => {
      gates.local = mode !== "production";
      gates.signedIn = mode !== "signed-out";
      const router = await open();
      expect(router.state.location.search).toBe("?tab=budget");
    },
  );
});
