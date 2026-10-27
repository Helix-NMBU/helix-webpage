import { describe, expect, it } from "vitest";
import { compareNb, differenceOre, effectivePlanOre, MANUAL_ITEM_DEFAULTS, normalizeItemPatch, normalizeManualItem, protectedItemFieldsChanged } from "./budget-domain";

describe("budget item rules", () => {
  it("applies manual defaults and keeps a zero plan", () => {
    const result = normalizeManualItem({ systemId: "11111111-1111-4111-8111-111111111111", description: "  Frame tube  ", plannedNok: "0" });
    expect(result.errors).toEqual([]);
    expect(result.item).toMatchObject({
      description: "Frame tube",
      category: MANUAL_ITEM_DEFAULTS.category,
      priority: MANUAL_ITEM_DEFAULTS.priority,
      reuseStatus: MANUAL_ITEM_DEFAULTS.reuseStatus,
      status: MANUAL_ITEM_DEFAULTS.status,
      plannedOre: 0n,
      earmarkId: null,
    });
  });

  it("rejects invalid amounts, dates, and earmark combinations", () => {
    const result = normalizeManualItem({
      systemId: "not-a-system",
      description: " ",
      plannedNok: "10.5555",
      priority: "EM",
      category: "material",
      reuseStatus: "new",
      expectedPurchaseDate: "2026-02-31",
      earmarkId: null,
    });
    expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining(["systemId", "description", "plannedNok", "expectedPurchaseDate", "earmarkId"]));
  });

  it("treats plan, priority, and earmark as the protected edit", () => {
    const current = { plannedOre: 100n, priority: "P1" as const, earmarkId: null };
    expect(protectedItemFieldsChanged(current, { note: "Updated" })).toBe(false);
    expect(protectedItemFieldsChanged(current, { systemId: "11111111-1111-4111-8111-111111111111" })).toBe(false);
    expect(protectedItemFieldsChanged(current, { plannedOre: 200n })).toBe(true);
    expect(normalizeItemPatch({ status: "cancelled" }).errors[0]?.message).toMatch(/cancel/i);
  });

  it("uses a zero effective plan for cancelled and unallocated items", () => {
    expect(effectivePlanOre(250000n, "cancelled", false)).toBe(0n);
    expect(effectivePlanOre(0n, "planned", true)).toBe(0n);
    expect(differenceOre(0n, 900n)).toBe(-900n);
    expect(compareNb("Åpne", "Beta")).toBeGreaterThan(0);
  });
});
