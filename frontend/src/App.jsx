// src/App.jsx
import { useEffect, useMemo, useState } from "react";
import { NavLink, Routes, Route, Navigate, useLocation } from "react-router-dom";
import GenerateNotePage from "./pages/GenerateNotePage.jsx";
import NotesDashboardPage from "./pages/NotesDashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UsersAdminPage from "./pages/UsersAdminPage.jsx";
import OwnerConsolePage from "./pages/OwnerConsolePage.jsx";
import MyNotesPage from "./pages/MyNotesPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import PrivacyNoticePage from "./pages/PrivacyNoticePage.jsx";
import { sessionStore } from "./lib/sessionStore";
import { getJwtExpMs } from "./lib/jwt";
import { apiFetch } from "./lib/api";
import AuditLogPage from "./pages/AuditLogPage.jsx";


const PRIMARY = "#111827";
const PRIMARY_TEXT = "#f9fafb";
const MUTED_TEXT = "#4b5563";
const IDLE_MS = 30 * 60 * 1000; // 30 minutes

function App() {
  const location = useLocation();

  const [auth, setAuth] = useState(() => {
    const token = sessionStore.getToken();
    const user = sessionStore.getUser();
    if (!token || !user) return null;

    const last = sessionStore.getLastActive();
    if (last && Date.now() - last > IDLE_MS) {
      sessionStore.clearAll();
      return null;
    }

    sessionStore.setLastActive(Date.now());
    return { token, user };
  });

  const [logoutMsg, setLogoutMsg] = useState("");
  const [privacyNonce, setPrivacyNonce] = useState(0);

  // Privacy / collection notice acceptance (versioned)
  const [privacy, setPrivacy] = useState({
    loading: false,
    accepted: true,
    currentVersion: null,
    acceptedVersion: null,
    acceptedAt: null,
    error: null,
  });


  useEffect(() => {
    const handler = (e) => {
      const msg = e?.detail?.message || "Session expired. Please log in again.";
      setAuth(null);
      sessionStore.clearAll();
      setLogoutMsg(msg);
    };

    window.addEventListener("ndis:unauthorized", handler);
    return () => window.removeEventListener("ndis:unauthorized", handler);
  }, []);

  useEffect(() => {
  const handler = (e) => {
    const policyVersion = e?.detail?.policyVersion || null;
    const message = e?.detail?.message || null;

    // flip the local privacy gate immediately
    setPrivacy((p) => ({
      ...p,
      loading: false,
      accepted: false,
      currentVersion: policyVersion || p.currentVersion,
      error: message || p.error,
    }));

    // force a refresh check (and cancels stale privacy GET)
    setPrivacyNonce((n) => n + 1);
  };

  window.addEventListener("ndis:privacy_required", handler);
  return () => window.removeEventListener("ndis:privacy_required", handler);
}, []);

useEffect(() => {
  const handler = (e) => {
    // Ensure the frontend state reflects reality
    patchAuthUser({ mustChangePassword: true });
  };

  window.addEventListener("ndis:must_change_password", handler);
  return () => window.removeEventListener("ndis:must_change_password", handler);
}, []);



  useEffect(() => {
    if (!auth?.token) return;

    let timer = null;

    const reset = () => {
      sessionStore.setLastActive(Date.now());
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setAuth(null);
        sessionStore.clearAll();
        setLogoutMsg("You were logged out due to inactivity.");
      }, IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));

    reset();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [auth?.token]);

  useEffect(() => {
    if (!auth?.token) return;

    const expMs = getJwtExpMs(auth.token);
    if (!expMs) return;

    const now = Date.now();
    if (expMs <= now) {
      setAuth(null);
      sessionStore.clearAll();
      setLogoutMsg("Session expired. Please log in again.");
      return;
    }

    const timeoutId = setTimeout(() => {
      setAuth(null);
      sessionStore.clearAll();
      setLogoutMsg("Session expired. Please log in again.");
    }, expMs - now);

    return () => clearTimeout(timeoutId);
  }, [auth?.token]);

  // Fetch whether user accepted current privacy notice version
  useEffect(() => {
    if (!auth?.token) {
      setPrivacy({
        loading: false,
        accepted: true, // logged-out users can view policy without accepting
        currentVersion: null,
        acceptedVersion: null,
        acceptedAt: null,
        error: null,
      });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setPrivacy((p) => ({ ...p, loading: true, error: null }));
        const data = await apiFetch("/api/privacy/consent", {
          headers: { Authorization: `Bearer ${auth.token}` },
        });

        if (cancelled) return;

        setPrivacy({
          loading: false,
          accepted: !!data?.accepted,
          currentVersion: data?.currentVersion || null,
          acceptedVersion: data?.acceptedVersion || null,
          acceptedAt: data?.acceptedAt || null,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;

        // Rollout-friendly behaviour:
        // - If the endpoint doesn't exist yet (404), don't lock everyone out.
        // - Otherwise fail-safe (require acceptance) if we can't verify.
        if (err?.status === 404) {
          setPrivacy({
            loading: false,
            accepted: true,
            currentVersion: null,
            acceptedVersion: null,
            acceptedAt: null,
            error:
              "Privacy consent endpoint not configured on the API yet. Acceptance is not being enforced.",
          });
        } else {
          setPrivacy({
            loading: false,
            accepted: false,
            currentVersion: null,
            acceptedVersion: null,
            acceptedAt: null,
            error: err?.message || "Unable to verify privacy notice acceptance.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth?.token, privacyNonce]);

  const handleLoginSuccess = (data) => {
    setLogoutMsg("");
    const authData = { token: data.token, user: data.user };
    setAuth(authData);

    sessionStore.setToken(data.token);
    sessionStore.setUser(data.user);
    sessionStore.setLastActive(Date.now());
  };

  const handleLogout = () => {
    setLogoutMsg("");
    setAuth(null);
    sessionStore.clearAll();
  };

  const patchAuthUser = (patch) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      sessionStore.setUser(next.user);
      return next;
    });
  };

  const footerLinkStyle = {
    fontSize: "0.8rem",
    color: "#6b7280",
    textDecoration: "none",
  };

  const FooterLinks = () => (
    <div
      style={{
        marginTop: "1rem",
        display: "flex",
        gap: "0.75rem",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      <NavLink to="/privacy" style={footerLinkStyle}>
        Privacy Policy
      </NavLink>

      {auth?.token && auth?.user?.role !== "OWNER" && (
        <NavLink to="/privacy/notice" style={footerLinkStyle}>
          Privacy & Collection Notice
        </NavLink>
      )}
    </div>
  );

  if (!auth) {
    const isLegal = location.pathname.startsWith("/privacy");

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: isLegal ? 900 : 420 }}>
          {logoutMsg && !isLegal && (
            <div
              style={{
                color: "#92400e",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "0.5rem",
                padding: "0.35rem 0.6rem",
                marginBottom: "0.75rem",
                fontSize: "0.85rem",
              }}
            >
              {logoutMsg}
            </div>
          )}

          <Routes>
            <Route
              path="/"
              element={<LoginPage onLoginSuccess={handleLoginSuccess} />}
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <FooterLinks />
        </div>
      </div>
    );
  }

  const { user, token } = auth;

  // ---- Gate conditions ----
// If we’re logged in and still checking privacy acceptance,
// don’t redirect anywhere yet (prevents account-page 428 chaos).
if (user?.role !== "OWNER" && privacy.loading) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        color: MUTED_TEXT,
      }}
    >
      Loading…
    </div>
  );
}

const mustAcceptPrivacy = user?.role !== "OWNER" && !privacy.accepted;
const mustChangePassword = !!user?.mustChangePassword;

// 1) Privacy gate FIRST, and if it's required, do NOT run password redirect yet.
if (mustAcceptPrivacy) {
  const okPaths = new Set(["/privacy", "/privacy/notice"]);
  if (!okPaths.has(location.pathname)) {
    return <Navigate to="/privacy/notice" replace />;
  }
} else if (mustChangePassword && location.pathname !== "/account") {
  // 2) Only after privacy is accepted
  return <Navigate to="/account" replace />;
}




  const linkStyle = ({ isActive }) => ({
    padding: "0.4rem 0.9rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 500,
    textDecoration: "none",
    border: "1px solid transparent",
    background: isActive ? PRIMARY : "transparent",
    color: isActive ? PRIMARY_TEXT : MUTED_TEXT,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
  });

  if (privacy.loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          color: MUTED_TEXT,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "1.5rem 1rem",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: "0.75rem",
          boxShadow: "0 10px 25px rgba(15, 23, 42, 0.06)",
          padding: "1.25rem 1.5rem 1.5rem",
          boxSizing: "border-box",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
            borderBottom: "1px solid #e5e7eb",
            paddingBottom: "0.75rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                color: PRIMARY,
              }}
            >
              NDIS AI Notes Assistant
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: MUTED_TEXT,
                marginTop: "0.15rem",
              }}
            >
              Logged in as <strong style={{ fontWeight: 600 }}>{user.fullName}</strong>{" "}
              <span style={{ color: "#9ca3af" }}>· {user.role}</span>
            </div>

            {user?.role !== "OWNER" && !privacy.accepted && (
              <div style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                <span style={{ color: "#b45309" }}>Privacy notice not accepted.</span>{" "}
                <NavLink to="/privacy/notice" style={{ color: "#1d4ed8" }}>
                  Review & accept
                </NavLink>
                {privacy.error && (
                  <div style={{ marginTop: "0.25rem", color: "#b91c1c" }}>
                    {privacy.error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <nav
              style={{
                display: "flex",
                gap: "0.35rem",
                flexWrap: "wrap",
                background: "#f3f4f6",
                padding: "0.25rem",
                borderRadius: "999px",
              }}
            >
              {user.role !== "OWNER" && (
                <NavLink to="/" end style={linkStyle}>
                  Generate note
                </NavLink>
              )}

              {user.role === "WORKER" && (
                <NavLink to="/my-notes" style={linkStyle}>
                  My notes
                </NavLink>
              )}

              {user.role === "ADMIN" && (
                <>
                  <NavLink to="/team" style={linkStyle}>
                    Team
                  </NavLink>
                  <NavLink to="/dashboard" style={linkStyle}>
                    Saved notes
                  </NavLink>
                </>
              )}

              {user.role === "OWNER" && (
                <NavLink to="/owner" style={linkStyle}>
                  Owner console
                </NavLink>
              )}

              <NavLink to="/account" style={linkStyle}>
                Account
              </NavLink>

              {(user.role === "ADMIN" || user.role === "OWNER") && (
                <NavLink to="/audit" style={linkStyle}>
                  Audit
                </NavLink>
              )}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: "0.35rem 0.85rem",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
                borderRadius: "999px",
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                color: MUTED_TEXT,
              }}
            >
              Log out
            </button>
          </div>
        </header>

        <Routes>
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route
  path="/privacy/notice"
  element={
    <PrivacyNoticePage
      token={token}
      currentVersion={privacy.currentVersion}
      onAccepted={(accepted) => {
        setPrivacy((p) => ({ ...p, ...accepted, loading: false, error: null }));
        setPrivacyNonce((n) => n + 1); // ✅ cancels any stale GET and refreshes
      }}
    />
  }
/>


          {user.role === "OWNER" ? (
            <>
              <Route path="/owner" element={<OwnerConsolePage token={token} user={user} />} />
              <Route path="*" element={<Navigate to="/owner" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<GenerateNotePage token={token} user={user} />} />

              {user.role === "WORKER" && (
                <Route path="/my-notes" element={<MyNotesPage token={token} user={user} />} />
              )}

              {user.role === "ADMIN" && (
                <>
                  <Route path="/team" element={<UsersAdminPage token={token} user={user} />} />
                  <Route path="/dashboard" element={<NotesDashboardPage token={token} user={user} />} />
                </>
              )}

              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}

          <Route
            path="/account"
            element={<AccountPage token={token} user={user} onAuthUserPatch={patchAuthUser} />}
          />
          <Route path="/audit" element={<AuditLogPage user={user} />} />
        </Routes>

        <FooterLinks />
      </div>
    </div>
  );
}

export default App;
