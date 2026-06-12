import { apiFetch } from "../api";
import type { WorkspaceRole } from "../types";

export type SuperAdminOverview = {
  totalWorkspaces: number;
  totalUsers: number;
  activeUsers: number;
  trialUsers: number;
  expiredTrials: number;
  recentLogins: Array<{
    userId: string;
    fullName: string;
    email: string;
    lastLoginAt: string;
  }>;
};

export type SuperAdminWorkspace = {
  id: string;
  name: string;
  slug: string;
  type: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  trialExpiresAt: string | null;
  userCount: number;
  isActive: boolean;
  createdAt: string;
};

export type SuperAdminUser = {
  id: string;
  fullName: string;
  email: string;
  roles: WorkspaceRole[];
  workspaces: Array<{ id: string; name: string }>;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export function fetchSuperAdminOverview() {
  return apiFetch<SuperAdminOverview>("/super-admin/overview");
}

export function fetchSuperAdminWorkspaces(params: {
  search?: string;
  trialStatus?: string;
  active?: string;
}) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.trialStatus) q.set("trialStatus", params.trialStatus);
  if (params.active) q.set("active", params.active);
  const query = q.toString();
  return apiFetch<{ workspaces: SuperAdminWorkspace[] }>(
    `/super-admin/workspaces${query ? `?${query}` : ""}`
  );
}

export function fetchSuperAdminUsers(params: {
  search?: string;
  workspaceSearch?: string;
  role?: string;
  active?: string;
  trialStatus?: string;
}) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.workspaceSearch) q.set("workspaceSearch", params.workspaceSearch);
  if (params.role) q.set("role", params.role);
  if (params.active) q.set("active", params.active);
  if (params.trialStatus) q.set("trialStatus", params.trialStatus);
  const query = q.toString();
  return apiFetch<{ users: SuperAdminUser[] }>(
    `/super-admin/users${query ? `?${query}` : ""}`
  );
}
