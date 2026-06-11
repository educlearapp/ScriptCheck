import { apiFetch } from "../api";
import type { SubscriptionInfo } from "../types/phase2";

export function fetchSubscriptionInfo() {
  return apiFetch<SubscriptionInfo>("/subscription");
}

export function upgradeSubscription() {
  return apiFetch<SubscriptionInfo>("/subscription/upgrade", { method: "POST" });
}

export function downgradeSubscription() {
  return apiFetch<SubscriptionInfo>("/subscription/downgrade", { method: "POST" });
}
