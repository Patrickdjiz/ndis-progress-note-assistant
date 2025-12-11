// src/pages/UsersAdminPage.jsx
import { useEffect, useState } from "react";

function UsersAdminPage({ token, user }) {
  const PRIMARY = "#111827";

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);   // for fetching users
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

      const res = await fetch("http://localhost:5000/api/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load users");
      }

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

      const res = await fetch("http://localhost:5000/api/users", {
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      // Clear the form
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");

      const workerEmail = data?.user?.email || newEmail.trim();
      setCreateMsg(
        workerEmail ? `Worker ${workerEmail} created.` : "Worker created."
      );

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

      const res = await fetch(
        `http://localhost:5000/api/users/${id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !isActive }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user status");
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, isActive: data.isActive } : u
        )
      );
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

  return (
    <section>
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
          }}
        >
          As an {user.role}, you can invite workers to your organisation,
          and deactivate accounts that are no longer in use.
        </p>
      </div>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.2rem", marginBottom: "0.4rem" }}>
          {errorMsg}
        </p>
      )}

      {/* Create user form */}
      <form
        onSubmit={handleCreateUser}
        style={{
          marginTop: "0.75rem",
          padding: "0.9rem 1rem",
          border: "1px solid #e5e7eb",
          borderRadius: "0.75rem",
          background: "#ffffff",
          display: "grid",
          gridTemplateColumns: "1.2fr 1.4fr 1.1fr auto",
          gap: "0.7rem",
          alignItems: "flex-end",
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
            style={{
              width: "100%",
              padding: "0.5rem 0.55rem",
              borderRadius: "0.6rem",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
            }}
            placeholder="e.g. Fatima Khan"
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
            style={{
              width: "100%",
              padding: "0.5rem 0.55rem",
              borderRadius: "0.6rem",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
            }}
            placeholder="e.g. worker@provider.com"
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
            style={{
              width: "100%",
              padding: "0.5rem 0.55rem",
              borderRadius: "0.6rem",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
            }}
            placeholder="e.g. send this to the worker"
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
        <div style={{ maxHeight: "380px", overflowY: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
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
                    <td style={tdStyle}>{u.email}</td>
                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: u.role === "ADMIN" ? 600 : 400,
                        color:
                          u.role === "ADMIN" ? "#111827" : "#4b5563",
                      }}
                    >
                      {u.role}
                    </td>
                    <td style={tdStyle}>
                      {statusBadge(u.isActive, isCurrentUser)}
                    </td>
                    <td style={tdStyle}>
                      {!isCurrentUser && (
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleActive(u.id, !!u.isActive)
                          }
                          style={{
                            padding: "0.3rem 0.8rem",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            borderRadius: "999px",
                            border: "1px solid #e5e7eb",
                            background: "#f9fafb",
                            color: PRIMARY,
                            fontWeight: 500,
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
};

const tdStyle = {
  padding: "0.45rem 0.7rem",
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
};

export default UsersAdminPage;
