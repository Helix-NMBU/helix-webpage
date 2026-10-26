import { describe, expect, it } from "vitest";
import { getApplicationOrigin, getApplicationUrl, resolveAppHost } from "./app-hosts";

const domains = [
  ["helixnmbu.no", "public", "production"],
  ["internal.helixnmbu.no", "member", "production"],
  ["partner.helixnmbu.no", "partner", "production"],
] as const;

describe("application hosts", () => {
  it.each(domains)("resolves %s exactly and independently of preview flags", (hostname, application, environment) => {
    expect(resolveAppHost(hostname)).toEqual({ application, environment });
    expect(resolveAppHost(hostname.toUpperCase(), {
      development: true, mode: "member-local", memberPlatformPreview: true,
    })).toEqual({ application, environment });
    expect(getApplicationOrigin(application, environment)).toBe(`https://${hostname}`);
  });

  it.each([
    "internal.helixnmbu.no.evil.invalid",
    "evilinternal.helixnmbu.no", "internal-helixnmbu.no", "foo.internal.helixnmbu.no",
    "internal.helixnmbu.no.", "www.helixnmbu.no.evil.invalid", "custom.example", "localhost.example",
    "192.168.1.2", "preview.vercel.app.evil.invalid", "evilvercel.app", "vercel.app",
    ".vercel.app", "bad..vercel.app", "internal.helixnmbu.no@evil.invalid",
    "https://internal.helixnmbu.no", "internal.helixnmbu.no:443", "",
  ])("does not infer an application for %s", (hostname) => {
    expect(resolveAppHost(hostname, {
      memberPlatformPreview: true, development: true, mode: "member-local",
    })).toEqual({ application: null, environment: "unknown" });
  });

  it.each([
    "helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app",
    "feature-123.vercel.app",
  ])("requires an explicit member flag on Vercel preview %s", (hostname) => {
    expect(resolveAppHost(hostname)).toEqual({ application: "public", environment: "preview" });
    expect(resolveAppHost(hostname, { mode: "member-local", development: true })).toEqual({
      application: "public", environment: "preview",
    });
    expect(resolveAppHost(hostname, { memberPlatformPreview: true })).toEqual({
      application: "member", environment: "preview",
    });
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("restricts local member mode to development on %s", (hostname) => {
    expect(resolveAppHost(hostname)).toEqual({ application: "public", environment: "local" });
    for (const flag of [{ mode: "member-local" }, { memberPlatformPreview: true }]) {
      expect(resolveAppHost(hostname, { ...flag, development: true })).toEqual({
        application: "member", environment: "local",
      });
      expect(resolveAppHost(hostname, { ...flag, development: false })).toEqual({
        application: "public", environment: "local",
      });
    }
  });
});

describe("application URLs", () => {
  it("recognizes the production www alias and links to production siblings", () => {
    expect(resolveAppHost("www.helixnmbu.no", { memberPlatformPreview: true })).toEqual({
      application: "public", environment: "production",
    });
    expect(getApplicationUrl("member", "https://www.helixnmbu.no", "/login?from=profile#form")).toBe(
      "https://internal.helixnmbu.no/login?from=profile#form",
    );
    expect(getApplicationUrl("partner", "https://www.helixnmbu.no", "/login")).toBe(
      "https://partner.helixnmbu.no/login",
    );
  });

  it.each(domains)("links from %s to production applications", (hostname) => {
    for (const [destination, application] of domains) {
      expect(getApplicationUrl(application, `https://${hostname}`, "/login?from=profile#form")).toBe(
        `https://${destination}/login?from=profile#form`,
      );
      expect(getApplicationUrl(application, `https://${hostname}`)).toBe(`https://${destination}/`);
    }
  });

  it.each(["http://127.0.0.1:5190", "http://localhost:5190", "http://[::1]:5190", "https://feature-123.vercel.app"])(
    "preserves a member deployment origin and port for %s", (origin) => {
      const options = { development: true, memberPlatformPreview: true };
      expect(getApplicationUrl("member", origin, "/profile?tab=cv#details", options)).toBe(
        `${origin}/profile?tab=cv#details`,
      );
      expect(() => getApplicationUrl("partner", origin, "/", options)).toThrow("No application origin");
    },
  );

  it("does not silently send unknown hosts or previews to production", () => {
    expect(() => getApplicationUrl("member", "https://custom.example")).toThrow("No application origin");
    expect(() => getApplicationUrl("member", "https://feature-123.vercel.app")).toThrow("No application origin");
    expect(getApplicationUrl("public", "https://feature-123.vercel.app")).toBe("https://feature-123.vercel.app/");
  });

  it("treats canceled permanent staging domains as unknown", () => {
    for (const hostname of ["staging.helixnmbu.no", "internal.staging.helixnmbu.no", "partner.staging.helixnmbu.no"]) {
      expect(resolveAppHost(hostname, { memberPlatformPreview: true })).toEqual({
        application: null, environment: "unknown",
      });
      expect(() => getApplicationUrl("member", `https://${hostname}`)).toThrow("No application origin");
    }
  });

  it.each(["https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/\n/evil.invalid", "profile"])(
    "rejects a path that could escape the destination: %s", (path) => {
      expect(() => getApplicationUrl("member", "https://helixnmbu.no", path)).toThrow("absolute path");
    },
  );
});
