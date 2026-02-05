// frontend/src/pages/PrivacyPolicyPage.jsx
import { NavLink } from "react-router-dom";

const MUTED = "#6b7280";
const PRIMARY = "#111827";

export default function PrivacyPolicyPage() {
  const cardStyle = {
    background: "#ffffff",
    borderRadius: "0.75rem",
    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.06)",
    padding: "1.25rem 1.5rem 1.5rem",
    boxSizing: "border-box",
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", color: PRIMARY }}>Privacy Policy</h1>
            <div style={{ marginTop: "0.25rem", color: MUTED, fontSize: "0.9rem" }}>
              Last updated: 5 February 2026
            </div>
          </div>

          <div style={{ alignSelf: "center" }}>
            <NavLink to="/" style={{ color: "#1d4ed8", textDecoration: "none", fontSize: "0.9rem" }}>
              Back
            </NavLink>
          </div>
        </div>

        <div style={{ marginTop: "1rem", color: PRIMARY, lineHeight: 1.55, fontSize: "0.95rem" }}>
          <p style={{ marginTop: 0 }}>
            This app helps NDIS providers create and manage shift/progress notes. Notes can contain sensitive personal
            information about NDIS participants. We take steps to minimise what we collect and protect what we store.
          </p>

          <h2 style={{ fontSize: "1.05rem" }}>What we collect</h2>
          <ul>
            <li>Account details (name, email, role, organisation).</li>
            <li>Progress note content entered by workers and administrators.</li>
            <li>Operational logs needed for security and compliance (e.g., audit events, request IDs).</li>
          </ul>

          <h2 style={{ fontSize: "1.05rem" }}>Why we collect it</h2>
          <ul>
            <li>To provide note generation and note management features.</li>
            <li>To help providers meet record-keeping and governance expectations (e.g., audit trails, retention).</li>
            <li>To secure the service and prevent misuse.</li>
          </ul>

          <h2 style={{ fontSize: "1.05rem" }}>AI assistance</h2>
          <p>
            When AI assistance is used, we aim to redact and de-identify inputs before sending them for generation.
            Providers should avoid entering identifiers where not necessary.
          </p>

          <h2 style={{ fontSize: "1.05rem" }}>Retention and deletion</h2>
          <p>
            Notes are not manually deletable. They can be archived and will be soft-deleted then purged according to
            retention settings, subject to legal hold.
          </p>

          <p style={{ color: MUTED, fontSize: "0.9rem", marginTop: "1rem" }}>
            NOTE: Starter policy for development. Replace contact/sub-processor details before production onboarding.
          </p>
        </div>
      </div>
    </div>
  );
}
