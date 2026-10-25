import { describe, expect, it } from "vitest";
import { assertFreshHelixGoogleAccount, assertLinkedHelixAccount } from "./helix-workspace.js";
import { MemberCvError } from "./member-cv-error.js";

const fresh = {
  email: "ase@helixnmbu.no",
  emailVerified: true,
  hd: "helixnmbu.no",
  googleSub: "google-ase",
  accountSub: "google-ase",
  banned: false,
};

describe("Helix Workspace access", () => {
  it("accepts a verified Workspace token whose subject matches the Neon Google account", () => {
    expect(() => assertFreshHelixGoogleAccount(fresh)).not.toThrow();
  });

  const rejected: Array<[Partial<typeof fresh>, string]> = [
    [{ hd: "gmail.com" }, "hosted domain"],
    [{ hd: undefined }, "missing hosted domain"],
    [{ email: "ase@gmail.com", hd: "gmail.com" }, "other domain"],
    [{ emailVerified: false }, "unverified email"],
    [{ banned: true }, "banned"],
    [{ googleSub: "other-sub" }, "subject mismatch"],
  ];
  for (const [patch, label] of rejected) {
    it(`rejects a fresh Google proof for ${label}`, () => {
      expect(() => assertFreshHelixGoogleAccount({ ...fresh, ...patch })).toThrow(MemberCvError);
    });
  }

  it("keeps a previously proved member without trusting a new hd hint", () => {
    expect(() => assertLinkedHelixAccount({
      email: fresh.email,
      emailVerified: true,
      googleSub: fresh.googleSub,
      accountSub: fresh.accountSub,
      storedSub: fresh.googleSub,
      storedEmail: fresh.email,
      banned: false,
    })).not.toThrow();
  });

  it("rejects a linked account whose email or Google subject changed", () => {
    expect(() => assertLinkedHelixAccount({
      email: "other@helixnmbu.no",
      emailVerified: true,
      googleSub: fresh.googleSub,
      accountSub: fresh.accountSub,
      storedSub: fresh.googleSub,
      storedEmail: fresh.email,
      banned: false,
    })).toThrow(/verified @helixnmbu\.no/);
    expect(() => assertLinkedHelixAccount({
      email: fresh.email,
      emailVerified: true,
      googleSub: "other",
      accountSub: "other",
      storedSub: fresh.googleSub,
      storedEmail: fresh.email,
      banned: false,
    })).toThrow(/no longer matches/);
  });
});
