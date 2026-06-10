import { getAuthToken } from "./auth/session";

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const { headers: incomingHeaders, body, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    body,
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

export async function apiDownloadPath(
  path: string,
  filename: string
): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function apiDownload(
  path: string,
  filename: string
): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Download failed (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function apiBlobUrl(path: string): Promise<string> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function apiUpload<T = unknown>(
  path: string,
  files: File[],
  onProgress?: (percent: number) => void
): Promise<T> {
  const token = getAuthToken();
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      const text = xhr.responseText;
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
        return;
      }

      const message =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : `Upload failed (${xhr.status})`;
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Upload failed — network error"));
    xhr.send(formData);
  });
}

export async function apiOpenPdf(path: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Failed to open PDF (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // keep default
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked — allow pop-ups to print reports");
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
