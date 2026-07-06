import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactElement,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CVBankUser, readStoredCVBankUser, writeStoredCVBankUser } from "./session";

type CVBankAuthContextValue = {
  user: CVBankUser | null;
  isAuthenticated: boolean;
  login: (user: CVBankUser) => void;
  logout: () => void;
};

const STORAGE_KEY = "cvbank:user";

const CVBankAuthContext = createContext<CVBankAuthContextValue | undefined>(
  undefined,
);

export function CVBankAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CVBankUser | null>(() => readStoredCVBankUser(localStorage));

  useEffect(() => {
    writeStoredCVBankUser(localStorage, user);
  }, [user]);

  const value = useMemo<CVBankAuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user?.email),
      login: (nextUser) => setUser(nextUser),
      logout: () => setUser(null),
    }),
    [user],
  );

  return (
    <CVBankAuthContext.Provider value={value}>
      {children}
    </CVBankAuthContext.Provider>
  );
}

export function useCVBankAuth() {
  const ctx = useContext(CVBankAuthContext);
  if (!ctx) throw new Error("useCVBankAuth must be used within CVBankAuthProvider");
  return ctx;
}

export function RequireCVBankAuth({ children }: { children: ReactElement }) {
  const { isAuthenticated } = useCVBankAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/cv-bank/login" replace state={{ from: location }} />;
  }

  return children;
}
