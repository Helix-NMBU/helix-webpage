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
import { FinancingIncome } from "./FinancingIncome";
import { RegisterIncomeDialog } from "./RegisterIncomeDialog";
import { IncomeReceiptList } from "./IncomeReceiptList";
import { SeasonFinanceSummary } from "./SeasonSpending";
import { PurchasesBoard } from "./PurchasesPage";
import type { FinancePageId } from "./routes";

const pages: { id: FinancePageId; title: string; empty: string; description: string }[] = [
  { id: "overview", title: "Income & Spend", empty: "No income or spending recorded yet", description: "Income, payments and registered purchases for this season." },
  { id: "purchases", title: "Purchases", empty: "No purchases to show", description: "Your requests will appear here." },
  { id: "budgets", title: "Budgets", empty: "No budget is published yet", description: "Review department budgets and plan project costs." },
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
    if ((page !== "budgets" && page !== "overview") || session.access !== "allowed" || !session.capabilities?.financing || session.viewVersion === null || financingVersion === session.viewVersion) return;
    void session.loadPage("financing");
  }, [financingVersion, page, session.access, session.capabilities?.financing, session.loadPage, session.viewVersion]);
  // Pipeline forecasts can change independently of the Finance view version.
  useEffect(() => {
    if ((page !== "overview" && page !== "budgets") || session.access !== "allowed" || !session.capabilities?.financing) return;
    const refresh = () => { if (document.visibilityState !== "hidden") void session.loadPage("financing"); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("helix-workspace-updated", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("helix-workspace-updated", refresh); };
  }, [page, session.access, session.capabilities?.financing, session.loadPage]);
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
  const incomeSeason = page === "overview" && session.access === "allowed" && session.capabilities?.purchaseRegister
    ? session.financing?.seasonCode
    : null;
  const incomeRecords = incomeSeason ? session.financing?.incomeReceipts?.records : undefined;

  return (
    <section className={`mx-auto w-full ${page === "budgets" || page === "overview" ? "max-w-7xl" : "max-w-5xl"} space-y-8 px-2 py-8 sm:px-6`} aria-labelledby="finance-page-title">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-muted-foreground">{page === "purchases" ? "Management" : "Finance"}</p>
            <h1 id="finance-page-title" className="text-3xl font-medium tracking-tight">{current.title}</h1>
            <p className="text-muted-foreground">{current.description}</p>
          </div>
          {incomeRecords && incomeSeason && <RegisterIncomeDialog seasonCode={incomeSeason} />}
        </div>
      </div>
      {page === "overview" && session.access === "allowed" && (session.capabilities?.financing || session.capabilities?.purchaseRegister) && <SeasonFinanceSummary
        financing={session.capabilities?.financing ? session.financing : undefined}
        purchases={session.capabilities?.purchaseRegister ? session.purchases ? session.purchases.register ?? [] : null : undefined}
      />}
      {page !== "overview" && page !== "budgets" && session.profiles?.includes("head_of_finance") && <Button asChild variant="outline"><Link to="/finance/funding-applications">Funding applications</Link></Button>}
      {page === "overview" && session.capabilities?.financing ? <FinancingIncome financing={session.financing} canManage={Boolean(session.capabilities?.manageFunding)} /> : null}
      {incomeRecords && incomeSeason && <IncomeReceiptList records={incomeRecords} seasonCode={incomeSeason} />}
      {page === "overview" && session.capabilities?.purchaseRegister ? <section aria-labelledby="spending-purchases-title" className="space-y-4"><h2 id="spending-purchases-title" className="text-xl font-medium">Spend</h2><SpendingPurchases /></section> : page === "budgets" ? (
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
