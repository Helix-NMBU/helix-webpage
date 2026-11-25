// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";
import PublicApp from "./PublicApp";

vi.mock("@libs/components/navbar/Navbar", () => ({ Navbar: () => null }));
vi.mock("@libs/components/footer", () => ({ default: () => null }));
vi.mock("@libs/components/PageLoader", () => ({ PageLoader: () => null }));
vi.mock("../MemberCV/MemberCV", () => ({ default: () => <h1>Full profile overview</h1> }));
vi.mock("../MemberCV/MemberCvSections", () => ({ default: () => <h1>New CV editor</h1> }));

it("shares CV editor routing on the older public member profile path", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const router = createMemoryRouter([{ path: "*", element: <PublicApp /> }], { initialEntries: ["/member/profile"] });
  try {
    await act(async () => root.render(<RouterProvider router={router} />));
    await vi.waitFor(() => expect(host.querySelector("h1")?.textContent).toBe("Full profile overview"));
    await act(async () => router.navigate("/member/profile?cv-editor=sections"));
    await vi.waitFor(() => expect(host.querySelector("h1")?.textContent).toBe("New CV editor"));
    await act(async () => router.navigate("/member/profile?cv-editor=classic"));
    await vi.waitFor(() => expect(host.querySelector("h1")?.textContent).toBe("Full profile overview"));
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
