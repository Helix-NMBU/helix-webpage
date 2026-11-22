import { departmentPath } from "../Workspace/types.js";

export const financeRoutes = {
  overview: "/finance",
  purchases: "/departments/management/purchases",
  budgets: "/finance/budgets",
  financing: "/finance/financing",
} as const;

export const financeFundingPath = "/finance/funding";

export function departmentBudgetPath(name: string): string {
  return `${financeRoutes.budgets}/${departmentPath(name).slice("/departments/".length)}`;
}

export type FinancePageId = keyof typeof financeRoutes;

const legacyDestinations: Record<string, string> = {
  "/finance/purchases": financeRoutes.purchases,
  "/finance/financing": financeRoutes.budgets,
  "/teams/finance": financeRoutes.overview,
  "/teams/finance/budget": financeRoutes.budgets,
  "/teams/finance/expenses": financeRoutes.purchases,
};

export function financePageTitle(pathname: string): string | null {
  if (pathname === financeFundingPath) return "Manage financing";
  if (pathname === financeRoutes.overview) return "Spending";
  if (pathname === financeRoutes.purchases) return "Purchases";
  if (pathname === financeRoutes.budgets) return "Budgets & Financing";
  if (pathname === financeRoutes.financing) return "Budgets & Financing";
  return null;
}

export function financeReturnPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  const hashAt = value.indexOf("#");
  const hash = hashAt === -1 ? "" : value.slice(hashAt);
  const beforeHash = hashAt === -1 ? value : value.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const search = queryAt === -1 ? "" : beforeHash.slice(queryAt);
  const pathname = (queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)).replace(/\/+$/, "") || "/";
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) return null;
  const legacy = legacyDestinations[pathname];
  if (legacy) return `${legacy}${search}${hash}`;
  if (pathname.startsWith("/teams/finance/")) return `${financeRoutes.overview}${search}${hash}`;
  if (pathname === financeFundingPath) return `${pathname}${search}${hash}`;
  if (/^\/finance\/budgets\/[a-z0-9-]+$/.test(pathname)) return `${pathname}${search}${hash}`;
  if (Object.values(financeRoutes).includes(pathname as (typeof financeRoutes)[FinancePageId])) return `${pathname}${search}${hash}`;
  return null;
}
