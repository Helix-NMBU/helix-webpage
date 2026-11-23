import { expect, it } from "vitest";
import { missingTierDeliverables, tierDeliverables, tierDeliverableDrafts } from "./tier-deliverables";

it("uses the S27 brochure inclusions and seasonal quantities for every package", () => {
  const titles = (tier: string) => tierDeliverables(tier, ["S27"]).map(item => item.title);
  expect(titles("partner")).toEqual(["Company name on car and website"]);
  expect(titles("bronze")).toHaveLength(5);
  expect(titles("bronze")).not.toContain("CV bank access");
  expect(titles("silver")).toHaveLength(8);
  expect(titles("silver")).toContain("LinkedIn partnership post");
  expect(titles("silver")).not.toContain("Instagram story 1");
  expect(titles("gold")).toHaveLength(14);
  expect(titles("gold")).toContain("Internal distribution 2");
  expect(titles("gold")).not.toContain("Campus distribution 1");
  expect(titles("platinum")).toHaveLength(19);
  expect(titles("platinum")).toContain("Campus distribution 1");
  expect(titles("platinum")).not.toContain("Campus distribution 2");
  expect(titles("main")).toHaveLength(23);
  expect(titles("main")).toContain("Campus distribution 2");
  expect(titles("main")).toContain("Speaking time at unveiling and season closing");
});

it("does not invent a package for service deals, unknown tiers or another season", () => {
  expect(tierDeliverables("service", ["S27"])).toEqual([]);
  expect(tierDeliverables("gold", ["S28"])).toEqual([]);
  expect(tierDeliverables(null, ["S27"])).toEqual([]);
  expect(tierDeliverables("unknown", ["S27"])).toEqual([]);
});

it("adds only missing commitments and preserves explicitly retired terms", () => {
  const templates = tierDeliverables("bronze", ["S27"]);
  const saved = [{ title: "  LOGO on car and website  " }, { title: "Logo in season closing post", retiredAt: "2026-11-01" }];
  expect(missingTierDeliverables(templates, saved)).toHaveLength(3);
  const draft = tierDeliverableDrafts(templates, saved);
  expect(draft.every(item => item.ownerMemberId === null && item.dueDate === null)).toBe(true);
  expect(tierDeliverableDrafts(templates, [...saved, ...draft])).toEqual([]);
});
