// src/pages/ForgotPasswordPage.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";


const PRIMARY = "#111827";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // ✅ UI-only: responsive helper (no business logic changes)
  const isMobile = useIsMobile(760);


  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    setLoading(true);

    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // In DEV you can return a resetLink to speed testing
      const msg = data?.message || "If that email exists, a reset link has been sent.";
      if (data?.resetLink) {
        // DEV convenience: show link (optional)
        setMsg(`${msg} (DEV reset link: ${data.resetLink})`);
      } else {
        setMsg(msg);
      }
    } catch (e2) {
      setErr(e2?.message || "Failed to request reset.");
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
    padding: "1rem",
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
    // ✅ Mobile: better tap target without changing the look
    minHeight: isMobile ? 44 : undefined,
  };

  const buttonStyle = {
    padding: "0.6rem 0.9rem",
    borderRadius: "999px",
    border: "none",
    background: PRIMARY,
    color: "#fff",
    cursor: loading ? "wait" : "pointer",
    minHeight: isMobile ? 44 : undefined,
    ...(isMobile ? { width: "100%" } : {}),
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: 0, color: PRIMARY }}>Reset your password</h2>
      <p
        style={{
          marginTop: "0.35rem",
          color: "#6b7280",
          fontSize: "0.9rem",
          lineHeight: 1.45,
        }}
      >
        Enter your email and we’ll send a reset link.
      </p>

      {err && (
        <p style={{ color: "red", wordBreak: "break-word", marginTop: "0.65rem" }}>
          {err}
        </p>
      )}
      {msg && (
        <p style={{ color: "#047857", wordBreak: "break-word", marginTop: "0.65rem" }}>
          {msg}
        </p>
      )}

      <form onSubmit={submit} style={{ display: "grid", gap: "0.6rem" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          style={fieldStyle}
          required
          autoComplete="email"
        />

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </div>
  );
}
