import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { compareNb } from "./budget-domain";
import { BudgetSummary, ScenarioList } from "./budget-summary";
import { financeRoutes } from "./routes";
import type { PublicEarmarkSummary, PublicOverview } from "./types";

function budgetLabel(overview: PublicOverview): string {
  if (overview.budgetStatus === "approved") {
    return overview.approvedOn ? `Approved budget · ${overview.approvedOn}` : "Approved budget";
  }
  if (overview.budgetStatus === "draft") return "Draft budget";
  return "No season budget";
}

function earmarkGroups(earmarks: readonly PublicEarmarkSummary[]) {
  const groups = new Map<string, PublicEarmarkSummary[]>();
  for (const earmark of earmarks) {
    const name = earmark.systemName ?? "Unassigned";
    const list = groups.get(name) ?? [];
    list.push(earmark);
    groups.set(name, list);
  }
  return [...groups.entries()].sort(([left], [right]) => {
    if (left === "Unassigned") return 1;
    if (right === "Unassigned") return -1;
    return compareNb(left, right);
  });
}

export function OverviewBoard() {
  const session = useFinanceAccess();
  const overview = session.overview;
  const scroller = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onScroll = () => { scrollTop.current = node.scrollTop; };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [overview]);
  useEffect(() => {
    const node = scroller.current;
    if (!node || node.scrollTop === scrollTop.current) return;
    node.scrollTop = scrollTop.current;
  }, [overview]);
  if (!overview) return null;
  const groups = earmarkGroups(overview.publicEarmarks);
  return (
    <div ref={scroller} data-finance-overview className="max-h-[70vh] space-y-8 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {overview.seasonCode ? `Season ${overview.seasonCode}` : "No current season"}
          {` · ${budgetLabel(overview)}`}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={financeRoutes.budgets}>Budget detail</Link>
        </Button>
      </div>
      {overview.scenarios ? <ScenarioList scenarios={overview.scenarios} /> : null}
      {overview.departments.map((department) => {
        const open = session.expanded[department.departmentKey] === true;
        const panelId = `overview-systems-${department.departmentKey}`;
        return (
          <section key={department.departmentKey} className="space-y-3" aria-labelledby={`overview-${department.departmentKey}`}>
            <div className="space-y-1">
              <h2 id={`overview-${department.departmentKey}`} className="text-xl font-medium">{department.name}</h2>
              <BudgetSummary
                plannedNok={department.plannedNok}
                actualNok={department.actualNok}
                differenceNok={department.differenceNok}
                usedFraction={department.usedFraction}
                commitmentNok={department.commitmentNok}
                unbudgetedNok={department.unbudgetedNok}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => session.setExpanded(department.departmentKey, !open)}
            >
              {open ? "Hide systems" : "Show systems"}
            </Button>
            {open ? (
              <div id={panelId} className="space-y-4">
                {department.systems.map((system) => (
                  <article key={system.id} className="space-y-1">
                    <h3 className="text-base font-medium">{system.name}{system.active ? "" : " · Inactive"}</h3>
                    <p className="text-sm text-muted-foreground">{system.code}</p>
                    <BudgetSummary
                      plannedNok={system.plannedNok}
                      actualNok={system.actualNok}
                      differenceNok={system.differenceNok}
                      usedFraction={system.usedFraction}
                      commitmentNok={system.commitmentNok}
                      unbudgetedNok={system.unbudgetedNok}
                    />
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
      {groups.length > 0 ? (
        <section aria-label="Public earmarks" className="space-y-4">
          <h2 className="text-xl font-medium">Public earmarks</h2>
          {groups.map(([systemName, earmarks]) => (
            <div key={systemName} className="space-y-2">
              <h3 className="text-base font-medium">{systemName}</h3>
              {earmarks.map((earmark) => (
                <p key={earmark.id} className="text-sm text-muted-foreground">
                  {earmark.purpose} · {earmark.amountNok} · Used {earmark.usedNok} · Left {earmark.leftNok}
                  {earmark.spendBy ? ` · Deadline ${earmark.spendBy}` : ""}
                  {` · Must return ${earmark.mustReturnNok}`}
                </p>
              ))}
            </div>
          ))}
        </section>
      ) : null}
      {overview.earmarkSources ? (
        <section aria-label="Earmark sources" className="space-y-2">
          <h2 className="text-xl font-medium">Earmark sources</h2>
          {overview.earmarkSources.map((source) => (
            <p key={source.id} className="text-sm text-muted-foreground">
              {source.sourceName}{source.conditions ? ` · ${source.conditions}` : ""}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
