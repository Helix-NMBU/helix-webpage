import { describe, expect, it } from "vitest";
import { contactMessage, sponsorStatus } from "./contactMessage";

const today = new Date(2026, 8, 24); // 24 September 2026
const agreement = (overrides: Partial<Parameters<typeof sponsorStatus>[0]> = {}) => ({
  agreementStartsAt: "2026-09-01",
  agreementEndsAt: "2027-06-30",
  isReturningSponsor: false,
  hasUpcomingAgreement: false,
  ...overrides,
});

describe("sponsor status", () => {
  it("welcomes a new sponsor during the first 60 days", () => {
    expect(sponsorStatus(agreement(), today)).toBe("new");
    expect(sponsorStatus(agreement({ agreementStartsAt: "2026-07-27" }), today)).toBe("new"); // day 59
    expect(sponsorStatus(agreement({ agreementStartsAt: "2026-07-26" }), today)).toBe("active"); // day 60
  });

  it("welcomes a returning sponsor back", () => {
    expect(sponsorStatus(agreement({ isReturningSponsor: true }), today)).toBe("returning");
  });

  it("nudges for renewal in the last 90 days", () => {
    expect(sponsorStatus(agreement({ agreementStartsAt: "2026-01-01", agreementEndsAt: "2026-12-23" }), today)).toBe("expiring"); // 90 days left
    expect(sponsorStatus(agreement({ agreementStartsAt: "2026-01-01", agreementEndsAt: "2026-12-24" }), today)).toBe("active"); // 91 days left
  });

  it("does not nudge a sponsor who has already renewed", () => {
    expect(sponsorStatus(agreement({ agreementStartsAt: "2026-01-01", agreementEndsAt: "2026-10-31", hasUpcomingAgreement: true }), today)).toBe("active");
  });

  it("prefers the renewal nudge when a short agreement is both new and ending", () => {
    expect(sponsorStatus(agreement({ agreementEndsAt: "2026-10-31" }), today)).toBe("expiring");
  });

  it("falls back to the general message when the start date is unknown", () => {
    expect(sponsorStatus(agreement({ agreementStartsAt: null }), today)).toBe("active");
    expect(sponsorStatus(agreement({ agreementStartsAt: null, agreementEndsAt: null }), today)).toBe("active");
  });
});

describe("contact message", () => {
  const details = { firstName: "Henrik", organizationName: "3Dconnexion", agreementEndsAt: "2027-06-30" };

  it("mentions the end date and asks about renewal", () => {
    const message = contactMessage("expiring", details);
    expect(message.text).toContain("30 June 2027");
    expect(message.subject).toBe("Re: Renewing our partnership – 3Dconnexion");
  });

  it("gives each status its own reply subject", () => {
    const subjects = (["new", "returning", "expiring", "active"] as const).map((status) => contactMessage(status, details).subject);
    expect(new Set(subjects).size).toBe(4);
  });

  it("leaves the organization out when it is unknown", () => {
    expect(contactMessage("active", { ...details, organizationName: null }).subject).toBe("Re: Helix partnership");
  });
});
