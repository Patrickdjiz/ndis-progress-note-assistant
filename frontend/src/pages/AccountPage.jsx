// src/pages/AccountPage.jsx
import { useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const PRIMARY = "#111827";

export default function AccountPage({ token, user, onAuthUserPatch }) {
  // Profile
  const [fullName, setFullName] = useState(user.fullName || "");
  const [email, setEmail] = useState(user.email || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const cardStyle = {
    borderRadius: "0.75rem",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    padding: "0.9rem",
  };

  const labelStyle = { fontSize: "0.85rem", color: "#374151" };
  const inputStyle = {
    width: "100%",
    padding: "0.55rem",
    borderRadius: "0.6rem",
    border: "1px solid #d1d5db",
    fontSize: "0.9rem",
  };

  const roleLabel = useMemo(() => {
    if (user.role === "ADMIN") return "Admin";
    if (user.role === "WORKER") return "Worker";
    if (user.role === "OWNER") return "Owner";
    return user.role;
  }, [user.role]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileErr("");
    setProfileMsg("");

    setSavingProfile(true);
    try {
      const data = await apiFetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName,
          email,
        }),
      });

      setProfileMsg("Profile updated.");
      if (data?.user) {
        onAuthUserPatch?.({
          fullName: data.user.fullName,
          email: data.user.email,
        });
      }
    } catch (e2) {
      setProfileErr(e2.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");

    if (newPassword !== confirm) {
      setPwErr("New password and confirmation do not match.");
      return;
    }

    setSavingPw(true);
    try {
      await apiFetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setPwMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");

      onAuthUserPatch?.({ mustChangePassword: false });
    } catch (e2) {
      setPwErr(e2.message || "Failed to change password.");
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <section style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", color: PRIMARY }}>Account</h2>
        <p style={{ color: "#4b5563", marginTop: "0.25rem", marginBottom: 0 }}>
          Manage your profile and security settings.
        </p>
      </div>

      {user.mustChangePassword && (
        <div
          style={{
            marginBottom: "0.9rem",
            padding: "0.7rem 0.85rem",
            borderRadius: "0.75rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            color: "#92400e",
            fontSize: "0.9rem",
          }}
        >
          You must change your password before continuing.
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {/* Profile */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, color: PRIMARY }}>Profile</div>
              <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "0.15rem" }}>
                Role: <strong>{roleLabel}</strong>
              </div>
            </div>
          </div>

          {profileErr && <p style={{ color: "red", marginTop: "0.75rem" }}>{profileErr}</p>}
          {profileMsg && <p style={{ color: "#047857", marginTop: "0.75rem" }}>{profileMsg}</p>}

          <form onSubmit={saveProfile} style={{ marginTop: "0.8rem", display: "grid", gap: "0.65rem" }}>
            <div>
              <label style={labelStyle}>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.35rem" }}>
                This email is used for login and password reset.
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              style={{
                marginTop: "0.25rem",
                padding: "0.55rem 1.1rem",
                borderRadius: "999px",
                border: "none",
                background: PRIMARY,
                color: "#f9fafb",
                cursor: savingProfile ? "wait" : "pointer",
                width: "fit-content",
                fontWeight: 600,
              }}
            >
              {savingProfile ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>

        {/* Security */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, color: PRIMARY }}>Security</div>
          <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "0.15rem" }}>
            Change your password regularly and keep it strong.
          </div>

          {pwErr && <p style={{ color: "red", marginTop: "0.75rem" }}>{pwErr}</p>}
          {pwMsg && <p style={{ color: "#047857", marginTop: "0.75rem" }}>{pwMsg}</p>}

          <form onSubmit={changePassword} style={{ marginTop: "0.8rem", display: "grid", gap: "0.65rem" }}>
            <div>
              <label style={labelStyle}>Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
              />
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.35rem" }}>
                Minimum 8 characters.
              </div>
            </div>

            <div>
              <label style={labelStyle}>Confirm new password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
            </div>

            <button
              type="submit"
              disabled={savingPw}
              style={{
                marginTop: "0.25rem",
                padding: "0.55rem 1.1rem",
                borderRadius: "999px",
                border: "none",
                background: PRIMARY,
                color: "#f9fafb",
                cursor: savingPw ? "wait" : "pointer",
                width: "fit-content",
                fontWeight: 600,
              }}
            >
              {savingPw ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
