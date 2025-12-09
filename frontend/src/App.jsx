// src/App.jsx
import { useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import GenerateNotePage from "./pages/GenerateNotePage.jsx";
import NotesDashboardPage from "./pages/NotesDashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import UsersAdminPage from "./pages/UsersAdminPage.jsx";
import OwnerConsolePage from "./pages/OwnerConsolePage.jsx";
import MyNotesPage from "./pages/MyNotesPage.jsx";


function App() {
  // Load auth from localStorage if present
  const [auth, setAuth] = useState(() => {
    const stored = localStorage.getItem("ndisAuth");
    return stored ? JSON.parse(stored) : null;
  });

  const handleLoginSuccess = (data) => {
    const authData = {
      token: data.token,
      user: data.user,
    };
    setAuth(authData);
    localStorage.setItem("ndisAuth", JSON.stringify(authData));
  };

  const handleLogout = () => {
    setAuth(null);
    localStorage.removeItem("ndisAuth");
  };

  // If not logged in: only show login page
  if (!auth) {
    return (
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "1.5rem",
          fontFamily: "sans-serif",
        }}
      >
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  const { user, token } = auth;

  const linkStyle = ({ isActive }) => ({
    padding: "0.4rem 0.8rem",
    borderRadius: "999px",
    textDecoration: "none",
    fontSize: "0.9rem",
    border: "1px solid #d1d5db",
    background: isActive ? "#111827" : "#f3f4f6",
    color: isActive ? "#f9fafb" : "#111827",
    whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
      maxWidth: "1100px",
      margin: "1.5rem auto",
      padding: "1.5rem",
      fontFamily: "sans-serif",
      borderRadius: "0.75rem",
      boxShadow: "0 10px 25px rgba(15, 23, 42, 0.06)",
    }}
    >
      {/* Top header with user + logout */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>
            NDIS AI Progress Notes Assistant
          </h1>
          <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
            Logged in as <strong>{user.fullName}</strong> ({user.role})
          </div>
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
          <nav style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
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
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: "0.35rem 0.8rem",
              fontSize: "0.85rem",
              cursor: "pointer",
              borderRadius: "999px",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
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
            {/* Any other path redirects to owner console */}
            <Route path="*" element={<Navigate to="/owner" replace />} />
          </>
        ) : (
          <>
            {/* Generator is home for workers/admins */}
            <Route
              path="/"
              element={<GenerateNotePage token={token} user={user} />}
            />

            {/* WORKER: My notes */}
            {user.role === "WORKER" && (
              <Route
                path="/my-notes"
                element={<MyNotesPage token={token} user={user} />}
              />
            )}

            {/* Admin-only pages */}
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

            {/* Catch-all: send to generator */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </div>
  );
}

export default App;
