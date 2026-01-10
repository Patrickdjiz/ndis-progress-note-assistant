// src/pages/ResetPasswordPage.jsx
import { useMemo, useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";


const PRIMARY = "#111827";

export default function ResetPasswordPage() {
  const location = useLocation();
  const token = useMemo(
    () => new URLSearchParams(location.search).get("token") || "",
    [location.search]
  );

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ UI-only: responsive helper (no business logic changes)
  const isMobile = useIsMobile(760);


  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!token) {
      setErr("Missing reset token. Please use the link from your email.");
      return;
    }
    if (!newPassword || newPassword.length < 10) {
      setErr("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      setMsg("Password updated. You can now log in.");
      setNewPassword("");
      setConfirm("");
    } catch (e2) {
      setErr(e2?.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    padding: isMobile ? "1rem" : "1rem",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
    boxSizing: "border-box",
  };

  const fieldStyle = {
    width: "100%",
    padding: "0.6rem 0.7rem",
    borderRadius: "0.6rem",
    border: "1px solid #d1d5db",
    fontSize: "0.95rem",
    boxSizing: "border-box",
    // ✅ Mobile: better tap target, no visual style change
    minHeight: isMobile ? 44 : undefined,
  };

  const buttonStyle = {
    padding: "0.6rem 0.9rem",
    borderRadius: "999px",
    border: "none",
    background: PRIMARY,
    color: "#fff",
    cursor: loading ? "wait" : "pointer",
    opacity: !token ? 0.6 : 1,
    // ✅ Mobile: full-width primary action (same look)
    minHeight: isMobile ? 44 : undefined,
    ...(isMobile ? { width: "100%" } : {}),
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: 0, color: PRIMARY }}>Set a new password</h2>
      <p
        style={{
          marginTop: "0.35rem",
          color: "#6b7280",
          fontSize: "0.9rem",
          lineHeight: 1.45,
        }}
      >
        Enter your new password below. If this link has expired, request a new
        one.
      </p>

      {!token && (
        <p style={{ color: "red", marginTop: "0.65rem", wordBreak: "break-word" }}>
          Missing reset token. Please open the reset link from your email.
        </p>
      )}

      {err && (
        <p style={{ color: "red", marginTop: "0.65rem", wordBreak: "break-word" }}>
          {err}
        </p>
      )}

      {msg && (
        <p style={{ color: "#047857", marginTop: "0.65rem", lineHeight: 1.45 }}>
          {msg}{" "}
          <Link to="/" style={{ color: PRIMARY, fontWeight: 600 }}>
            Return to login
          </Link>
        </p>
      )}

      <form
        onSubmit={submit}
        style={{
          display: "grid",
          gap: "0.7rem",
          marginTop: "0.6rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 10 characters"
            style={fieldStyle}
            disabled={loading || !token}
            autoComplete="new-password"
            required
          />
        </div>

        <div style={{ display: "grid", gap: "0.25rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
            Confirm new password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            style={fieldStyle}
            disabled={loading || !token}
            autoComplete="new-password"
            required
          />
        </div>

        <button type="submit" disabled={loading || !token} style={buttonStyle}>
          {loading ? "Saving…" : "Set new password"}
        </button>

        <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          <Link to="/" style={{ color: PRIMARY, fontWeight: 600 }}>
            Back to login
          </Link>
        </div>
      </form>
    </div>
  );
}
