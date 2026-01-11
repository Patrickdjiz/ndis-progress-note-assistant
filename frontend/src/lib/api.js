// frontend/src/lib/api.js
import { sessionStore } from "./sessionStore";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

let handlingUnauthorized = false;

// Endpoints that should NOT automatically attach Bearer tokens
// (prevents stale token interfering with login/reset flows)
function shouldSkipAuth(path) {
  return (
    path === "/api/login" ||
    (path.startsWith("/api/auth/") && path !== "/api/auth/me")
  );
}

async function parseJsonSafe(res) {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function clearAuthEverywhere() {
  try {
    sessionStore.clearAll?.();
  } catch {}

  try {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  } catch {}
}


function forceRelogin(message) {
  // prevent multi-redirect storms if multiple requests 401 at once
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;

  try {
    sessionStorage.setItem("flash_login_msg", message);
  } catch {}

  clearAuthEverywhere();

  // Hard redirect resets all React state no matter where token is stored
  if (window.location.pathname !== "/") {
    window.location.assign("/");
  } else {
    // already on login page; allow future 401 handling again shortly
    setTimeout(() => {
      handlingUnauthorized = false;
    }, 300);
  }
}

function maybeDispatchUnauthorized(path, res, hasAuth, data) {
  // Only treat as "session expired" if:
  // - it's a 401
  // - the request was supposed to be authenticated
  // - and it's NOT a skip-auth endpoint like /api/login or /api/auth/*
  if (res.status === 401 && hasAuth && !shouldSkipAuth(path)) {
    const message =
      (data && (data.error || data.message)) ||
      "Session expired. Please log in again.";

    // keep your event (handy if you want to show toast etc)
    window.dispatchEvent(
      new CustomEvent("ndis:unauthorized", {
        detail: { message },
      })
    );

    // also enforce logout + redirect globally
    forceRelogin(message);
  }
}

function withAuth(path, options = {}) {
  const headers = new Headers(options.headers || {});

  // If caller already provided Authorization, keep it.
  const alreadyHasAuth =
    headers.has("Authorization") || headers.has("authorization");

  // If this is a skip-auth endpoint, never add token.
  if (shouldSkipAuth(path)) {
    return {
      options: { ...options, headers },
      hasAuth: alreadyHasAuth, // only true if caller explicitly set it
    };
  }

  const token = sessionStore.getToken?.();

  if (token && !alreadyHasAuth) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return {
    options: { ...options, headers },
    hasAuth: !!token || alreadyHasAuth,
  };
}

export async function apiFetch(path, options = {}) {
  const { options: opts, hasAuth } = withAuth(path, options);

  const res = await fetch(`${API_BASE_URL}${path}`, opts);
  const data = await parseJsonSafe(res);

  maybeDispatchUnauthorized(path, res, !!hasAuth, data);

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
  const { options: opts, hasAuth } = withAuth(path, options);

  const res = await fetch(`${API_BASE_URL}${path}`, opts);

  const data = await parseJsonSafe(res);
  maybeDispatchUnauthorized(path, res, !!hasAuth, data);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return res.blob();
}
