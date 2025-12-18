import React, { useState } from "react";
import { apiFetch } from "../lib/api";

function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("admin@demo.local"); // dev default
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      onLoginSuccess(data);
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 380,
        background: "#ffffff",
        padding: "1.75rem 1.5rem",
        borderRadius: "0.75rem",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
        border: "1px solid #e5e7eb",
      }}
    >
      <h2 style={{ margin: 0, marginBottom: "0.25rem", fontSize: "1.25rem" }}>
        NDIS AI Notes
      </h2>
      <p
        style={{
          margin: 0,
          marginBottom: "1.25rem",
          fontSize: "0.85rem",
          color: "#6b7280",
        }}
      >
        Sign in to access your organisation&apos;s shift notes assistant.
      </p>

      {error && (
        <div
          style={{
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "0.5rem",
            padding: "0.35rem 0.6rem",
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              marginBottom: "0.25rem",
            }}
          >
            Email
          </label>
          <input
            style={{
              width: "100%",
              padding: "0.45rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
            }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              marginBottom: "0.25rem",
            }}
          >
            Password
          </label>
          <input
            style={{
              width: "100%",
              padding: "0.45rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
            }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "0.5rem",
            width: "100%",
            justifyContent: "center",
          }}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p
        style={{
          marginTop: "0.9rem",
          fontSize: "0.75rem",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        Use dev demo: admin@demo.local / demo1234
      </p>
    </div>
  );
}

export default LoginPage;
