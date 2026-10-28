export const financeRoutes = {
  overview: "/finance",
  purchases: "/finance/purchases",
  budgets: "/finance/budgets",
  financing: "/finance/financing",
} as const;

export type FinancePageId = keyof typeof financeRoutes;

const legacyDestinations: Record<string, string> = {
  "/teams/finance": financeRoutes.overview,
  "/teams/finance/budget": financeRoutes.budgets,
  "/teams/finance/expenses": financeRoutes.purchases,
};

export function financePageTitle(pathname: string): string | null {
  if (pathname === financeRoutes.overview) return "Overview";
  if (pathname === financeRoutes.purchases) return "Purchases";
  if (pathname === financeRoutes.budgets) return "Budgets";
  if (pathname === financeRoutes.financing) return "Financing";
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
  if (Object.values(financeRoutes).includes(pathname as (typeof financeRoutes)[FinancePageId])) return `${pathname}${search}${hash}`;
  return null;
}
