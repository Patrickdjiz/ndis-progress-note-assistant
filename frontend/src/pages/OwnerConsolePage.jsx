// src/pages/OwnerConsolePage.jsx
import { useEffect, useState } from "react";

function OwnerConsolePage({ token, user }) {
  const PRIMARY = "#111827";

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
  const [creating, setCreating] = useState(false);

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
      setOrganisations(
        Array.isArray(data.organisations) ? data.organisations : []
      );
    } catch (err) {
      console.error("Error loading owner overview:", err);
      setErrorMsg(err?.message || "Failed to load overview");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOrgStatus = async (org) => {
    try {
      setErrorMsg("");
      setCreateMsg("");

      const newStatus = org.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

      const res = await fetch(
        `http://localhost:5000/api/owner/organisations/${org.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update organisation status");
      }

      await fetchOverview();
    } catch (err) {
      console.error("Error toggling org status:", err);
      setErrorMsg(err?.message || "Failed to update organisation status");
    }
  };

  const handleToggleUserStatus = async (userId, currentIsActive) => {
    try {
      setErrorMsg("");
      setCreateMsg("");

      const res = await fetch(
        `http://localhost:5000/api/owner/users/${userId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !currentIsActive }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user status");
      }

      await fetchOverview();
    } catch (err) {
      console.error("Error toggling user status:", err);
      setErrorMsg(err?.message || "Failed to update user status");
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

      setCreating(true);

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
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (label, isActive) => (
    <span
      style={{
        fontSize: "0.75rem",
        padding: "0.15rem 0.55rem",
        borderRadius: "999px",
        border: "1px solid #e5e7eb",
        background: isActive ? "#ecfdf3" : "#fef2f2",
        color: isActive ? "#166534" : "#b91c1c",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );

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
          Owner console
        </h2>
        <p
          style={{
            fontSize: "0.9rem",
            color: "#4b5563",
            marginTop: "0.25rem",
          }}
        >
          This view is for the platform owner only. From here you can create new
          provider organisations, assign an admin to each, and see all admins
          and workers grouped by organisation.
        </p>
      </div>

      {/* Create provider form */}
      <div
        style={{
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          background: "#ffffff",
          padding: "1rem 1.1rem",
          marginBottom: "1.5rem",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "0.6rem",
            fontSize: "1rem",
            color: PRIMARY,
          }}
        >
          Create new provider organisation
        </h3>

        <form
          onSubmit={handleCreateProvider}
          style={{
            display: "grid",
            gap: "0.7rem",
            maxWidth: "540px",
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
              Organisation name
            </label>
            <input
              type="text"
              value={organisationName}
              onChange={(e) => setOrganisationName(e.target.value)}
              placeholder="e.g. Bright Path Support Services"
              style={{
                width: "100%",
                padding: "0.5rem 0.55rem",
                fontSize: "0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #d1d5db",
              }}
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
              Admin email
            </label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="provider.admin@example.com"
              style={{
                width: "100%",
                padding: "0.5rem 0.55rem",
                fontSize: "0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #d1d5db",
              }}
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
              Admin full name
            </label>
            <input
              type="text"
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder="e.g. Sarah Khan"
              style={{
                width: "100%",
                padding: "0.5rem 0.55rem",
                fontSize: "0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #d1d5db",
              }}
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
              Admin password
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Temporary password for admin"
              style={{
                width: "100%",
                padding: "0.5rem 0.55rem",
                fontSize: "0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #d1d5db",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
              marginTop: "0.2rem",
            }}
          >
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: "0.55rem 1.25rem",
                fontSize: "0.9rem",
                cursor: creating ? "wait" : "pointer",
                borderRadius: "999px",
                border: "none",
                background: PRIMARY,
                color: "#f9fafb",
                fontWeight: 500,
              }}
            >
              {creating ? "Creating…" : "Create provider"}
            </button>
            {createMsg && (
              <span style={{ fontSize: "0.8rem", color: "#047857" }}>
                {createMsg}
              </span>
            )}
          </div>
        </form>
      </div>

      {errorMsg && (
        <p
          style={{
            color: "red",
            fontSize: "0.85rem",
            marginBottom: "0.9rem",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Overview list header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "1rem",
            color: PRIMARY,
          }}
        >
          All providers and users
        </h3>
        <button
          type="button"
          onClick={fetchOverview}
          disabled={loading}
          style={{
            padding: "0.45rem 1.1rem",
            fontSize: "0.85rem",
            cursor: loading ? "wait" : "pointer",
            borderRadius: "999px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            color: PRIMARY,
            fontWeight: 500,
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {organisations.length === 0 && !loading && (
        <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
          No organisations found yet. Create your first provider above.
        </p>
      )}

      {/* Organisation cards */}
      <div style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
        {organisations.map((org) => (
          <div
            key={org.id}
            style={{
              borderRadius: "0.75rem",
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: "0.9rem 1rem",
            }}
          >
            {/* Card header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: "1rem",
                    color: PRIMARY,
                  }}
                >
                  {org.name}
                </h4>
                <div
                  style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 2 }}
                >
                  Organisation ID: {org.id}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  flexWrap: "wrap",
                }}
              >
                {statusBadge(org.status, org.status === "ACTIVE")}

                <button
                  type="button"
                  onClick={() => handleToggleOrgStatus(org)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.3rem 0.8rem",
                    cursor: "pointer",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    background:
                      org.status === "ACTIVE" ? "#fef2f2" : "#ecfdf3",
                    color:
                      org.status === "ACTIVE" ? "#b91c1c" : "#166534",
                    fontWeight: 500,
                  }}
                >
                  {org.status === "ACTIVE"
                    ? "Suspend provider"
                    : "Reactivate provider"}
                </button>

                <span
                  style={{ fontSize: "0.8rem", color: "#4b5563" }}
                >
                  Users: {org.users?.length || 0}
                </span>
              </div>
            </div>

            {/* Users table */}
            {(!org.users || org.users.length === 0) && (
              <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                No admins or workers yet.
              </p>
            )}

            {org.users && org.users.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: "0.25rem" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead>
                    <tr>
                      {["Role", "Name", "Email", "Active", "Created", "Actions"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "0.35rem 0.4rem",
                              borderBottom: "1px solid #e5e7eb",
                              fontWeight: 600,
                              color: "#111827",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
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
                            color:
                              u.role === "ADMIN" ? "#111827" : "#4b5563",
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
                        <td
                          style={{
                            padding: "0.35rem 0.4rem",
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleUserStatus(u.id, !!u.isActive)
                            }
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.25rem 0.75rem",
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
