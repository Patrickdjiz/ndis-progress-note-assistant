// frontend/src/pages/PrivacyNoticePage.jsx
import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { apiFetch } from "../lib/api";

const PRIMARY = "#111827";
const MUTED = "#6b7280";

export default function PrivacyNoticePage({ currentVersion, onAccepted }) {
  const version = useMemo(() => currentVersion || "v1", [currentVersion]);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const accept = async () => {
    setErr("");
    setSubmitting(true);

    try {
      const res = await apiFetch("/api/privacy/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });

      onAccepted?.({
        accepted: !!res?.accepted,
        currentVersion: res?.currentVersion || version,
        acceptedVersion: res?.acceptedVersion || version,
        acceptedAt: res?.acceptedAt || null,
        error: null,
      });

      navigate("/", { replace: true });
    } catch (e) {
      setErr(e?.message || "Failed to record acceptance.");
    } finally {
      setSubmitting(false);
    }
  };

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
            <h1 style={{ margin: 0, fontSize: "1.25rem", color: PRIMARY }}>Privacy & Collection Notice</h1>
            <div style={{ marginTop: "0.25rem", color: MUTED, fontSize: "0.9rem" }}>
              Version: {version}
            </div>
          </div>

          <div style={{ alignSelf: "center" }}>
            <NavLink to="/privacy" style={{ color: "#1d4ed8", textDecoration: "none", fontSize: "0.9rem" }}>
              View full Privacy Policy
            </NavLink>
          </div>
        </div>

        <div style={{ marginTop: "1rem", color: PRIMARY, lineHeight: 1.55, fontSize: "0.95rem" }}>
          <p style={{ marginTop: 0 }}>
            Before you use this system, you must understand what information is collected and how it is used.
            Progress notes may contain sensitive information about NDIS participants.
          </p>

          <h2 style={{ fontSize: "1.05rem" }}>AI assistance</h2>
          <ul>
            <li>Text you provide may be processed for generation.</li>
            <li>We attempt to de-identify/redact inputs before sending them to AI.</li>
            <li><strong>Do not paste unnecessary identifiers</strong> (e.g., DOB, Medicare, addresses) unless required.</li>
          </ul>

          <div style={{ marginTop: "1rem", padding: "0.75rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
            <label style={{ display: "flex", gap: "0.6rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                style={{ marginTop: "0.25rem" }}
              />
              <span>
                I have read and understood the Privacy & Collection Notice (version {version}) and will use the system
                in a way that protects participant privacy.
              </span>
            </label>

            {err && <div style={{ marginTop: "0.5rem", color: "#b91c1c", fontSize: "0.9rem" }}>{err}</div>}

            <button
              type="button"
              disabled={!checked || submitting}
              onClick={accept}
              style={{
                marginTop: "0.75rem",
                padding: "0.45rem 0.9rem",
                borderRadius: "0.6rem",
                border: "1px solid #111827",
                background: !checked || submitting ? "#e5e7eb" : "#111827",
                color: !checked || submitting ? "#6b7280" : "#ffffff",
                cursor: !checked || submitting ? "not-allowed" : "pointer",
                fontWeight: 600,
              }}
            >
              {submitting ? "Saving…" : "Accept and continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
