// src/App.jsx
import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Navigate, useLocation } from "react-router-dom";
import GenerateNotePage from "./pages/GenerateNotePage.jsx";
import NotesDashboardPage from "./pages/NotesDashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UsersAdminPage from "./pages/UsersAdminPage.jsx";
import OwnerConsolePage from "./pages/OwnerConsolePage.jsx";
import MyNotesPage from "./pages/MyNotesPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";

const PRIMARY = "#111827";
const PRIMARY_TEXT = "#f9fafb";
const MUTED_TEXT = "#4b5563";

function App() {
  const location = useLocation(); // ✅ move here (hooks must not be conditional)

  const [auth, setAuth] = useState(() => {
    try {
      const stored = localStorage.getItem("ndisAuth");
      return stored ? JSON.parse(stored) : null;
    } catch {
      localStorage.removeItem("ndisAuth");
      return null;
    }
  });

  const [logoutMsg, setLogoutMsg] = useState("");

  useEffect(() => {
    const handler = (e) => {
      const msg = e?.detail?.message || "Session expired. Please log in again.";
      setAuth(null);
      localStorage.removeItem("ndisAuth");
      setLogoutMsg(msg);
    };

    window.addEventListener("ndis:unauthorized", handler);
    return () => window.removeEventListener("ndis:unauthorized", handler);
  }, []);

  const handleLoginSuccess = (data) => {
    setLogoutMsg("");
    const authData = { token: data.token, user: data.user };
    setAuth(authData);
    localStorage.setItem("ndisAuth", JSON.stringify(authData));
  };

  const handleLogout = () => {
    setLogoutMsg("");
    setAuth(null);
    localStorage.removeItem("ndisAuth");
  };

  const patchAuthUser = (patch) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      localStorage.setItem("ndisAuth", JSON.stringify(next));
      return next;
    });
  };

  // ✅ Logged out routes (this is the key change)
  if (!auth) {
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
        <div style={{ width: "100%", maxWidth: 420 }}>
          {logoutMsg && (
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    );
  }

  // --------- Logged in layout ----------
  const { user, token } = auth;

  if (user?.mustChangePassword && location.pathname !== "/account") {
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
        {/* Top header with branding + navigation */}
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
          {/* Left: app title + user */}
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
              Logged in as{" "}
              <strong style={{ fontWeight: 600 }}>{user.fullName}</strong>{" "}
              <span style={{ color: "#9ca3af" }}>· {user.role}</span>
            </div>
          </div>

          {/* Right: nav tabs + logout */}
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
              {/* WORKER + ADMIN: Generator */}
              {user.role !== "OWNER" && (
                <NavLink to="/" end style={linkStyle}>
                  Generate note
                </NavLink>
              )}

              {/* WORKER: My notes */}
              {user.role === "WORKER" && (
                <NavLink to="/my-notes" style={linkStyle}>
                  My notes
                </NavLink>
              )}

              {/* ADMIN: Team + Saved notes */}
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

              {/* OWNER: Owner console only */}
              {user.role === "OWNER" && (
                <NavLink to="/owner" style={linkStyle}>
                  Owner console
                </NavLink>
              )}
              {/* All users: Account page */}
              <NavLink to="/account" style={linkStyle}>
                Account
              </NavLink>
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

        {/* Role-based routes */}
        <Routes>
          {user.role === "OWNER" ? (
            <>
              <Route
                path="/owner"
                element={<OwnerConsolePage token={token} user={user} />}
              />
              <Route path="*" element={<Navigate to="/owner" replace />} />
            </>
          ) : (
            <>
              <Route
                path="/"
                element={<GenerateNotePage token={token} user={user} />}
              />

              {user.role === "WORKER" && (
                <Route
                  path="/my-notes"
                  element={<MyNotesPage token={token} user={user} />}
                />
              )}

              {user.role === "ADMIN" && (
                <>
                  <Route
                    path="/team"
                    element={<UsersAdminPage token={token} user={user} />}
                  />
                  <Route
                    path="/dashboard"
                    element={<NotesDashboardPage token={token} user={user} />}
                  />
                </>
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
          <Route
            path="/account"
            element={<AccountPage token={token} user={user} onAuthUserPatch={patchAuthUser} />}
          />
        </Routes>
      </div>
    </div>
  );
}

export default App;
