import { useFinanceRefresh } from "./use-finance-refresh";
import { hasVisibleApprovedFinances } from "./finance-calculations";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@libs/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@libs/components/ui/empty";
import { FinanceContentSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { FinanceGate, useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { BudgetsBoard } from "./BudgetsPage";
import { BudgetDashboard } from "./BudgetDashboard";
import { FinancingPage } from "./FinancingPage";
import { OverviewBoard } from "./OverviewPage";
import { SpendingPurchases } from "./SpendingPurchases";
import { SeasonSpending } from "./SeasonSpending";
import { PurchasesBoard } from "./PurchasesPage";
import type { FinancePageId } from "./routes";

const pages: { id: FinancePageId; title: string; empty: string; description: string }[] = [
  { id: "overview", title: "Spending", empty: "No spending recorded yet", description: "Registered purchases for this season." },
  { id: "purchases", title: "Purchases", empty: "No purchases to show", description: "Your requests will appear here." },
  { id: "budgets", title: "Budgets & Financing", empty: "No budget is published yet", description: "Review department budgets, plan project costs and manage funding." },
  { id: "financing", title: "Financing", empty: "No funding records yet", description: "Funding sources and earmarked parts for the current season." },
];

function FinanceSection({ page }: { page: FinancePageId }) {
  useFinanceRefresh();
  const session = useFinanceAccess();
  const current = pages.find((item) => item.id === page) ?? pages[0];
  const loaded = page === "overview" ? session.overview : page === "budgets" ? session.budgets : page === "purchases" ? session.purchases : session.financing;
  const loadedVersion = loaded?.viewVersion ?? null;
  useEffect(() => {
    if (session.access !== "allowed" || session.viewVersion === null || loadedVersion === session.viewVersion) return;
    void session.loadPage(page);
  }, [loadedVersion, page, session.access, session.loadPage, session.viewVersion]);
  useEffect(() => {
    if (session.access !== "allowed" || page !== "purchases" || !session.capabilities?.registerActual || session.budgets) return;
    void session.loadPage("budgets");
  }, [page, session.access, session.budgets, session.capabilities?.registerActual, session.loadPage]);
  const financingVersion = session.financing?.viewVersion ?? null;
  useEffect(() => {
    if (page !== "budgets" || session.access !== "allowed" || !session.capabilities?.financing || session.viewVersion === null || financingVersion === session.viewVersion) return;
    void session.loadPage("financing");
  }, [financingVersion, page, session.access, session.capabilities?.financing, session.loadPage, session.viewVersion]);
  const overviewReady = page === "overview" && Boolean(session.overview) && (
    (session.overview && hasVisibleApprovedFinances(session.overview))
    || (session.overview?.departments.length ?? 0) > 0
    || (session.overview?.publicEarmarks.length ?? 0) > 0
    || session.overview?.budgetStatus !== "absent"
    || Boolean(session.overview?.scenarios?.length)
  );
  const budgetsReady = page === "budgets" && Boolean(session.budgets) && (
    (session.budgets && hasVisibleApprovedFinances(session.budgets))
    || (session.budgets?.departments.length ?? 0) > 0
    || session.budgets?.budgetStatus !== "absent"
    || Boolean(session.capabilities?.createBudget)
  );
  const purchasesReady = page === "purchases" && Boolean(session.purchases) && (
    (session.purchases?.ownRequests.length ?? 0) > 0
    || (session.purchases?.register?.length ?? 0) > 0
    || (session.purchases?.decisionQueue?.length ?? 0) > 0
    || Boolean(session.capabilities?.ownRequests)
    || Boolean(session.capabilities?.registerActual)
  );
  const empty = !session.pageLoading && loaded && !budgetsReady && !purchasesReady && (
    page === "overview" ? session.overview?.departments.length === 0 && session.overview.publicEarmarks.length === 0 && session.overview.budgetStatus === "absent"
      : page === "budgets" ? session.budgets?.departments.length === 0
        : page === "purchases" ? session.purchases?.ownRequests.length === 0 && (session.purchases.register?.length ?? 0) === 0
          : session.financing?.funding.length === 0
  );
  return (
    <section className={`mx-auto w-full ${page === "budgets" || page === "overview" ? "max-w-7xl" : "max-w-5xl"} space-y-8 px-2 py-8 sm:px-6`} aria-labelledby="finance-page-title">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-3">
          <p className="text-sm text-muted-foreground">{page === "purchases" ? "Management" : "Finance"}</p>
          <h1 id="finance-page-title" className="text-3xl font-medium tracking-tight">{current.title}</h1>
          <p className="text-muted-foreground">{current.description}</p>
        </div>
        {page === "overview" && session.access === "allowed" && session.capabilities?.purchaseRegister && session.purchases && <SeasonSpending purchases={session.purchases.register ?? []} />}
      </div>
      {page !== "overview" && page !== "budgets" && session.profiles?.includes("head_of_finance") && <Button asChild variant="outline"><Link to="/finance/funding-applications">Funding applications</Link></Button>}
      {page === "overview" && session.capabilities?.purchaseRegister ? <SpendingPurchases /> : page === "budgets" ? (
        <BudgetDashboard />
      ) : page === "financing" ? <FinancingPage /> : !loaded ? (
        <FinanceContentSkeleton page={page} canRegister={Boolean(session.capabilities?.registerActual)} />
      ) : budgetsReady ? (
        <BudgetsBoard />
      ) : purchasesReady ? (
        <PurchasesBoard />
      ) : overviewReady ? (
        <OverviewBoard />
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
