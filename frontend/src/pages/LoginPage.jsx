import React, { useState } from "react";

function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("admin@demo.local"); // default for dev
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");
  setLoading(true);
  try {
    const res = await fetch("http://localhost:5000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error((data && data.error) || "Login failed");
    }

    // This should call the prop from App.jsx
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
        maxWidth: 400,
        margin: "80px auto",
        color: "#111827",
        background: "#f9fafb",
        padding: "1.5rem",
        borderRadius: "0.75rem",
        border: "1px solid #e5e7eb",
      }}
    >
      <h2>NDIS AI Notes – Login</h2>
      {error && <div style={{ color: "salmon", marginBottom: 8 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <label>Email</label>
          <input
            style={{ width: "100%" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Password</label>
          <input
            style={{ width: "100%" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 12 }}>
        Dev demo: admin@demo.local / demo1234
      </p>
    </div>
  );
}

export default LoginPage;
