const TOKEN_KEY = "ndisnotes_token";
const USER_KEY = "ndisnotes_user";

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

  clearAll() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};
