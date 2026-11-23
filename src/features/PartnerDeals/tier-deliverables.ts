import type { Deliverable } from "./types";

// S27 sponsor brochure, printed pages 15–16. Quantities are per season.
// Service agreements have individually negotiated benefits and no package in the brochure.
type TierItem = { title: string; description: string };
const item = (title: string, description: string): TierItem => ({ title, description });
const bronze = [
  item("Logo on car and website", "Display the sponsor logo on the car and the Helix website."),
  item("Logo in season closing post", "Include the sponsor logo in the season closing post."),
  item("Link to sponsor website", "Link to the sponsor's website from Helix."),
  item("Car unveiling invitation", "Invite the sponsor to the car unveiling."),
  item("Sponsor portal access", "Provide access to booking and purchasing add-ons in the sponsor portal."),
];
const silver = [...bronze,
  item("Season closing invitation", "Invite the sponsor to the season closing event."),
  item("CV bank access", "Provide access to the CV bank for the season, as agreed."),
  item("LinkedIn partnership post", "Publish one partnership post on LinkedIn this season."),
];
const gold = [...silver,
  item("Logo on banner and competition clothing", "Include the sponsor logo on the banner and competition clothing."),
  item("Helix Day stand", "Provide a stand at Helix Day."),
  ...[1, 2].map(n => item(`Internal distribution ${n}`, "Share one sponsor message internally in Helix. Campus distributions are additional.")),
  ...[1, 2].map(n => item(`Instagram story ${n}`, "Publish one Instagram story for the sponsor.")),
];
const platinum = [...gold,
  item("Website partnership article", "Publish one partnership article on the Helix website."),
  item("Campus distribution 1", "Share one sponsor message on campus and internally in Helix."),
  item("Company presentation", "Arrange one company presentation this season."),
  item("LinkedIn recruitment post", "Publish one recruitment post on LinkedIn this season."),
  item("Joint Instagram post", "Include the sponsor in one joint Instagram post."),
];
const main = [...platinum,
  item("Campus distribution 2", "Share one additional sponsor message on campus and internally in Helix."),
  item("Helix lecture", "Deliver one Helix lecture for the sponsor this season."),
  item("LinkedIn main sponsor presentation", "Publish one main sponsor presentation on LinkedIn."),
  item("Speaking time at unveiling and season closing", "Provide speaking time at the car unveiling and the season closing event."),
];
const s27Packages: Record<string, readonly TierItem[]> = {
  partner: [item("Company name on car and website", "Display the partner name on the car and the Helix website.")],
  bronze, silver, gold, platinum, main,
};
export function tierDeliverables(level: string | null | undefined, seasonCodes: readonly string[]): readonly TierItem[] {
  return seasonCodes.includes("S27") ? s27Packages[level ?? ""] ?? [] : [];
}
const normalize = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
export function missingTierDeliverables<T extends { title: string; retiredAt?: string | null }>(templates: readonly TierItem[], recorded: readonly T[]): TierItem[] {
  const titles = new Set(recorded.map(item => normalize(item.title)));
  return templates.filter(template => !titles.has(normalize(template.title)));
}
export function tierDeliverableDrafts(templates: readonly TierItem[], recorded: readonly { title: string; retiredAt?: string | null }[]): Deliverable[] {
  return missingTierDeliverables(templates, recorded).map(item => ({ ...item, dueDate: null, ownerMemberId: null }));
}
