// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecruitmentApi } from "./website-api";

const token = vi.hoisted(() => vi.fn(async () => "verified-member-jwt"));
vi.mock("../MemberCV/session", () => ({ memberSessionToken: token }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.localStorage.clear(); token.mockClear(); });

describe("recruitment development isolation", () => {
  it("uses empty UI fixtures only in the dedicated loopback development mode", async () => {
    vi.stubEnv("DEV", true); vi.stubEnv("MODE", "member-local");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const api = createRecruitmentApi({ current: null });
    expect(await api.session()).toMatchObject({ email: "alex@example.invalid" });
    expect(await api.list()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled(); expect(token).not.toHaveBeenCalled();
  });
  it.each([
    { development: false, mode: "member-local", signedOut: false },
    { development: true, mode: "development", signedOut: false },
    { development: true, mode: "member-local", signedOut: true },
  ])("requires real server authorization outside an active dedicated UI session: %j", async ({ development, mode, signedOut }) => {
    vi.stubEnv("DEV", development); vi.stubEnv("MODE", mode);
    if (signedOut) window.localStorage.setItem("helix-member-local-session-v1", "signed-out");
    const fetchMock = vi.fn(async () => Response.json({ error: "Recruiter access required" }, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRecruitmentApi({ current: null }).session()).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledWith("/api/website?action=session", expect.objectContaining({ headers: { Authorization: "Bearer verified-member-jwt" } }));
  });
});
