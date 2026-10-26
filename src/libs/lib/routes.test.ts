import { describe, expect, it } from "vitest";
import { appCtaLinks, mobileSecondaryNavLinks } from "./routes";

describe("partner portal navigation", () => {
  it("keeps desktop and mobile links on the current site so production can redirect and staging can stay local", () => {
    expect(appCtaLinks).toContainEqual({ label: "Sponsor portal", to: "/sponsorportal-login" });
    expect(mobileSecondaryNavLinks).toContainEqual({ label: "Sponsor portal", to: "/sponsorportal-login" });
  });
});
