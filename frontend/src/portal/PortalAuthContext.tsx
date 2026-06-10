import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PortalSession, PortalUserType } from "../types";
import { portalFetch } from "./api";
import {
  clearPortalSession,
  getPortalSession,
  setPortalSession as persistSession,
} from "./session";

type PortalAuthContextValue = {
  session: PortalSession | null;
  isAuthenticated: boolean;
  activeLearnerId: string | null;
  setActiveLearnerId: (id: string) => void;
  login: (data: PortalSession) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(() => getPortalSession());
  const [activeLearnerId, setActiveLearnerId] = useState<string | null>(
    () => getPortalSession()?.activeLearnerId ?? getPortalSession()?.learners[0]?.id ?? null
  );

  const login = useCallback((data: PortalSession) => {
    persistSession(data);
    setSession(data);
    setActiveLearnerId(data.activeLearnerId ?? data.learners[0]?.id ?? null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await portalFetch("/portal/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    clearPortalSession();
    setSession(null);
    setActiveLearnerId(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await portalFetch<{
      portalAccountId: string;
      portalType: PortalUserType;
      email: string | null;
      fullName: string | null;
      workspace: { id: string; name: string; slug: string };
      learners: PortalSession["learners"];
    }>("/portal/auth/me");

    if (!session) return;

    const updated: PortalSession = {
      ...session,
      learners: profile.learners,
      workspaceName: profile.workspace.name,
      workspaceSlug: profile.workspace.slug,
    };
    persistSession(updated);
    setSession(updated);
  }, [session]);

  useEffect(() => {
    if (session && !activeLearnerId && session.learners[0]) {
      setActiveLearnerId(session.learners[0].id);
    }
  }, [session, activeLearnerId]);

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: !!session?.token,
      activeLearnerId,
      setActiveLearnerId,
      login,
      logout,
      refreshProfile,
    }),
    [session, activeLearnerId, login, logout, refreshProfile]
  );

  return (
    <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}
