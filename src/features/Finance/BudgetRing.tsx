import { nokToOre } from "./finance-calculations";

const money = (value: string) => {
  const [whole, fraction = "00"] = value.split(".");
  return `NOK ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction.padEnd(2, "0")}`;
};

export function budgetUsage(actual: string, planned: string): number {
  const a = nokToOre(actual), p = nokToOre(planned);
  if (p <= 0n) return a > 0n ? 100 : 0;
  return Number(a >= p ? 100n : a <= 0n ? 0n : a * 100n / p);
}

export function BudgetRing({ planned, actual }: { planned: string; actual: string }) {
  const planOre = nokToOre(planned), actualOre = nokToOre(actual);
  const over = actualOre > planOre;
  const percent = budgetUsage(actual, planned);
  const label = planOre === 0n ? (over ? "Over" : "—") : over ? "Over" : `${percent}%`;
  const details = `Recorded spending ${money(actual)} of budget ${money(planned)}${over ? ", over budget" : planOre === 0n ? ", percentage unavailable for a zero budget" : `, ${percent}% used`}`;
  return <div role="img" aria-label={details} className="relative grid size-32 shrink-0 place-items-center sm:size-40">
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" pathLength="100" strokeDasharray={`${percent} 100`} className={over ? "text-destructive" : "text-primary"} />
    </svg><span className="text-lg font-medium tabular-nums" aria-hidden="true">{label}</span>
  </div>;
}

