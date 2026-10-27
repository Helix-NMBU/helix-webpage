import { describe, expect, it } from "vitest";
import { addCalendarDays, osloToday } from "./money";
import {
  LATE_REASON_MIN,
  normalizeRequestInput,
  osloCalendarDaysBetween,
  requiresLateReason,
  thirdOsloDayFrom,
} from "./request-domain";

const line = (estimatedNok: string) => ({
  budgetItemId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  description: "Test fasteners",
  estimatedNok,
});

describe("request late reason (Oslo calendar days)", () => {
  it("requires a reason when the planned date is fewer than three Oslo calendar days away, including the past", () => {
    const today = osloToday();
    expect(requiresLateReason(addCalendarDays(today, -1), today)).toBe(true);
    expect(requiresLateReason("2020-01-15", today)).toBe(true);
    expect(requiresLateReason(today, today)).toBe(true);
    expect(requiresLateReason(addCalendarDays(today, 1), today)).toBe(true);
    expect(requiresLateReason(addCalendarDays(today, 2), today)).toBe(true);
    expect(requiresLateReason(thirdOsloDayFrom(today), today)).toBe(false);
    expect(requiresLateReason(addCalendarDays(today, 10), today)).toBe(false);
  });

  it("counts Oslo calendar days across a DST boundary", () => {
    const beforeDst = "2026-03-28";
    const afterDst = "2026-03-30";
    expect(osloCalendarDaysBetween(beforeDst, afterDst)).toBe(2);
    expect(requiresLateReason(afterDst, beforeDst)).toBe(true);
    expect(requiresLateReason(addCalendarDays(beforeDst, LATE_REASON_MIN), beforeDst)).toBe(false);
  });

  it("validates late reason on normalized input", () => {
    const today = osloToday();
    const missing = normalizeRequestInput(
      {
        supplierName: "Example Supplier",
        justification: "Need parts this week",
        plannedDate: today,
        lines: [line("100.00")],
      },
      today,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.some((e) => e.field === "lateReason")).toBe(true);

    const ok = normalizeRequestInput(
      {
        supplierName: "Example Supplier",
        justification: "Need parts this week",
        plannedDate: today,
        lateReason: "Urgent repair",
        lines: [line("100.00")],
      },
      today,
    );
    expect(ok.ok).toBe(true);
  });
});
