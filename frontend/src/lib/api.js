// src/lib/api.js
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiFetch(path, options = {}) {
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;

  const res = await fetch(url, options);

  // Try read JSON if possible
  let data = null;
  try {
    data = await res.clone().json();
  } catch {
    // ignore (non-JSON response)
  }

  // ✅ 401 global hook
  if (res.status === 401) {
    const msg =
      (data && (data.error || data.message)) ||
      "Session expired. Please log in again.";
    window.dispatchEvent(
      new CustomEvent("ndis:unauthorized", { detail: { message: msg } })
    );
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
