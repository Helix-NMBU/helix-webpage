import { describe, expect, it } from "vitest";
import { getRequestStatus } from "./requestStatus";

describe("sponsor-facing request statuses", () => {
  it.each([
    ["submitted", "Submitted"],
    ["requested", "Submitted"],
    ["under_review", "Under review"],
    ["quoting", "Under review"],
    ["waiting_for_sponsor", "Input needed"],
    ["changes_requested", "Input needed"],
    ["completed", "Completed"],
    ["fulfilled", "Completed"],
  ])("maps %s to %s", (source, label) => {
    expect(getRequestStatus(source).label).toBe(label);
  });

  it("keeps distinct milestones clear", () => {
    expect(getRequestStatus("scheduled").label).toBe("Scheduled");
    expect(getRequestStatus("published").label).toBe("Published");
    expect(getRequestStatus("cancelled").label).toBe("Cancelled");
  });
});
