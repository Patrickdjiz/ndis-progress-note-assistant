// src/App.jsx
import { useState } from "react";
import { NavLink, Routes, Route } from "react-router-dom";
import GenerateNotePage from "./pages/GenerateNotePage.jsx";
import NotesDashboardPage from "./pages/NotesDashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx"; // <--- wherever you put it
import UsersAdminPage from "./pages/UsersAdminPage.jsx"; 
import OwnerConsolePage from "./pages/OwnerConsolePage.jsx";



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

  // Logged-in view
  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      {/* Top header with user + logout */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
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

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <nav style={{ display: "flex", gap: "0.75rem" }}>
            <NavLink
              to="/"
              end
              style={({ isActive }) => ({
                padding: "0.4rem 0.8rem",
                borderRadius: "999px",
                textDecoration: "none",
                fontSize: "0.9rem",
                border: "1px solid #d1d5db",
                background: isActive ? "#111827" : "#f3f4f6",
                color: isActive ? "#f9fafb" : "#111827",
              })}
            >
              Generate note
            </NavLink>
            <NavLink
              to="/dashboard"
              style={({ isActive }) => ({
                padding: "0.4rem 0.8rem",
                borderRadius: "999px",
                textDecoration: "none",
                fontSize: "0.9rem",
                border: "1px solid #d1d5db",
                background: isActive ? "#111827" : "#f3f4f6",
                color: isActive ? "#f9fafb" : "#111827",
              })}
            >
              Saved notes
            </NavLink>
            {user.role === "ADMIN" && (
              <NavLink
                to="/team"
                style={({ isActive }) => ({
                  padding: "0.4rem 0.8rem",
                  borderRadius: "999px",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  border: "1px solid #d1d5db",
                  background: isActive ? "#111827" : "#f3f4f6",
                  color: isActive ? "#f9fafb" : "#111827",
                })}
              >
                Team
              </NavLink>
            )}
           {user.role === "OWNER" && (
            <NavLink
              to="/owner"
              style={({ isActive }) => ({
                padding: "0.4rem 0.8rem",
                borderRadius: "999px",
                textDecoration: "none",
                fontSize: "0.9rem",
                border: "1px solid #d1d5db",
                background: isActive ? "#111827" : "#f3f4f6",
                color: isActive ? "#f9fafb" : "#111827",
              })}
            >
              Owner console
            </NavLink>
          )}
          {user.role !== "WORKER" && (
  <NavLink
    to="/dashboard"
    style={({ isActive }) => ({
      padding: "0.4rem 0.8rem",
      borderRadius: "999px",
      textDecoration: "none",
      fontSize: "0.9rem",
      border: "1px solid #d1d5db",
      background: isActive ? "#111827" : "#f3f4f6",
      color: isActive ? "#f9fafb" : "#111827",
    })}
  >
    Saved notes
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
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <Routes>
        <Route
          path="/"
          element={<GenerateNotePage token={token} user={user} />}
        />
        <Route
          path="/dashboard"
          element={<NotesDashboardPage token={token} user={user} />}
        />
        {user.role === "ADMIN" && (
          <Route
            path="/team"
            element={<UsersAdminPage token={token} user={user} />}
          />
        )}

      {user.role === "OWNER" && (
        <Route
          path="/owner"
          element={<OwnerConsolePage token={token} user={user} />}
        />
      )}
      {user.role !== "WORKER" && (
    <Route
      path="/dashboard"
      element={<NotesDashboardPage token={token} user={user} />}
    />
  )}

  {user.role !== "WORKER" && (
    <Route
      path="/team"
      element={<UsersAdminPage token={token} user={user} />}
    />
  )}
      </Routes>
    </div>
  );
}

export default App;

