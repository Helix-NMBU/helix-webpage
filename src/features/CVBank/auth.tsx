import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactElement,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CVBankUser } from "./session";
import { supabase } from "../../libs/lib/utils";

type CVBankAuthContextValue = {
  user: CVBankUser | null;
  isAuthenticated: boolean;
  login: (user: CVBankUser) => void;
  logout: () => void;
};

const CVBankAuthContext = createContext<CVBankAuthContextValue | undefined>(
  undefined,
);

export function CVBankAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CVBankUser | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const sync = async () => {
      const { data } = await client.auth.getSession();
      const authUser = data.session?.user;
      setUser(authUser?.email ? {
        email: authUser.email,
        name: authUser.user_metadata.full_name ?? authUser.user_metadata.name ?? authUser.email,
        picture: authUser.user_metadata.avatar_url ?? authUser.user_metadata.picture,
      } : null);
    };
    void sync();
    const { data } = client.auth.onAuthStateChange(() => void sync());
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<CVBankAuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user?.email),
      login: (nextUser) => setUser(nextUser),
      logout: () => { void supabase?.auth.signOut(); setUser(null); },
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
