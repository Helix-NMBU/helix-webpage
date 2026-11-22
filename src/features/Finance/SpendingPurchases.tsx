import { useEffect, useRef, useState } from "react";
import { FinanceContentSkeleton } from "../MemberPlatform/LoadingSkeletons";
import { useFinanceAccess } from "../MemberPlatform/FinanceAccess";
import { PurchaseRegister } from "./PurchaseRegister";

/** Reuses the Finance-only register and its invoice/payment authorization. */
export function SpendingPurchases() {
  const session = useFinanceAccess();
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const loadedAll = useRef(false);
  const purchasesVersion = session.purchases?.viewVersion ?? null;
  const canRead = session.access === "allowed" && session.capabilities?.purchaseRegister === true;
  useEffect(() => {
    if (!canRead) { loadedAll.current = false; return; }
    if (session.viewVersion === null || (loadedAll.current && purchasesVersion === session.viewVersion)) return;
    loadedAll.current = true;
    void session.loadPage("purchases", { unpaidOnly: false });
  }, [canRead, purchasesVersion, session.loadPage, session.viewVersion]);
  if (!canRead) return null;
  if (!session.purchases) return <FinanceContentSkeleton page="purchases" label="Loading registered purchases" />;
  const register = session.purchases.register ?? [];
  return <PurchaseRegister
    presentation="table"
    register={register}
    unpaidCount={session.purchases.unpaidCount ?? register.filter(row => row.unpaid).length}
    unpaidOnly={unpaidOnly}
    today={session.today ?? ""}
    canAct={session.capabilities?.paymentsVoidReview === true}
    onAccessEnded={session.retry}
    onToggleUnpaid={setUnpaidOnly}
    onMutate={session.mutate}
    onChanged={() => session.loadPage("purchases", { unpaidOnly: false })}
  />;
}
