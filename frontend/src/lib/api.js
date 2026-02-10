// frontend/src/lib/api.js
import { sessionStore } from "./sessionStore";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "https://api.ndisnotes.com" : "http://localhost:5000");

let handlingUnauthorized = false;
let handlingPrivacyRequired = false;
let handlingMustChangePassword = false;

function forceMustChangePassword(message) {
  if (handlingMustChangePassword) return;
  handlingMustChangePassword = true;

  window.dispatchEvent(
    new CustomEvent("ndis:must_change_password", {
      detail: {
        message: message || "You must change your password before continuing.",
      },
    })
  );

  setTimeout(() => {
    handlingMustChangePassword = false;
  }, 500);
}

function maybeDispatchMustChangePassword(path, res, hasAuth, data) {
  if (res.status === 403 && hasAuth && !shouldSkipAuth(path)) {
    if ((data && data.code) === "MUST_CHANGE_PASSWORD") {
      const message =
        (data && (data.error || data.message)) ||
        "You must change your password before continuing.";
      forceMustChangePassword(message);
    }
  }
}


// Endpoints that should NOT automatically attach Bearer tokens
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
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;

  try {
    sessionStorage.setItem("flash_login_msg", message);
  } catch {}

  clearAuthEverywhere();

  if (window.location.pathname !== "/") {
    window.location.assign("/");
  } else {
    setTimeout(() => {
      handlingUnauthorized = false;
    }, 300);
  }
}

function forcePrivacyNotice(message, policyVersion) {
  // prevent redirect storms if multiple requests 428 at once
  if (handlingPrivacyRequired) return;
  handlingPrivacyRequired = true;

  window.dispatchEvent(
    new CustomEvent("ndis:privacy_required", {
      detail: {
        message: message || "Privacy notice acceptance required before continuing.",
        policyVersion: policyVersion || null,
      },
    })
  );

  // allow future 428 handling again shortly
  setTimeout(() => {
    handlingPrivacyRequired = false;
  }, 500);
}

function maybeDispatchPrivacyRequired(path, res, hasAuth, data) {
  // Only treat as privacy gate if:
  // - it's a 428
  // - request was authenticated
  // - not a skip-auth endpoint
  if (res.status === 428 && hasAuth && !shouldSkipAuth(path)) {
    const message =
      (data && (data.error || data.message)) ||
      "Privacy notice acceptance required before continuing.";

    const policyVersion =
      (data && (data.policyVersion || data.currentVersion)) || null;

    forcePrivacyNotice(message, policyVersion);
  }
}

function maybeDispatchUnauthorized(path, res, hasAuth, data) {
  if (res.status === 401 && hasAuth && !shouldSkipAuth(path)) {
    const message =
      (data && (data.error || data.message)) ||
      "Session expired. Please log in again.";

    window.dispatchEvent(
      new CustomEvent("ndis:unauthorized", {
        detail: { message },
      })
    );

    forceRelogin(message);
  }
}

function withAuth(path, options = {}) {
  const headers = new Headers(options.headers || {});

  const alreadyHasAuth =
    headers.has("Authorization") || headers.has("authorization");

  if (shouldSkipAuth(path)) {
    return {
      options: { ...options, headers },
      hasAuth: alreadyHasAuth,
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

  // ✅ handle 428 before 401
  maybeDispatchPrivacyRequired(path, res, !!hasAuth, data);
  maybeDispatchMustChangePassword(path, res, !!hasAuth, data);
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

  // ✅ handle 428 before 401
    maybeDispatchPrivacyRequired(path, res, !!hasAuth, data);
  maybeDispatchMustChangePassword(path, res, !!hasAuth, data);
  maybeDispatchUnauthorized(path, res, !!hasAuth, data);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return res.blob();
}
