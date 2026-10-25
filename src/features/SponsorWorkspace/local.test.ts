import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalSponsorMode, localSponsorRequest } from "./local";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("local sponsor mode boundary", () => {
  it.each(["https://sponsors.helixnmbu.no", "http://192.168.1.2:5192", "https://127.0.0.1.attacker.invalid", "bad-url"])("rejects non-loopback %s", (origin) => {
    vi.stubEnv("DEV", true); vi.stubEnv("MODE", "sponsor-local");
    expect(isLocalSponsorMode(origin)).toBe(false);
  });
  it.each(["http://localhost:5192", "http://127.0.0.1:5192", "http://[::1]:5192"])("allows dedicated loopback %s", (origin) => {
    vi.stubEnv("DEV", true); vi.stubEnv("MODE", "sponsor-local");
    expect(isLocalSponsorMode(origin)).toBe(true);
  });
  it("rejects a production build even when built with the local mode name", () => {
    vi.stubEnv("DEV", false); vi.stubEnv("MODE", "sponsor-local");
    expect(isLocalSponsorMode("http://127.0.0.1:5192")).toBe(false);
  });
  it("rejects ordinary development and refuses to fetch with a fixture identity", async () => {
    vi.stubEnv("DEV", true); vi.stubEnv("MODE", "development");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(isLocalSponsorMode("http://127.0.0.1:5192")).toBe(false);
    await expect(localSponsorRequest("admin")).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("ends access before sending a body when another tab changes the local account", async () => {
    vi.resetModules(); vi.stubEnv("DEV", true); vi.stubEnv("MODE", "sponsor-local");
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5192", href: "http://127.0.0.1:5192/sponsor?account=sponsor" } });
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    const fetcher = vi.fn(async () => Response.json({ authUserId: "sponsor", role: "sponsor" })); vi.stubGlobal("fetch", fetcher);
    const local = await import("./local");
    await local.localSponsorSession();
    values.set("helix-sponsor-local-account-v1", "admin");
    await expect(local.localSponsorRequest("requests", { method: "POST", body: "private input" })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps local sign-out effective until an explicit new local sign-in", async () => {
    vi.resetModules(); vi.stubEnv("DEV", true); vi.stubEnv("MODE", "sponsor-local");
    vi.stubGlobal("window", { location: { origin: "http://localhost:5192", href: "http://localhost:5192/sponsor" } });
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    const fetcher = vi.fn(async () => Response.json({ authUserId: "sponsor", role: "sponsor" })); vi.stubGlobal("fetch", fetcher);
    const local = await import("./local");
    await local.localSponsorSession(); await local.localSponsorSignOut();
    await expect(local.localSponsorRequest("directory")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
