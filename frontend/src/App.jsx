// src/App.jsx
import { NavLink, Routes, Route } from "react-router-dom";
import GenerateNotePage from "./pages/GenerateNotePage.jsx";
import NotesDashboardPage from "./pages/NotesDashboardPage.jsx";

function App() {
  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      {/* Simple nav */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.4rem" }}>
          NDIS AI Progress Notes Assistant
        </h1>

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
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<GenerateNotePage />} />
        <Route path="/dashboard" element={<NotesDashboardPage />} />
      </Routes>
    </div>
  );
}

export default App;
