export type SponsorEvent = {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  title: string;
  location: string;
};

// Placeholder dates — update as the season's sponsor calendar is confirmed.
export const upcomingSponsorEvents: SponsorEvent[] = [
  { id: "design-reveal-2026", date: "2026-10-14", title: "Design Reveal", location: "Helix workshop, Ås" },  { id: "sponsor-open-house-2026", date: "2026-11-05", title: "Sponsor Open House", location: "Helix workshop, Ås" },
  { id: "testing-days-2027", date: "2027-02-12", title: "Testing Days", location: "Ås" },
];
