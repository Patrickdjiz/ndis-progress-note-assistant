// src/pages/UsersAdminPage.jsx
import { useEffect, useState } from "react";

function UsersAdminPage({ token, user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // new user form
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState("WORKER");
  const [newPassword, setNewPassword] = useState("");

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

      if (!newEmail || !newFullName || !newPassword) {
        setErrorMsg("Email, full name and password are required.");
        return;
      }

      const res = await fetch("http://localhost:5000/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newEmail,
          fullName: newFullName,
          role: newRole,
          password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }

      await fetchUsers();

      setUsers((prev) => [data.user, ...prev]);
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");
      setNewRole("WORKER");
    } catch (err) {
      console.error("Error creating user:", err);
      setErrorMsg(err?.message || "Failed to create user");
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

  return (
    <section>
      <h2>Team management</h2>
      <p style={{ fontSize: "0.9rem", color: "#4b5563" }}>
        As an {user.role}, you can invite admins and workers to your
        organisation, and deactivate accounts that are no longer in use.
      </p>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.5rem" }}>{errorMsg}</p>
      )}

      {/* Create user form */}
      <form
        onSubmit={handleCreateUser}
        style={{
          marginTop: "1rem",
          padding: "0.8rem",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          background: "#f9fafb",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 0.6fr 0.6fr auto",
          gap: "0.6rem",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: "0.85rem" }}>
            Full name
          </label>
          <input
            type="text"
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="e.g. Fatima Khan"
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem" }}>
            Email
          </label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="e.g. worker@provider.com"
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem" }}>
            Role
          </label>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
          >
            <option value="WORKER">Worker</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem" }}>
            Temp password
          </label>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="e.g. send this to the worker"
          />
        </div>

        <button
          type="submit"
          style={{
            padding: "0.6rem 1.2rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          disabled={loading}
        >
          {loading ? "Saving..." : "Create user"}
        </button>
      </form>

      {/* Users table */}
      <div
        style={{
          marginTop: "1.2rem",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "0.6rem 0.8rem",
            borderBottom: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontWeight: 600,
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
                      padding: "0.7rem",
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    No users yet. Add your first worker or admin above.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} style={{ background: "white" }}>
                  <td style={tdStyle}>{u.fullName}</td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.role}</td>
                  <td style={tdStyle}>
                    {u.isActive ? "Active" : "Inactive"}
                    {u.id === user.id && " (you)"}
                  </td>
                  <td style={tdStyle}>
                    {u.id !== user.id && (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u.id, !!u.isActive)}
                        style={{
                          padding: "0.3rem 0.7rem",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        {u.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "0.4rem 0.6rem",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle = {
  padding: "0.4rem 0.6rem",
  borderBottom: "1px solid #f3f4f6",
};

export default UsersAdminPage;
