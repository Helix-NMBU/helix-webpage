import { describe, expect, it } from "vitest";
import {
  REQUEST_STATUSES, assertRequestRevision, assertRequestTransition, isTerminalRequest,
  statusAfterRequestReply, validateExpectedRevision, validateRequestDraft, validateRequestReply,
  type RequestActor, type RequestStatus,
} from "./requests";

const draft = { type: "general_collaboration", title: "Technical visit", body: "Could we discuss a technical visit?" };

describe("sponsor request input", () => {
  it("accepts each agreed request type and preserves meaningful multiline text", () => {
    for (const type of ["general_collaboration", "thesis_project", "recruitment"]) {
      expect(validateRequestDraft({ ...draft, type, title: "  Proposal  ", body: " First paragraph.\r\n\r\nSecond paragraph. " }))
        .toEqual({ type, title: "Proposal", body: "First paragraph.\n\nSecond paragraph." });
    }
  });
  it.each([null, [], "request", {}, { ...draft, type: "workshop_booking" }, { ...draft, title: " " },
    { ...draft, title: "x".repeat(161) }, { ...draft, title: "Title\nAnother title" },
    { ...draft, body: "x".repeat(10_001) }, { ...draft, body: "Message\0hidden" },
    { ...draft, organizationId: "another-organization" }, { ...draft, status: "completed" },
    { ...draft, authorId: "someone-else" }, { ...draft, assignedAdminId: "self-appointed-admin" },
  ])("rejects invalid input or client-owned identity fields: %j", (input) => {
    expect(() => validateRequestDraft(input)).toThrow();
  });
  it("accepts the documented length boundaries", () => {
    expect(validateRequestDraft({ ...draft, title: "x".repeat(160), body: "x".repeat(10_000) }).body).toHaveLength(10_000);
    expect(validateRequestReply("  Reply\r\nwith details.  ")).toBe("Reply\nwith details.");
    expect(() => validateRequestReply(" ")).toThrow();
  });
  it.each([-1, 1.1, "1", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("requires an integer revision: %j", (revision) => {
    expect(() => validateExpectedRevision(revision)).toThrow();
  });
  it("rejects stale revisions so simultaneous replies cannot silently overwrite each other", () => {
    expect(() => assertRequestRevision(3, 2)).toThrow(/changed in another session/);
    expect(() => assertRequestRevision(3, 3)).not.toThrow();
    expect(validateExpectedRevision(0)).toBe(0);
  });
});

describe("request workflow permissions", () => {
  const adminAllowed = new Set([
    "submitted:under_review", "submitted:input_needed", "submitted:declined",
    "under_review:input_needed", "under_review:completed", "under_review:declined",
    "input_needed:under_review", "input_needed:completed", "input_needed:declined",
  ]);
  for (const actor of ["sponsor", "admin"] as RequestActor[]) {
    for (const current of REQUEST_STATUSES) {
      for (const next of REQUEST_STATUSES) {
        const allowed = !isTerminalRequest(current) && (actor === "sponsor" ? next === "cancelled" : adminAllowed.has(`${current}:${next}`));
        it(`${actor} ${allowed ? "can" : "cannot"} move ${current} to ${next}`, () => {
          const change = () => assertRequestTransition(current, next, actor);
          if (allowed) expect(change).not.toThrow(); else expect(change).toThrow();
        });
      }
    }
  }
  it("rejects unknown statuses and actors", () => {
    expect(() => assertRequestTransition("submitted", "invented", "admin")).toThrow(/valid request status/);
    expect(() => assertRequestTransition("submitted", "under_review", "developer" as RequestActor)).toThrow();
    expect(() => assertRequestTransition("invented" as RequestStatus, "under_review", "admin")).toThrow();
  });
  it("returns an answered input request to review only for a sponsor reply", () => {
    expect(statusAfterRequestReply("input_needed", "sponsor")).toBe("under_review");
    expect(statusAfterRequestReply("input_needed", "admin")).toBe("input_needed");
    expect(statusAfterRequestReply("submitted", "sponsor")).toBe("submitted");
    expect(statusAfterRequestReply("under_review", "admin")).toBe("under_review");
  });
  it.each(["completed", "declined", "cancelled"] as const)("keeps %s conversations read-only", (status) => {
    expect(() => statusAfterRequestReply(status, "sponsor")).toThrow(/read-only/);
    expect(() => statusAfterRequestReply(status, "admin")).toThrow(/read-only/);
  });
});
