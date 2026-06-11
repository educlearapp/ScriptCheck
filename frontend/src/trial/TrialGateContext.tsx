import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import UpgradeModal from "./UpgradeModal";

type TrialGateContextValue = {
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  gateProductionAction: (action?: () => void) => boolean;
  showUpgradeModal: () => void;
};

const TrialGateContext = createContext<TrialGateContextValue | null>(null);

export function TrialGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isTrial = user?.isTrial ?? user?.subscriptionPlan === "TRIAL";
  const isExpired = user?.isExpired ?? false;
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const showUpgradeModal = useCallback(() => {
    setUpgradeOpen(true);
  }, []);

  const daysRemaining = user?.daysRemaining ?? null;

  const gateProductionAction = useCallback(
    (action?: () => void) => {
      if (isTrial || isExpired) {
        setUpgradeOpen(true);
        return false;
      }
      action?.();
      return true;
    },
    [isTrial, isExpired]
  );

  const value = useMemo(
    () => ({ isTrial, isExpired, daysRemaining, gateProductionAction, showUpgradeModal }),
    [isTrial, isExpired, daysRemaining, gateProductionAction, showUpgradeModal]
  );

  return (
    <TrialGateContext.Provider value={value}>
      {children}
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </TrialGateContext.Provider>
  );
}

export function useTrialGate() {
  const ctx = useContext(TrialGateContext);
  if (!ctx) {
    throw new Error("useTrialGate must be used within TrialGateProvider");
  }
  return ctx;
}
