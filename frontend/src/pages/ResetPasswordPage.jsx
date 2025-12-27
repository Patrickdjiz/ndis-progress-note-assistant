import { useMemo, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

export default function ResetPasswordPage() {
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!token) {
      setErr("Missing reset token.");
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
      setErr(e2.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: "0.5rem" }}>Reset password</h2>

      {err && <p style={{ color: "red" }}>{err}</p>}
      {msg && (
        <p style={{ color: "#047857" }}>
          {msg} <Link to="/">Return to login</Link>
        </p>
      )}

      <form onSubmit={submit} style={{ display: "grid", gap: "0.65rem" }}>
        <div>
          <label>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <label>Confirm new password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
