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
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          boxSizing: "border-box",
          background: "#f3f4f6",
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
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#f3f4f6",
    }}
  >
    {/* Header */}
    <header
      style={{
        width: "100%",
        background: "#ffffff",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
            NDIS AI Notes Assistant
          </h1>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
            Logged in as <strong>{user.fullName}</strong> ({user.role})
          </p>
        </div>

        {/* NAVIGATION */}
        <nav style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          
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
              <NavLink to="/team" style={linkStyle}>Team</NavLink>
              <NavLink to="/dashboard" style={linkStyle}>Saved notes</NavLink>
            </>
          )}

          {user.role === "OWNER" && (
            <NavLink to="/owner" style={linkStyle}>Owner console</NavLink>
          )}

          <button
            onClick={handleLogout}
            style={{
              marginLeft: "0.75rem",
              background: "#ffffff",
              color: "#111827",
              border: "1px solid #d1d5db",
            }}
          >
            Log out
          </button>
        </nav>
      </div>
    </header>

    {/* MAIN CONTENT WRAPPER */}
    <main
      style={{
        flex: 1,
        width: "100%",
        maxWidth: "1100px",
        margin: "2rem auto",
        padding: "0 1.5rem",
      }}
    >
      <Routes>
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
      </Routes>
    </main>
  </div>
);
}

export default App;
