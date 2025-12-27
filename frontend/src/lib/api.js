export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, options);

  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { data = await res.json(); } catch { data = null; }
  }

  const authHeader =
    options?.headers &&
    (options.headers.Authorization || options.headers.authorization);

  if (res.status === 401 && authHeader) {
    window.dispatchEvent(
      new CustomEvent("ndis:unauthorized", {
        detail: { message: (data && (data.error || data.message)) || "Session expired. Please log in again." },
      })
    );
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetchBlob(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
  });

  if (!res.ok) {
    // try to read JSON error
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.error || data?.message || msg;
    } catch {
      try {
        const txt = await res.text();
        if (txt) msg = txt;
      } catch {}
    }
    throw new Error(msg);
  }

  return res.blob();
}
