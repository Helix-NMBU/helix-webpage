import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { Skeleton } from "@libs/components/ui/skeleton";
import { FinanceGate, useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { BudgetsBoard } from "./BudgetsPage";
import { financeRoutes, type FinancePageId } from "./routes";

const pages: { id: FinancePageId; label: string; title: string; empty: string; description: string }[] = [
  { id: "overview", label: "Overview", title: "Overview", empty: "No season is configured yet", description: "Season budget, spending and public earmarks will appear here." },
  { id: "purchases", label: "Purchases", title: "Purchases", empty: "No purchases to show", description: "Your requests will appear here." },
  { id: "budgets", label: "Budgets", title: "Budgets", empty: "No budget is published yet", description: "Department and system plans will appear here." },
  { id: "financing", label: "Financing", title: "Financing", empty: "No funding records yet", description: "Funding sources and earmarked parts will appear here." },
];

function FinanceSection({ page }: { page: FinancePageId }) {
  const location = useLocation();
  const session = useFinanceAccess();
  const links = pages.filter((item) => item.id !== "financing" || session.capabilities?.financing);
  const current = pages.find((item) => item.id === page) ?? pages[0];
  const loaded = page === "overview" ? session.overview : page === "budgets" ? session.budgets : page === "purchases" ? session.purchases : session.financing;
  const loadedVersion = loaded?.viewVersion ?? null;
  useEffect(() => {
    if (session.access !== "allowed" || session.viewVersion === null || loadedVersion === session.viewVersion) return;
    void session.loadPage(page);
  }, [loadedVersion, page, session.access, session.loadPage, session.viewVersion]);
  const budgetsReady = page === "budgets" && Boolean(session.budgets) && (
    (session.budgets?.departments.length ?? 0) > 0
    || session.budgets?.budgetStatus !== "absent"
    || Boolean(session.capabilities?.createBudget)
  );
  const empty = !session.pageLoading && loaded && !budgetsReady && (
    page === "overview" ? session.overview?.departments.length === 0 && session.overview.publicEarmarks.length === 0 && session.overview.budgetStatus === "absent"
      : page === "budgets" ? session.budgets?.departments.length === 0
        : page === "purchases" ? session.purchases?.ownRequests.length === 0 && (session.purchases.register?.length ?? 0) === 0
          : session.financing?.funding.length === 0
  );
  return (
    <section className="mx-auto w-full max-w-5xl space-y-8 px-2 py-8 sm:px-6" aria-labelledby="finance-page-title">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Finance</p>
        <h1 id="finance-page-title" className="text-3xl font-medium tracking-tight">{current.title}</h1>
        <p className="text-muted-foreground">{current.description}</p>
      </div>
      <nav aria-label="Finance sections" className="flex flex-wrap gap-2">
        {links.map((item) => (
          <Button key={item.id} asChild variant={location.pathname === financeRoutes[item.id] ? "default" : "outline"} size="sm">
            <Link to={financeRoutes[item.id]}>{item.label}</Link>
          </Button>
        ))}
      </nav>
      {session.pageLoading || !loaded ? (
        <div role="status" aria-label="Loading finance page" className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : budgetsReady ? (
        <BudgetsBoard />
      ) : empty ? (
        <Empty className="min-h-72 border border-solid">
          <EmptyHeader>
            <EmptyTitle>{current.empty}</EmptyTitle>
            <EmptyDescription>
              {session.seasonCode ? `Season ${session.seasonCode} has nothing to show yet.` : "An operator has not configured the current season."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <p className="text-sm text-muted-foreground">The latest finance view is ready.</p>
      )}
    </section>
  );
}

export function FinanceEntry({ page }: { page: FinancePageId }) {
  return (
    <FinanceGate page={page}>
      <FinanceSection page={page} />
    </FinanceGate>
  );
}
