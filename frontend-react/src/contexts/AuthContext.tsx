import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { apiLogin } from "@/lib/api";

interface AuthState {
  token: string;
  isAdmin: boolean;
  clientId: string;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setClientId: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SS_TOKEN    = "sapscope_token";
const SS_ADMIN    = "sapscope_is_admin";
const SS_CLIENT   = "sapscope_client";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token:    sessionStorage.getItem(SS_TOKEN)    || "",
    isAdmin:  sessionStorage.getItem(SS_ADMIN)    === "1",
    clientId: sessionStorage.getItem(SS_CLIENT)   || "",
  });

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    sessionStorage.setItem(SS_TOKEN,  res.token);
    sessionStorage.setItem(SS_ADMIN,  res.is_admin ? "1" : "0");
    setState(s => ({ ...s, token: res.token, isAdmin: res.is_admin }));
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SS_TOKEN);
    sessionStorage.removeItem(SS_ADMIN);
    sessionStorage.removeItem(SS_CLIENT);
    setState({ token: "", isAdmin: false, clientId: "" });
  }, []);

  const setClientId = useCallback((id: string) => {
    sessionStorage.setItem(SS_CLIENT, id);
    setState(s => ({ ...s, clientId: id }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setClientId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
