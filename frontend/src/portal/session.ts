import type { PortalSession } from "../types";

const PORTAL_TOKEN_KEY = "scriptcheck_portal_token";
const PORTAL_SESSION_KEY = "scriptcheck_portal_session";

export function getPortalToken(): string | null {
  return localStorage.getItem(PORTAL_TOKEN_KEY);
}

export function getPortalSession(): PortalSession | null {
  const raw = localStorage.getItem(PORTAL_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalSession;
  } catch {
    return null;
  }
}

export function setPortalSession(session: PortalSession) {
  localStorage.setItem(PORTAL_TOKEN_KEY, session.token);
  localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session));
}

export function clearPortalSession() {
  localStorage.removeItem(PORTAL_TOKEN_KEY);
  localStorage.removeItem(PORTAL_SESSION_KEY);
}
