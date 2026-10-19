import { describe, expect, it, vi } from "vitest";
import { CvRequestError } from "./repository";
import {
  MEMBER_AUTH_UNAVAILABLE,
  memberAuthFailure,
  memberLoadFailure,
  resolveMemberAuthUrl,
  sessionTokenFromAuth,
} from "./session";

describe("member auth URL", () => {
  it("keeps an absolute Neon URL and expands the same-origin proxy path", () => {
    const neon = "https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth";
    expect(resolveMemberAuthUrl(`${neon}/`, "https://preview.example")).toBe(neon);
    expect(resolveMemberAuthUrl("/api/auth", "https://preview.example")).toBe("https://preview.example/api/auth");
    expect(resolveMemberAuthUrl("/api/auth", "https://helix.example/")).toBe("https://helix.example/api/auth");
  });
});

describe("member auth failures", () => {
  it("redirects to login for 401 and 403 and shows a generic error for 400", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const token = vi.fn(async () => ({ data: { token: "unused" } }));
    const unauthorized = await sessionTokenFromAuth({
      getSession: async () => ({ data: null, error: { status: 401, message: "Unauthorized" } }),
      token,
    }, { current: null }).catch((error: unknown) => error);
    const forbidden = await sessionTokenFromAuth({
      getSession: async () => ({ data: { user: { id: "member" } } }),
      token: async () => ({ data: null, error: { status: 403, message: "Forbidden" } }),
    }, { current: null }).catch((error: unknown) => error);
    const invalid = await sessionTokenFromAuth({
      getSession: async () => ({ data: null, error: { status: 400, message: "HTTP 400 INVALID_HOSTNAME" } }),
      token,
    }, { current: null }).catch((error: unknown) => error);

    expect(memberLoadFailure(unauthorized)).toEqual({ redirectTo: "/member/login" });
    expect(unauthorized).toMatchObject({ status: 401 });
    expect(memberLoadFailure(forbidden)).toEqual({ redirectTo: "/member/login" });
    expect(forbidden).toMatchObject({ status: 403 });
    expect(memberLoadFailure(invalid)).toEqual({ message: MEMBER_AUTH_UNAVAILABLE });
    expect(invalid).toMatchObject({ status: 400, message: MEMBER_AUTH_UNAVAILABLE });
    expect(JSON.stringify(invalid)).not.toContain("INVALID_HOSTNAME");
    expect(logged).toHaveBeenCalledWith("Member auth request failed.", {
      status: 400,
      detail: "HTTP 400 INVALID_HOSTNAME",
    });
    expect(token).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("logs a network failure instead of treating it as signed out", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = memberAuthFailure(new TypeError("Failed to fetch"));
    expect(failure).toBeInstanceOf(CvRequestError);
    expect(memberLoadFailure(failure)).toEqual({ message: MEMBER_AUTH_UNAVAILABLE });
    expect(failure.status).not.toBe(401);
    expect(logged).toHaveBeenCalledWith("Member auth request failed.", {
      status: null,
      detail: "Failed to fetch",
    });
    logged.mockRestore();
  });
});
