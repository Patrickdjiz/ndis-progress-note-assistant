// src/pages/AccountPage.jsx
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { sessionStore } from "../lib/sessionStore";

const PRIMARY = "#111827";

export default function AccountPage({ user, onAuthUserPatch }) {
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

  // ✅ UI-only: responsive helper (no business logic changes)
  const isMobile = useIsMobile(760);

  useEffect(() => {
    setFullName(user.fullName || "");
    setEmail(user.email || "");
  }, [user.fullName, user.email]);

  const cardStyle = {
    borderRadius: "0.75rem",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    padding: "0.9rem",
    boxSizing: "border-box",
    minWidth: 0,
  };

  const labelStyle = { fontSize: "0.85rem", color: "#374151" };
  const inputStyle = {
    width: "100%",
    padding: "0.6rem 0.7rem",
    borderRadius: "0.6rem",
    border: "1px solid #d1d5db",
    fontSize: "0.9rem",
    boxSizing: "border-box",
    minHeight: isMobile ? 44 : undefined,
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
        },
        body: JSON.stringify({ fullName, email }),
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

    // ✅ keep UI aligned with backend (min 10)
    if (!newPassword || newPassword.length < 10) {
      setPwErr("New password must be at least 10 characters.");
      return;
    }

    setSavingPw(true);
    try {
      const data = await apiFetch("/api/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      // ✅ Force re-login if backend says so
      if (data?.relogin) {
        const msg = data?.message || "Password updated. Please log in again.";

        // ✅ Clear the real auth store (sessionStorage keys)
        try { sessionStore.clearAll(); } catch {}

        // Optional legacy cleanup
        try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch {}

        // One-time message for login page
        try { sessionStorage.setItem("flash_login_msg", msg); } catch {}

        window.location.assign("/");
        return;
      }


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

  const pillButton = (overrides = {}) => ({
    marginTop: "0.25rem",
    padding: "0.55rem 1.1rem",
    borderRadius: "999px",
    border: "none",
    background: PRIMARY,
    color: "#f9fafb",
    cursor: "pointer",
    width: "fit-content",
    fontWeight: 600,
    minHeight: isMobile ? 44 : undefined,
    ...(isMobile ? { width: "100%" } : {}),
    ...overrides,
  });

  return (
    <section style={{ maxWidth: 760, width: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", color: PRIMARY }}>
          Account
        </h2>
        <p
          style={{
            color: "#4b5563",
            marginTop: "0.25rem",
            marginBottom: 0,
            lineHeight: 1.45,
          }}
        >
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
            lineHeight: 1.45,
            wordBreak: "break-word",
          }}
        >
          You must change your password before continuing.
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {/* Profile */}
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: PRIMARY }}>Profile</div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#6b7280",
                  marginTop: "0.15rem",
                  wordBreak: "break-word",
                }}
              >
                Role: <strong>{roleLabel}</strong>
              </div>
            </div>
          </div>

          {profileErr && (
            <p style={{ color: "red", marginTop: "0.75rem", wordBreak: "break-word" }}>
              {profileErr}
            </p>
          )}
          {profileMsg && (
            <p style={{ color: "#047857", marginTop: "0.75rem", wordBreak: "break-word" }}>
              {profileMsg}
            </p>
          )}

          <form
            onSubmit={saveProfile}
            style={{ marginTop: "0.8rem", display: "grid", gap: "0.65rem" }}
          >
            <div>
              <label style={labelStyle}>Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
                autoComplete="name"
              />
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                autoComplete="email"
              />
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.35rem" }}>
                This email is used for login and password reset.
              </div>
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              style={pillButton({
                cursor: savingProfile ? "wait" : "pointer",
                opacity: savingProfile ? 0.9 : 1,
              })}
            >
              {savingProfile ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>

        {/* Security */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, color: PRIMARY }}>Security</div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "#6b7280",
              marginTop: "0.15rem",
              lineHeight: 1.45,
            }}
          >
            Change your password regularly and keep it strong.
          </div>

          {pwErr && (
            <p style={{ color: "red", marginTop: "0.75rem", wordBreak: "break-word" }}>
              {pwErr}
            </p>
          )}
          {pwMsg && (
            <p style={{ color: "#047857", marginTop: "0.75rem", wordBreak: "break-word" }}>
              {pwMsg}
            </p>
          )}

          <form
            onSubmit={changePassword}
            style={{ marginTop: "0.8rem", display: "grid", gap: "0.65rem" }}
          >
            <div>
              <label style={labelStyle}>Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={inputStyle}
                autoComplete="current-password"
              />
            </div>

            <div>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.35rem" }}>
                Minimum 10 characters.
              </div>
            </div>

            <div>
              <label style={labelStyle}>Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={savingPw}
              style={pillButton({
                cursor: savingPw ? "wait" : "pointer",
                opacity: savingPw ? 0.9 : 1,
              })}
            >
              {savingPw ? "Saving…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
