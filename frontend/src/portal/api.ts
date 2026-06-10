import { API_URL } from "../api";
import { getPortalToken } from "./session";

export async function portalFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getPortalToken();
  const { headers: incomingHeaders, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(incomingHeaders || {}),
    },
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export async function portalOpenPdf(path: string): Promise<void> {
  const token = getPortalToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error(`Failed to open PDF (${res.status})`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked");
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
