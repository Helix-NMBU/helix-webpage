import { useFinanceRefresh } from "./use-finance-refresh";
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Skeleton } from "@libs/components/ui/skeleton";
import { FinanceGate, useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { useNotify } from "../MemberPlatform/MemberNotifications";
import { useWorkspace } from "../Workspace/WorkspaceContext";
import { DepartmentBudgetProjects } from "./DepartmentBudgetProjects";
import { useBudgetReviewSignals } from "./use-budget-review-signals";
import { approvedDepartmentItems, dashboardDepartments } from "./budget-dashboard-model";
import { canonicalNokOre, projectBudgetMoney } from "./project-budget-diff";
import { departmentBudgetPath, financeRoutes } from "./routes";
import { DepartmentBudgetChart } from "./DepartmentBudgetChart";

function DepartmentBudgetContent() {
  useFinanceRefresh();
  const { budgetDepartmentSlug = "" } = useParams();
  const session = useFinanceAccess();
  const workspace = useWorkspace()?.data;
  const notify = useNotify();
  const version = session.budgets?.viewVersion ?? null;
  useEffect(() => {
    if (session.access === "allowed" && session.viewVersion !== null && version !== session.viewVersion) void session.loadPage("budgets");
  }, [session.access, session.loadPage, session.viewVersion, version]);
  const department = session.budgets ? dashboardDepartments(session.budgets, workspace?.departments.map(department => department.name)).find(department => departmentBudgetPath(department.name) === `${financeRoutes.budgets}/${budgetDepartmentSlug}`) : undefined;
  useEffect(() => {
    if (session.budgets && !department) notify("Department budget not found", "Open a department from Budgets & Financing.", { variant: "error", href: financeRoutes.budgets });
  }, [department, notify, session.budgets]);
  const directoryDepartment = workspace?.departments.find(item => item.name === department?.name);
  const signals = useBudgetReviewSignals({ departmentId: directoryDepartment?.id, includeDetails: true });
  if (!session.budgets) return <Skeleton aria-label="Loading department budget" className="h-96 w-full rounded-xl" />;
  if (!department) return <Navigate to={financeRoutes.budgets} replace />;
  const data = session.budgets;
  const entries = approvedDepartmentItems(department, data.budgetStatus);
  const pendingPackage = signals.data?.queue.packages.find(packet => packet.status === "finance_pending" && packet.snapshot.departmentId === directoryDepartment?.id && packet.snapshot.seasonCode === data.seasonCode);

  const privateReview = session.capabilities?.purchaseRegister === true;
  const financeReviewer = session.profiles.some(profile => profile === "finance" || profile === "head_of_finance");
  const systems = data.choices.systems.map(system => ({ id: system.id, code: system.code, name: system.name, departmentName: data.departments.find(department => department.departmentKey === system.departmentKey)?.name ?? "" }));
  return <section className="mx-auto w-full max-w-6xl space-y-8 px-2 py-8 sm:px-6" aria-labelledby="department-budget-title">
    <div className="space-y-2"><p className="text-sm text-muted-foreground">{data.seasonCode} · Department budget</p><h1 id="department-budget-title" className="text-3xl font-medium tracking-tight">{department.name}</h1><p className="text-muted-foreground">Approved project allocations and recorded purchases. Changes remain separate until approved.</p></div>
    <DepartmentBudgetChart department={department} budgetStatus={data.budgetStatus} seasonCode={data.seasonCode} pendingPackage={pendingPackage} />
    <DepartmentBudgetProjects departmentId={directoryDepartment?.id} departmentName={department.name} seasonCode={data.seasonCode ?? ""} projects={workspace?.projects ?? []} entries={entries} systems={systems} summaries={signals.data?.projects.budgets} details={signals.data?.details} pendingPackage={pendingPackage} loadingChanges={signals.loading} canReviewDecision={privateReview && financeReviewer} onChanged={() => session.loadPage("budgets")} onAccessEnded={session.retry} />
    {canonicalNokOre(department.unbudgetedNok) > 0n ? <p className="text-sm text-muted-foreground">Unbudgeted purchases: {projectBudgetMoney(department.unbudgetedNok)}. These costs are included in recorded spending.</p> : null}
  </section>;
}
export default function DepartmentBudgetPage() {
  return <FinanceGate page="budgets"><DepartmentBudgetContent /></FinanceGate>;
}
