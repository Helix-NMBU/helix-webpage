import type { FundingScenario } from "./types";

export function BudgetSummary({
  plannedNok,
  actualNok,
  differenceNok,
  usedFraction,
  commitmentNok,
  unbudgetedNok,
}: {
  plannedNok: string;
  actualNok: string;
  differenceNok: string;
  usedFraction: string | null;
  commitmentNok: string;
  unbudgetedNok: string;
}) {
  const difference = differenceNok.startsWith("-") ? `${differenceNok} Over plan` : differenceNok;
  return (
    <p className="text-sm text-muted-foreground">
      Planned {plannedNok} · Actual {actualNok} · Difference {difference} · Budget use {usedFraction ?? "Undefined"} · Open commitments {commitmentNok} · Unbudgeted {unbudgetedNok}
    </p>
  );
}

export function CommitmentUse({ commitmentNok, usedFraction }: { commitmentNok?: string; usedFraction?: string | null }) {
  if (commitmentNok === undefined && usedFraction === undefined) return null;
  const parts = [
    commitmentNok !== undefined ? `Open commitments ${commitmentNok}` : null,
    usedFraction !== undefined ? `Budget use ${usedFraction ?? "Undefined"}` : null,
  ].filter((part) => part !== null);
  return <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

export function ScenarioList({ scenarios }: { scenarios: readonly FundingScenario[] }) {
  if (scenarios.length === 0) return null;
  return (
    <section aria-label="Funding scenarios" className="space-y-3">
      {scenarios.map((scenario) => (
        <article key={scenario.key} className="space-y-1">
          <h2 className="text-lg font-medium">{scenario.label}</h2>
          <p className="text-sm text-muted-foreground">
            Eligible funding {scenario.eligibleFundingNok} · Earmarked {scenario.earmarkedNok} · Unrestricted remainder {scenario.unrestrictedNok} · Need {scenario.needNok} · Restricted cover {scenario.restrictedCoverNok} · General need {scenario.generalNeedNok} · Shortfall {scenario.shortfallNok}
          </p>
        </article>
      ))}
    </section>
  );
}
