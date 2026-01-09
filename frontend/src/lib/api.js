// frontend/src/lib/api.js
import { sessionStore } from "./sessionStore";

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

function maybeDispatchUnauthorized(res, hasAuth, data) {
  if (res.status === 401 && hasAuth) {
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

function withAuth(options = {}) {
  const token = sessionStore.getToken();
  const headers = new Headers(options.headers || {});

  // If caller already provided Authorization, keep it.
  const alreadyHasAuth = headers.has("Authorization") || headers.has("authorization");

  if (token && !alreadyHasAuth) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return {
    options: { ...options, headers },
    hasAuth: !!token || alreadyHasAuth,
  };
}

export async function apiFetch(path, options = {}) {
  const { options: opts, hasAuth } = withAuth(options);

  const res = await fetch(`${API_BASE_URL}${path}`, opts);
  const data = await parseJsonSafe(res);

  maybeDispatchUnauthorized(res, !!hasAuth, data);

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
  const { options: opts, hasAuth } = withAuth(options);

  const res = await fetch(`${API_BASE_URL}${path}`, opts);

  const data = await parseJsonSafe(res);
  maybeDispatchUnauthorized(res, !!hasAuth, data);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return res.blob();
}
