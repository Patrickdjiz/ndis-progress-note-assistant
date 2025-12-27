export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);

  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  // ✅ token expiry / unauthorized handling
  if (res.status === 401) {
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

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  // Return parsed JSON or null
  return data;
}
