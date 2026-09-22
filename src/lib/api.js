const API_BASE = (window.GALLERY_API_BASE || "").replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || "Respons server tidak valid." };
  }

  if (!response.ok) {
    const detail = data.detail?.message ? ` (${data.detail.message})` : "";
    const hint = data.detail?.hint ? ` ${data.detail.hint}` : "";
    const error = new Error(`${data.error || "Terjadi kesalahan."}${detail}${hint}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

export function createSyncChannel() {
  return "BroadcastChannel" in window
    ? new BroadcastChannel("gallery-of-us-updates")
    : null;
}
