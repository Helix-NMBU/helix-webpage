import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMemberPlatform, isMemberPlatformHost, memberPaths } from "./routes";

describe("member platform routing", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("VITE_MEMBER_PLATFORM", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses root member routes on the internal production host", () => {
    const hostname = "internal.helixnmbu.no";
    expect(isMemberPlatformHost(hostname)).toBe(true);
    expect(isMemberPlatform(`https://${hostname}`)).toBe(true);
    expect(memberPaths(`https://${hostname}`)).toEqual({ home: "/", login: "/login", profile: "/profile" });
  });

  it.each([
    "helixnmbu.no", "www.helixnmbu.no", "partner.helixnmbu.no",
    "internal.helixnmbu.no.evil.invalid", "custom.example",
  ])("keeps legacy member routes on %s even with the member preview flag", (hostname) => {
    vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
    expect(isMemberPlatformHost(hostname)).toBe(false);
    expect(isMemberPlatform(`https://${hostname}`)).toBe(false);
    expect(memberPaths(`https://${hostname}`)).toEqual({
      home: "/member/profile", login: "/member/login", profile: "/member/profile",
    });
  });

  it("preserves Vercel preview compatibility only with the exact enabled flag", () => {
    const origin = "https://helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app";
    expect(isMemberPlatform(origin)).toBe(false);
    vi.stubEnv("VITE_MEMBER_PLATFORM", "1");
    expect(isMemberPlatform(origin)).toBe(false);
    vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
    expect(isMemberPlatform(origin)).toBe(true);
    expect(isMemberPlatform(`${origin}.evil.invalid`)).toBe(false);
    expect(isMemberPlatformHost(new URL(origin).hostname)).toBe(false);
  });

  it.each(["http://localhost:5190", "http://127.0.0.1:5190", "http://[::1]:5190"])(
    "preserves development-only loopback routing on %s", (origin) => {
      vi.stubEnv("MODE", "member-local");
      expect(isMemberPlatform(origin)).toBe(false);
      vi.stubEnv("DEV", true);
      expect(isMemberPlatform(origin)).toBe(true);
      vi.stubEnv("MODE", "development");
      expect(isMemberPlatform(origin)).toBe(false);
      vi.stubEnv("VITE_MEMBER_PLATFORM", "true");
      expect(isMemberPlatform(origin)).toBe(true);
      vi.stubEnv("DEV", false);
      expect(isMemberPlatform(origin)).toBe(false);
    },
  );

  it("does not enable member routing for malformed origins", () => {
    expect(isMemberPlatform("invalid")).toBe(false);
    expect(isMemberPlatform("https://internal.helixnmbu.no@evil.invalid")).toBe(false);
  });
});
