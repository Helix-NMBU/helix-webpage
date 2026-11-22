import { randomUUID } from "node:crypto";
import type { CvDatabase } from "../../../api/_lib/member-cv-service.js";

/** Historical season approval fixture, before project candidates replaced current authoring APIs. */
export async function seedHistoricalApprovedSeasonBudget(db: CvDatabase, approver: string): Promise<void> {
  // Keep the original legacy SQL semantics, including protected allocation anchors
  // and real legacy approval provenance. This never creates project approvals.
  await db.query("select finance.create_season_budget($1::uuid,$2::uuid,$3)", [approver, randomUUID(), "a".repeat(64)]);
  await db.query("select finance.approve_season_budget($1::uuid,$2::uuid,$3,0,'2026-10-01'::date)", [approver, randomUUID(), "b".repeat(64)]);
}
