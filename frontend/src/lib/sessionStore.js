// frontend/src/lib/sessionStore.js
const TOKEN_KEY = "ndisnotes_token";
const USER_KEY = "ndisnotes_user";
const LAST_ACTIVE_KEY = "ndisnotes_last_active";

export const sessionStore = {
  getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  },
  setToken(token) {
    if (!token) return;
    sessionStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  },

  getUser() {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser(user) {
    if (!user) return;
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearUser() {
    sessionStorage.removeItem(USER_KEY);
  },

  getLastActive() {
    const v = sessionStorage.getItem(LAST_ACTIVE_KEY);
    return v ? Number(v) : 0;
  },
  setLastActive(ts = Date.now()) {
    sessionStorage.setItem(LAST_ACTIVE_KEY, String(ts));
  },
  clearLastActive() {
    sessionStorage.removeItem(LAST_ACTIVE_KEY);
  },

  clearAll() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(LAST_ACTIVE_KEY);
  },
};
