import { createContext, useContext, type ReactNode } from "react";
import type { MemberAccount } from "./account";

const AccountContext = createContext<MemberAccount | null>(null);

export function MemberAccountProvider({
  account,
  children,
}: {
  account: MemberAccount | null;
  children: ReactNode;
}) {
  return (
    <AccountContext.Provider value={account}>
      {children}
    </AccountContext.Provider>
  );
}

export function useMemberAccount() {
  return useContext(AccountContext);
}
