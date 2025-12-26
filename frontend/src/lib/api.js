// src/lib/api.js
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

function hasAuthHeader(headers) {
  if (!headers) return false;

  // Headers instance (fetch can accept this)
  if (headers instanceof Headers) {
    return headers.has("Authorization") || headers.has("authorization");
  }

  // Plain object
  return Boolean(headers.Authorization || headers.authorization);
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore non-JSON
  }

  // ✅ Token expiry handling (only when request had an auth header)
  if (res.status === 401 && hasAuthHeader(options.headers)) {
    const msg =
      (data && (data.error || data.message)) ||
      "Your session has expired. Please log in again.";

    window.dispatchEvent(
      new CustomEvent("auth:expired", { detail: { message: msg } })
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
