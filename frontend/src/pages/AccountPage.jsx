// src/pages/AccountPage.jsx
import { useState } from "react";
import { apiFetch } from "../lib/api";

const PRIMARY = "#111827";

export default function AccountPage({ token, user, onAuthUserPatch }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (newPassword !== confirm) {
      setErr("New password and confirmation do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");

      // ✅ remove forced-change flag in App state
      onAuthUserPatch?.({ mustChangePassword: false });
    } catch (e2) {
      setErr(e2.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ maxWidth: 520 }}>
      <h2 style={{ margin: 0, fontSize: "1.2rem", color: PRIMARY }}>Account</h2>
      <p style={{ color: "#4b5563", marginTop: "0.25rem" }}>
        Logged in as <strong>{user.email}</strong>
      </p>

      {user.mustChangePassword && (
        <div style={{
          marginTop: "0.75rem",
          padding: "0.6rem 0.75rem",
          borderRadius: "0.75rem",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          color: "#92400e",
          fontSize: "0.9rem"
        }}>
          You must change your password before continuing.
        </div>
      )}

      {err && <p style={{ color: "red", marginTop: "0.75rem" }}>{err}</p>}
      {msg && <p style={{ color: "#047857", marginTop: "0.75rem" }}>{msg}</p>}

      <form onSubmit={submit} style={{ marginTop: "1rem", display: "grid", gap: "0.65rem" }}>
        <div>
          <label style={{ fontSize: "0.85rem", color: "#374151" }}>Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "0.6rem", border: "1px solid #d1d5db" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "0.85rem", color: "#374151" }}>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "0.6rem", border: "1px solid #d1d5db" }}
          />
        </div>

        <div>
          <label style={{ fontSize: "0.85rem", color: "#374151" }}>Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "0.6rem", border: "1px solid #d1d5db" }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "0.3rem",
            padding: "0.55rem 1.1rem",
            borderRadius: "999px",
            border: "none",
            background: PRIMARY,
            color: "#f9fafb",
            cursor: loading ? "wait" : "pointer",
            width: "fit-content",
          }}
        >
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
