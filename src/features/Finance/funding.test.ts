import { describe, expect, it } from "vitest";
import {
  derivePartUsage,
  earmarkedOre,
  fundingWarnings,
  isFundingAction,
  parseFundingChange,
  stableJson,
} from "./funding";
import { formatOre } from "./money";

const fundingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const partId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const funding = {
  sourceName: " Example source ",
  ownerName: " Example owner ",
  fundingType: "grant",
  amountNok: "1000.00",
  status: "secured",
  confidence: "high",
  expectedDate: "2027-03-01",
  receivedDate: "",
  ownerEmail: "owner@example.test",
  reportingRequired: true,
  agreementLink: "https://example.test/agreement",
  note: " Synthetic note ",
};

describe("funding changes", () => {
  it("normalizes a funding record into exact ore and trimmed fields", () => {
    const parsed = parseFundingChange({ action: "addFunding", funding });
    expect(parsed).toMatchObject({
      ok: true,
      change: {
        action: "addFunding",
        sourceName: "Example source",
        ownerName: "Example owner",
        fundingType: "grant",
        amountOre: "100000",
        status: "secured",
        confidence: "high",
        expectedDate: "2027-03-01",
        receivedDate: null,
        ownerEmail: "owner@example.test",
        reportingRequired: true,
        agreementLink: "https://example.test/agreement",
        note: "Synthetic note",
      },
    });
  });

  it("uses the inventory defaults when a new record omits type, status, and confidence", () => {
    const parsed = parseFundingChange({
      action: "addFunding",
      funding: { sourceName: "Example source", ownerName: "Example owner", amountNok: "1.50" },
    });
    expect(parsed).toMatchObject({
      ok: true,
      change: { fundingType: "sponsor_cash", status: "applied", confidence: null, amountOre: "150", reportingRequired: false },
    });
  });

  it("reports every invalid funding field and does not invent a change", () => {
    const parsed = parseFundingChange({
      action: "addFunding",
      funding: {
        sourceName: " ",
        ownerName: "",
        amountNok: "0",
        fundingType: "cash",
        status: "paid",
        confidence: "certain",
        expectedDate: "32-13-2026",
        ownerEmail: "owner",
        agreementLink: "ftp://example.test/file",
        reportingRequired: "yes",
      },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const fields = parsed.errors.map((error) => error.field);
    expect(fields).toEqual(expect.arrayContaining([
      "sourceName", "ownerName", "amountNok", "fundingType", "status", "confidence", "expectedDate", "ownerEmail", "agreementLink", "reportingRequired",
    ]));
  });

  it("rejects a non-positive part, a bad deadline, and moving a part to another source", () => {
    expect(parseFundingChange({
      action: "addEarmark",
      expectedRevision: 1,
      part: { fundingId, purpose: " ", amountNok: "-5", spendBy: "not-a-date" },
    }).ok).toBe(false);
    const moved = parseFundingChange({
      action: "editEarmark",
      partId,
      expectedRevision: 2,
      patch: { fundingId: otherId, purpose: "Frame work" },
    });
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.errors.map((error) => error.message).join(" ")).toContain("cannot move");
    const movedFunding = parseFundingChange({
      action: "editFunding",
      fundingId,
      expectedRevision: 2,
      patch: { fundingId: otherId, sourceName: "Example source" },
    });
    expect(movedFunding.ok).toBe(false);
    if (!movedFunding.ok) expect(movedFunding.errors.some((error) => error.field === "fundingId")).toBe(true);
  });

  it("does not offer a destructive part action", () => {
    expect(isFundingAction("deleteEarmark")).toBe(false);
    expect(isFundingAction("addEarmark")).toBe(true);
    expect(parseFundingChange({ action: "deleteEarmark", partId, expectedRevision: 1 }).ok).toBe(false);
  });

  it("keeps an edit that only changes one stored field", () => {
    const parsed = parseFundingChange({
      action: "editFunding",
      fundingId,
      expectedRevision: 4,
      patch: { amountNok: "2500.50" },
    });
    expect(parsed).toEqual({
      ok: true,
      change: { action: "editFunding", fundingId, expectedRevision: 4, fields: ["amountOre"], values: { amountOre: "250050" } },
    });
  });
});

describe("earmark totals and deadlines", () => {
  it("warns with the exact excess and keeps a negative unrestricted remainder", () => {
    const fundingOre = 100000n;
    const parts = [150050n];
    const earmarked = earmarkedOre(parts);
    const excess = earmarked - fundingOre;
    expect(excess).toBe(50050n);
    expect(fundingOre - earmarked).toBe(-50050n);
    expect(fundingWarnings(excess, 0)).toEqual([
      { message: `Earmarked parts exceed this funding by ${formatOre(excess)} NOK.` },
    ]);
    expect(fundingWarnings(0n, 1)[0]?.message).toBe("This funding still pays for 1 budget item that is not cancelled.");
    expect(fundingWarnings(0n, 2)[0]?.message).toBe("This funding still pays for 2 budget items that are not cancelled.");
    expect(fundingWarnings(0n, 0)).toEqual([]);
  });

  it("caps used spend at the part and returns only the leftover after the deadline", () => {
    expect(derivePartUsage(100000n, 250000n, "2026-01-01", "2026-10-26")).toEqual({
      usedOre: 100000n, leftOre: 0n, overdue: true, mustReturnOre: 0n,
    });
    expect(derivePartUsage(150000n, 40000n, "2026-01-01", "2026-10-26")).toEqual({
      usedOre: 40000n, leftOre: 110000n, overdue: true, mustReturnOre: 110000n,
    });
    expect(derivePartUsage(150000n, 40000n, "2026-12-31", "2026-10-26")).toMatchObject({ overdue: false, mustReturnOre: 0n, leftOre: 110000n });
    expect(derivePartUsage(150000n, 40000n, "2026-10-26", "2026-10-26")).toMatchObject({ overdue: false, mustReturnOre: 0n });
    expect(derivePartUsage(150000n, 40000n, null, "2026-10-26")).toMatchObject({ overdue: false, mustReturnOre: 0n });
    expect(derivePartUsage(150000n, -1n, "2026-01-01", "2026-10-26").usedOre).toBe(0n);
  });

  it("hashes equivalent payloads independently of key order", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: null } })).toBe(stableJson({ a: { c: null, d: 2 }, b: 1 }));
  });
});
