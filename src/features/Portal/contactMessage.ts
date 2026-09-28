import type { PortalContext } from "./types";

export type SponsorStatus = "new" | "returning" | "expiring" | "active";

type StatusInput = Pick<PortalContext, "agreementStartsAt" | "agreementEndsAt" | "isReturningSponsor" | "hasUpcomingAgreement">;

/** A welcome shows during the first days of an agreement, and a renewal nudge during its last. */
export const WELCOME_DAYS = 60;
export const RENEWAL_NOTICE_DAYS = 90;

const DAY_MS = 86_400_000;

// Agreement dates are plain YYYY-MM-DD; read them as local dates so day counts don't drift by a timezone.
const parseDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export function sponsorStatus(context: StatusInput, today = new Date()): SponsorStatus {
  const now = startOfDay(today);
  if (context.agreementEndsAt && !context.hasUpcomingAgreement) {
    const daysLeft = daysBetween(now, parseDate(context.agreementEndsAt));
    if (daysLeft >= 0 && daysLeft <= RENEWAL_NOTICE_DAYS) return "expiring";
  }
  if (context.agreementStartsAt) {
    const daysIn = daysBetween(parseDate(context.agreementStartsAt), now);
    if (daysIn >= 0 && daysIn < WELCOME_DAYS) return context.isReturningSponsor ? "returning" : "new";
  }
  return "active";
}

export function contactMessage(status: SponsorStatus, details: { firstName: string; organizationName: string | null; agreementEndsAt: string | null }) {
  const { firstName, organizationName, agreementEndsAt } = details;
  const addressee = organizationName ? `, ${organizationName}` : "";
  const subject = (topic: string) => (organizationName ? `Re: ${topic} – ${organizationName}` : `Re: ${topic}`);

  switch (status) {
    case "new":
      return {
        text: `Welcome to Helix${addressee}! I'm ${firstName}, your contact on the team. Looking forward to working with you this season. Questions about the partnership, requests or events? Just reach out.`,
        subject: subject("Welcome to Helix"),
      };
    case "returning":
      return {
        text: `Welcome back${addressee}! Great to have you with us for another season. I'm ${firstName}, your contact this year. Just reach out if there's anything you need.`,
        subject: subject("Another season with Helix"),
      };
    case "expiring": {
      const endDate = agreementEndsAt ? parseDate(agreementEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
      return {
        text: `Hi! ${endDate ? `Our partnership runs until ${endDate}.` : "Our partnership is coming to an end."} We'd love to keep working together. Shall we talk about next season?`,
        subject: subject("Renewing our partnership"),
      };
    }
    default:
      return {
        text: `Hi! I'm ${firstName}, your contact at Helix. Questions about your partnership, requests or events? Just reach out.`,
        subject: subject("Helix partnership"),
      };
  }
}
