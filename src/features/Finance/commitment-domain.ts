/** Shared commitment arithmetic for fulfillment reads, FIN-08 void, and FIN-09 need inputs. */

export function lineRemainingOre(approvedOre: bigint, fulfilledOre: bigint): bigint {
  const raw = approvedOre - fulfilledOre;
  return raw <= 0n ? 0n : raw;
}

export function requestRemainingOre(
  approvedOre: bigint,
  fulfilledOre: bigint,
  releasedOre: bigint,
  status: "approved" | "closed" | "cancelled" | "draft" | "submitted" | "rejected",
): bigint {
  if (status !== "approved") return 0n;
  const raw = approvedOre - fulfilledOre - releasedOre;
  return raw <= 0n ? 0n : raw;
}

export function itemOpenCommitmentOre(lineRemainings: bigint[]): bigint {
  return lineRemainings.reduce((sum, value) => sum + value, 0n);
}

export function scenarioNeedOre(actualOre: bigint, commitmentOre: bigint, eligibleRemainingPlanOre: bigint): bigint {
  const planComponent = commitmentOre > eligibleRemainingPlanOre ? commitmentOre : eligibleRemainingPlanOre;
  return actualOre + planComponent;
}
