// src/pages/UsersAdminPage.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

function UsersAdminPage({ token, user }) {
  const PRIMARY = "#111827";

  // ✅ UI-only: detect mobile so we can stack layouts + improve tap targets
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, []);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false); // for fetching users
  const [errorMsg, setErrorMsg] = useState("");

  // new user form
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createMsg, setCreateMsg] = useState("");
  const [creating, setCreating] = useState(false); // separate loading for create

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      const data = await apiFetch("/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      console.error("Error loading users:", err);
      setErrorMsg(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      setErrorMsg("");
      setCreateMsg("");

      if (!newEmail.trim() || !newFullName.trim() || !newPassword.trim()) {
        setErrorMsg("Email, full name and password are required.");
        return;
      }

      setCreating(true);

      const data = await apiFetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newEmail.trim(),
          fullName: newFullName.trim(),
          password: newPassword.trim(),
          // role is deliberately NOT sent / ignored by backend
        }),
      });

      // Clear the form
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");

      const workerEmail = data?.user?.email || newEmail.trim();
      setCreateMsg(workerEmail ? `Worker ${workerEmail} created.` : "Worker created.");

      // reload from backend
      await fetchUsers();
    } catch (err) {
      console.error("Error creating user:", err);
      setErrorMsg(err?.message || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id, isActive) => {
    try {
      setErrorMsg("");

      const data = await apiFetch(`/api/users/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !isActive }),
      });

      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: data.isActive } : u)));
    } catch (err) {
      console.error("Error updating user status:", err);
      setErrorMsg(err?.message || "Failed to update user status");
    }
  };

  const statusBadge = (isActive, isCurrentUser) => {
    const label = isActive ? "Active" : "Inactive";
    const extra = isCurrentUser ? " (you)" : "";
    return (
      <span
        style={{
          fontSize: "0.75rem",
          padding: "0.12rem 0.55rem",
          borderRadius: "999px",
          border: "1px solid #e5e7eb",
          background: isActive ? "#ecfdf3" : "#fef2f2",
          color: isActive ? "#166534" : "#b91c1c",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {extra}
      </span>
    );
  };

  // ✅ UI-only: slightly larger tap targets on mobile (no visual redesign)
  const inputStyle = {
    width: "100%",
    padding: "0.5rem 0.55rem",
    borderRadius: "0.6rem",
    border: "1px solid #d1d5db",
    fontSize: "0.9rem",
    boxSizing: "border-box",
    minHeight: isMobile ? 44 : undefined,
  };

  return (
    <section style={{ width: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ marginBottom: "0.75rem" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.25rem",
            color: PRIMARY,
          }}
        >
          Team management
        </h2>
        <p
          style={{
            fontSize: "0.9rem",
            color: "#4b5563",
            marginTop: "0.25rem",
            lineHeight: 1.45,
          }}
        >
          As an {user.role}, you can invite workers to your organisation, and deactivate accounts that are no longer in
          use.
        </p>
      </div>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.2rem", marginBottom: "0.4rem", wordBreak: "break-word" }}>
          {errorMsg}
        </p>
      )}

      {/* Create user form */}
      <form
        onSubmit={handleCreateUser}
        style={{
          marginTop: "0.75rem",
          padding: isMobile ? "0.9rem" : "0.9rem 1rem",
          border: "1px solid #e5e7eb",
          borderRadius: "0.75rem",
          background: "#ffffff",
          display: "grid",
          // ✅ Mobile: stack fields + full-width button
          gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.4fr 1.1fr auto",
          gap: "0.7rem",
          alignItems: "flex-end",
          boxSizing: "border-box",
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              marginBottom: "0.15rem",
            }}
          >
            Full name
          </label>
          <input
            type="text"
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Fatima Khan"
            autoComplete="name"
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              marginBottom: "0.15rem",
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={inputStyle}
            placeholder="e.g. worker@provider.com"
            autoComplete="email"
            inputMode="email"
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              marginBottom: "0.15rem",
            }}
          >
            Temp password
          </label>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={inputStyle}
            placeholder="e.g. send this to the worker"
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          style={{
            padding: "0.55rem 1.25rem",
            cursor: creating ? "wait" : "pointer",
            whiteSpace: "nowrap",
            borderRadius: "999px",
            border: "none",
            background: PRIMARY,
            color: "#f9fafb",
            fontSize: "0.9rem",
            fontWeight: 500,
            // ✅ Mobile: button becomes easy to tap
            minHeight: isMobile ? 44 : undefined,
            width: isMobile ? "100%" : undefined,
          }}
          disabled={creating}
        >
          {creating ? "Creating…" : "Create user"}
        </button>
      </form>

      {createMsg && (
        <p
          style={{
            marginTop: "0.45rem",
            fontSize: "0.85rem",
            color: "#047857",
            wordBreak: "break-word",
          }}
        >
          {createMsg}
        </p>
      )}

      {/* Users table */}
      <div
        style={{
          marginTop: "1.2rem",
          border: "1px solid #e5e7eb",
          borderRadius: "0.75rem",
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            padding: "0.65rem 0.9rem",
            borderBottom: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontWeight: 600,
            fontSize: "0.9rem",
            color: PRIMARY,
          }}
        >
          Users in your organisation
        </div>

        {/* ✅ Mobile: allow horizontal swipe if needed (keeps the same table UI) */}
        <div
          style={{
            maxHeight: "380px",
            overflowY: "auto",
            overflowX: isMobile ? "auto" : "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
              // keep columns readable on small screens, enable swipe
              minWidth: isMobile ? 720 : undefined,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "0.8rem",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    No users yet. Add your first worker above.
                  </td>
                </tr>
              )}

              {users.map((u) => {
                const isCurrentUser = u.id === user.id;
                return (
                  <tr key={u.id} style={{ background: "#ffffff" }}>
                    <td style={tdStyle}>{u.fullName}</td>
                    <td style={{ ...tdStyle, wordBreak: "break-word" }}>{u.email}</td>
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: u.role === "ADMIN" ? 600 : 400,
                        color: u.role === "ADMIN" ? "#111827" : "#4b5563",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {u.role}
                    </td>
                    <td style={tdStyle}>{statusBadge(u.isActive, isCurrentUser)}</td>
                    <td style={tdStyle}>
                      {!isCurrentUser && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u.id, !!u.isActive)}
                          style={{
                            padding: "0.3rem 0.8rem",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            borderRadius: "999px",
                            border: "1px solid #e5e7eb",
                            background: "#f9fafb",
                            color: PRIMARY,
                            fontWeight: 500,
                            minHeight: isMobile ? 40 : undefined,
                          }}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "0.8rem",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    Loading users…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "0.45rem 0.7rem",
  borderBottom: "1px solid #e5e7eb",
  fontWeight: 600,
  color: "#111827",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "0.45rem 0.7rem",
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
};

export default UsersAdminPage;
