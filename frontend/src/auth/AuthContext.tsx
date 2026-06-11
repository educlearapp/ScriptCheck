import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../api";
import type { AuthSession, AuthUser, WorkspaceSummary } from "../types";
import {
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  getWorkspaces,
  setAuthSession,
} from "./session";

type AuthContextValue = {
  user: AuthUser | null;
  workspaces: WorkspaceSummary[];
  isAuthenticated: boolean;
  authReady: boolean;
  login: (session: AuthSession) => void;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    const storedUser = getAuthUser();

    if (token && storedUser) {
      setUser(storedUser);
      setWorkspaces(getWorkspaces());
    } else {
      clearAuthSession();
      setUser(null);
      setWorkspaces([]);
    }

    setAuthReady(true);
  }, []);

  const login = useCallback((session: AuthSession) => {
    setAuthSession(session);
    setUser(session.user);
    setWorkspaces(session.workspaces);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getAuthToken()) {
        await apiFetch("/auth/logout", { method: "POST" });
      }
    } catch {
      // Clear local session even if logout API fails
    } finally {
      clearAuthSession();
      setUser(null);
      setWorkspaces([]);
    }
  }, []);

  const applySession = useCallback((session: AuthSession) => {
    setAuthSession(session);
    setUser(session.user);
    setWorkspaces(session.workspaces);
  }, []);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const session = await apiFetch<AuthSession>("/auth/switch-workspace", {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      });
      applySession(session);
    },
    [applySession]
  );

  const refreshUser = useCallback(async () => {
    const refreshed = await apiFetch<AuthUser>("/auth/me");
    const currentWorkspaces = getWorkspaces();
    setUser(refreshed);
    localStorage.setItem("scriptcheck_user", JSON.stringify(refreshed));
    setWorkspaces(currentWorkspaces);
  }, []);

  const value = useMemo(
    () => ({
      user,
      workspaces,
      authReady,
      isAuthenticated: authReady && Boolean(user && getAuthToken()),
      login,
      logout,
      switchWorkspace,
      refreshUser,
    }),
    [user, workspaces, authReady, login, logout, switchWorkspace, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
