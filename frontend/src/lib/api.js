// src/lib/api.js
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

async function parseJsonSafe(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function maybeDispatchUnauthorized(res, options, data) {
  const authHeader =
    options?.headers &&
    (options.headers.Authorization || options.headers.authorization);

  if (res.status === 401 && authHeader) {
    window.dispatchEvent(
      new CustomEvent("ndis:unauthorized", {
        detail: {
          message:
            (data && (data.error || data.message)) ||
            "Session expired. Please log in again.",
        },
      })
    );
  }
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);
  const data = await parseJsonSafe(res);

  maybeDispatchUnauthorized(res, options, data);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function apiFetchBlob(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);

  // try json error first
  const data = await parseJsonSafe(res);
  maybeDispatchUnauthorized(res, options, data);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return res.blob();
}
