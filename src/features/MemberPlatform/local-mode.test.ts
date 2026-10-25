import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalMemberMode } from "./local-mode";
import { memberPaths } from "./routes";
import { clearMemberLanding, ensureMemberLanding, signOutMember, startGoogleSignIn } from "../MemberCV/session";

describe("local member platform", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("MODE", "member-local");
    clearMemberLanding();
  });
  afterEach(() => {
    clearMemberLanding();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requires a development server, the dedicated mode and a loopback host", () => {
    for (const origin of ["http://127.0.0.1:5190", "http://localhost:5190", "http://[::1]:5190"]) {
      expect(isLocalMemberMode(origin)).toBe(true);
      expect(memberPaths(origin)).toEqual({ home: "/", login: "/login", profile: "/profile" });
    }
    for (const origin of ["https://internal.helixnmbu.no", "https://helixnmbu.no", "https://preview.vercel.app", "http://192.168.1.2:5190", "http://localhost.example", "invalid"]) {
      expect(isLocalMemberMode(origin)).toBe(false);
    }
    vi.stubEnv("DEV", false);
    expect(isLocalMemberMode("http://127.0.0.1:5190")).toBe(false);
    vi.stubEnv("DEV", true);
    vi.stubEnv("MODE", "development");
    expect(isLocalMemberMode("http://127.0.0.1:5190")).toBe(false);
  });

  it("uses the local account for sign-in and sign-out without calling external auth", async () => {
    const values = new Map<string, string>();
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { origin: "http://127.0.0.1:5190", assign } });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    const getSession = vi.fn();
    const request = vi.fn();
    await expect(ensureMemberLanding({ getSession }, request)).resolves.toMatchObject({
      phase: "signed-in", account: { name: "Alex Example", role: "Admin" },
    });
    await signOutMember();
    await expect(ensureMemberLanding({ getSession }, request)).resolves.toMatchObject({ phase: "signed-out" });
    await startGoogleSignIn("/profile");
    expect(assign).toHaveBeenCalledWith("http://127.0.0.1:5190/profile");
    await expect(ensureMemberLanding({ getSession }, request)).resolves.toMatchObject({ phase: "signed-in" });
    expect(getSession).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
});
