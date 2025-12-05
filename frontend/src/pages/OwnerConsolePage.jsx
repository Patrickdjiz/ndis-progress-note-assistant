// src/pages/OwnerConsolePage.jsx
import { useEffect, useState } from "react";

function OwnerConsolePage({ token, user }) {
  // Extra safety: block if somehow rendered for non-owner
  if (!user || user.role !== "OWNER") {
    return (
      <section>
        <h2>Owner console</h2>
        <p style={{ color: "red", fontSize: "0.9rem" }}>
          Access denied. This area is only available to OWNER accounts.
        </p>
      </section>
    );
  }

  const [organisations, setOrganisations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Create provider form
  const [organisationName, setOrganisationName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await fetch("http://localhost:5000/api/owner/overview", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load overview");
      }
      setOrganisations(Array.isArray(data.organisations) ? data.organisations : []);
    } catch (err) {
      console.error("Error loading owner overview:", err);
      setErrorMsg(err?.message || "Failed to load overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateProvider = async (e) => {
    e.preventDefault();
    try {
      setErrorMsg("");
      setCreateMsg("");

      if (
        !organisationName.trim() ||
        !adminEmail.trim() ||
        !adminFullName.trim() ||
        !adminPassword.trim()
      ) {
        setErrorMsg(
          "Organisation name, admin email, admin full name and password are all required."
        );
        return;
      }

      const res = await fetch("http://localhost:5000/api/owner/providers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          organisationName: organisationName.trim(),
          adminEmail: adminEmail.trim(),
          adminFullName: adminFullName.trim(),
          adminPassword: adminPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create provider");
      }

      setCreateMsg(
        `Created provider "${data.organisation.name}" with admin ${data.admin.email}.`
      );

      // Clear form
      setOrganisationName("");
      setAdminEmail("");
      setAdminFullName("");
      setAdminPassword("");

      // Refresh overview list
      await fetchOverview();
    } catch (err) {
      console.error("Error creating provider:", err);
      setErrorMsg(err?.message || "Failed to create provider");
    }
  };

  return (
    <section>
      <h2>Owner console</h2>
      <p style={{ fontSize: "0.9rem", color: "#4b5563", marginBottom: "1rem" }}>
        This view is for the platform owner only. From here you can create new
        provider organisations, assign an admin to each, and see all admins and
        workers grouped by organisation.
      </p>

      {/* Create provider form */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "0.9rem",
          marginBottom: "1.5rem",
          background: "#f9fafb",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Create new provider organisation</h3>
        <form
          onSubmit={handleCreateProvider}
          style={{ display: "grid", gap: "0.6rem", maxWidth: "500px" }}
        >
          <div>
            <label
              style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}
            >
              Organisation name
            </label>
            <input
              type="text"
              value={organisationName}
              onChange={(e) => setOrganisationName(e.target.value)}
              placeholder="e.g. Bright Path Support Services"
              style={{ width: "100%", padding: "0.45rem", fontSize: "0.9rem" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}
            >
              Admin email
            </label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="provider.admin@example.com"
              style={{ width: "100%", padding: "0.45rem", fontSize: "0.9rem" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}
            >
              Admin full name
            </label>
            <input
              type="text"
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder="e.g. Sarah Khan"
              style={{ width: "100%", padding: "0.45rem", fontSize: "0.9rem" }}
            />
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}
            >
              Admin password
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Temporary password for admin"
              style={{ width: "100%", padding: "0.45rem", fontSize: "0.9rem" }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="submit"
              style={{
                padding: "0.55rem 1.2rem",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Create provider
            </button>
            {createMsg && (
              <span style={{ fontSize: "0.8rem", color: "#047857" }}>{createMsg}</span>
            )}
          </div>
        </form>
      </div>

      {errorMsg && (
        <p style={{ color: "red", fontSize: "0.85rem", marginBottom: "0.8rem" }}>
          {errorMsg}
        </p>
      )}

      {/* Overview list */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0 }}>All providers and users</h3>
        <button
          type="button"
          onClick={fetchOverview}
          disabled={loading}
          style={{
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {organisations.length === 0 && !loading && (
        <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
          No organisations found yet. Create your first provider above.
        </p>
      )}

      <div style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
        {organisations.map((org) => (
          <div
            key={org.id}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "0.8rem",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.4rem",
                alignItems: "baseline",
              }}
            >
              <div>
                <h4 style={{ margin: 0 }}>{org.name}</h4>
                <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                  Organisation ID: {org.id}
                </span>
              </div>
              <span style={{ fontSize: "0.8rem", color: "#4b5563" }}>
                Users: {org.users?.length || 0}
              </span>
            </div>

            {(!org.users || org.users.length === 0) && (
              <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                No admins or workers yet.
              </p>
            )}

            {org.users && org.users.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "0.35rem 0.4rem",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Role
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "0.35rem 0.4rem",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "0.35rem 0.4rem",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Email
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "0.35rem 0.4rem",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Active
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "0.35rem 0.4rem",
                          borderBottom: "1px solid #e5e7eb",
                        }}
                      >
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {org.users.map((u) => (
                      <tr key={u.id}>
                        <td
                          style={{
                            padding: "0.35rem 0.4rem",
                            borderBottom: "1px solid #f3f4f6",
                            fontWeight: u.role === "ADMIN" ? 600 : 400,
                            color: u.role === "ADMIN" ? "#111827" : "#4b5563",
                          }}
                        >
                          {u.role}
                        </td>
                        <td
                          style={{
                            padding: "0.35rem 0.4rem",
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          {u.fullName}
                        </td>
                        <td
                          style={{
                            padding: "0.35rem 0.4rem",
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          {u.email}
                        </td>
                        <td
                          style={{
                            padding: "0.35rem 0.4rem",
                            borderBottom: "1px solid #f3f4f6",
                            color: u.isActive ? "#047857" : "#b91c1c",
                            fontWeight: 600,
                          }}
                        >
                          {u.isActive ? "Yes" : "No"}
                        </td>
                        <td
                          style={{
                            padding: "0.35rem 0.4rem",
                            borderBottom: "1px solid #f3f4f6",
                            color: "#6b7280",
                          }}
                        >
                          {u.createdAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default OwnerConsolePage;
