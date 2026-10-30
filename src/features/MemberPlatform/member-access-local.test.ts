// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";

const mode = vi.hoisted(() => ({ local: true, signedIn: true }));
vi.mock("./local-mode", () => ({
  isLocalMemberMode: () => mode.local,
  localMemberSignedIn: () => mode.signedIn,
  localMemberAccount: { email: "alex@example.invalid" },
}));
vi.mock("../Workspace/local-repository", () => ({
  createLocalWorkspaceRepository: () => ({
    load: async () => ({ viewerId: "00000000-0000-4000-8000-000000000001", members: [{ id: "00000000-0000-4000-8000-000000000001", name: "Alex Example" }] }),
    saveMember: async () => undefined,
  }),
}));
afterEach(() => { localStorage.clear(); vi.resetModules(); mode.local = true; mode.signedIn = true; });
it("persists local Finance access and never grants it outside signed-in local mode", async () => {
  const api = await import("./member-access-api");
  expect(api.localMemberHasFinancials()).toBe(false);
  await api.saveWorkspaceAccess({ current: null }, { memberId: "00000000-0000-4000-8000-000000000001", expectedRevision: 1, departments: [], spaceKeys: ["season-overview", "financials"] });
  expect(api.localMemberHasFinancials()).toBe(true);
  vi.resetModules();
  const reloaded = await import("./member-access-api");
  expect(reloaded.localMemberHasFinancials()).toBe(true);
  mode.signedIn = false;
  expect(reloaded.localMemberHasFinancials()).toBe(false);
  mode.signedIn = true; mode.local = false;
  expect(reloaded.localMemberHasFinancials()).toBe(false);
});
it("persists independently granted partner spaces in local mode", async () => {
  const api = await import("./member-access-api");
  const memberId = "00000000-0000-4000-8000-000000000001";
  expect(api.localMemberHasPartnerSpace("pipeline")).toBe(true);
  await api.saveWorkspaceAccess({ current: null }, { memberId, expectedRevision: 1, departments: [], spaceKeys: ["partner-agreements"] });
  expect(api.localMemberHasPartnerSpace("pipeline")).toBe(false);
  expect(api.localMemberHasPartnerSpace("partner-agreements")).toBe(true);
  vi.resetModules();
  const reloaded = await import("./member-access-api");
  expect(reloaded.localMemberHasPartnerSpace("pipeline")).toBe(false);
  expect(reloaded.localMemberHasPartnerSpace("partner-agreements")).toBe(true);
  mode.signedIn = false;
  expect(reloaded.localMemberHasPartnerSpace("partner-agreements")).toBe(false);
});
