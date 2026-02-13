import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { fmtDateTimeTz } from "../lib/dateFormat";

const PRIMARY = "#111827";
const MUTED = "#6b7280";

export default function AuditLogPage({ user }) {
  const isMobile = useIsMobile(760);

  const isAllowed = user?.role === "ADMIN" || user?.role === "OWNER";
  const isOwner = user?.role === "OWNER";

  const [orgs, setOrgs] = useState([]);
  const [orgLoading, setOrgLoading] = useState(false);

  const [organisationId, setOrganisationId] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");

  const [events, setEvents] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Owner needs org list to pick from
  useEffect(() => {
    if (!isOwner) return;

    let cancelled = false;

    (async () => {
      try {
        setOrgLoading(true);
        const data = await apiFetch("/api/owner/overview");
        if (cancelled) return;

        const list = Array.isArray(data?.organisations) ? data.organisations : [];
        setOrgs(list.map((o) => ({ id: o.id, name: o.name })));

        // default select first org for convenience
        if (list[0]?.id && !organisationId) {
          setOrganisationId(String(list[0].id));
        }
      } catch (e) {
        if (!cancelled) setErrorMsg(e?.message || "Failed to load organisations.");
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const buildBody = useMemo(() => {
    const body = {};
    if (isOwner) body.organisationId = organisationId ? Number(organisationId) : undefined;
    if (action.trim()) body.action = action.trim();
    if (targetType.trim()) body.targetType = targetType.trim();
    if (targetId.trim()) body.targetId = targetId.trim();
    body.limit = 200;
    return body;
  }, [isOwner, organisationId, action, targetType, targetId]);

  const search = async ({ append = false } = {}) => {
    try {
      setErrorMsg("");
      append ? setLoadingMore(true) : setLoading(true);

      const body = { ...buildBody };
      if (append && nextCursor) body.cursor = nextCursor;

      const data = await apiFetch("/api/audit/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const incoming = Array.isArray(data?.events) ? data.events : [];
      setEvents((prev) => (append ? [...prev, ...incoming] : incoming));
      setNextCursor(data?.nextCursor || null);
    } catch (e) {
      setErrorMsg(e?.message || "Failed to search audit log.");
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAllowed) return;
    // For OWNER, wait until we have an organisationId
    if (isOwner && !organisationId) return;
    search({ append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed, isOwner, organisationId]);

  if (!isAllowed) {
    return (
      <section>
        <h2 style={{ margin: 0, color: PRIMARY }}>Audit log</h2>
        <p style={{ color: "red", marginTop: "0.4rem" }}>Access denied.</p>
      </section>
    );
  }

  const inputStyle = {
    width: "100%",
    padding: "0.6rem 0.7rem",
    borderRadius: "0.6rem",
    border: "1px solid #d1d5db",
    fontSize: "0.9rem",
    boxSizing: "border-box",
    minHeight: isMobile ? 44 : undefined,
  };

  const pillBtn = (overrides = {}) => ({
    padding: "0.5rem 1.1rem",
    borderRadius: "999px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    color: PRIMARY,
    fontWeight: 600,
    cursor: "pointer",
    minHeight: isMobile ? 44 : undefined,
    ...(isMobile ? { width: "100%" } : {}),
    ...overrides,
  });

  return (
    <section style={{ width: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem", color: PRIMARY }}>Audit log</h2>
        <p style={{ marginTop: "0.25rem", color: MUTED, fontSize: "0.9rem", lineHeight: 1.45 }}>
          Search security and governance events (logins, user changes, provider status changes, etc).
        </p>
      </div>

      {errorMsg && (
        <p style={{ color: "red", fontSize: "0.9rem", marginTop: 0, wordBreak: "break-word" }}>
          {errorMsg}
        </p>
      )}

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "0.75rem",
          padding: isMobile ? "0.9rem" : "0.9rem 1rem",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isOwner ? "1.2fr 1fr 1fr 1fr auto" : "1fr 1fr 1fr auto",
            gap: "0.7rem",
            alignItems: "end",
          }}
        >
          {isOwner && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}>
                Organisation
              </label>
              <select
                value={organisationId}
                onChange={(e) => setOrganisationId(e.target.value)}
                style={inputStyle}
                disabled={orgLoading}
              >
                <option value="">{orgLoading ? "Loading..." : "Select organisation"}</option>
                {orgs.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name} (ID {o.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}>Action</label>
            <input value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle} placeholder="e.g. LOGIN_SUCCESS" />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}>Target type</label>
            <input value={targetType} onChange={(e) => setTargetType(e.target.value)} style={inputStyle} placeholder="e.g. user" />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.15rem" }}>Target ID</label>
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} style={inputStyle} placeholder="e.g. 123" />
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setEvents([]);
                setNextCursor(null);
                search({ append: false });
              }}
              disabled={loading || (isOwner && !organisationId)}
              style={pillBtn({
                border: "none",
                background: PRIMARY,
                color: "#fff",
                cursor: loading ? "wait" : "pointer",
              })}
            >
              {loading ? "Searching…" : "Search"}
            </button>

            <button
              type="button"
              onClick={() => {
                setAction("");
                setTargetType("");
                setTargetId("");
                setEvents([]);
                setNextCursor(null);
              }}
              style={pillBtn()}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          border: "1px solid #e5e7eb",
          borderRadius: "0.75rem",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "0.65rem 0.9rem", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", fontWeight: 700, color: PRIMARY }}>
          Events ({events.length})
        </div>

        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: 980 }}>
            <thead>
              <tr>
                {["Time", "Actor", "Action", "Target", "IP", "Path", "Meta"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.45rem 0.7rem", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ padding: "0.9rem", color: MUTED }}>
                    No events found.
                  </td>
                </tr>
              )}

              {events.map((ev) => (
                <tr key={ev.id}>
                  <td style={td}>{fmtDateTimeTz(ev.occurredAt)}</td>
                  <td style={td}>
                    {ev.actorFullName
                        ? `${ev.actorFullName} (${ev.actorRole || "-"})`
                        : `${ev.actorRole || "-"} ${ev.actorUserId ? `(#${ev.actorUserId})` : ""}`}
                    </td>
                  <td style={td}>{ev.action}</td>
                  <td style={td}>
                    {ev.targetType || "-"}{" "}
                    {ev.targetFullName
                        ? `${ev.targetFullName}${ev.targetId ? ` (#${ev.targetId})` : ""}`
                        : ev.targetId
                        ? `(${ev.targetId})`
                        : ""}
                    </td>
                  <td style={td}>{ev.ip || "-"}</td>
                  <td style={td}>{ev.path || "-"}</td>
                  <td style={td}>
                    {ev.meta ? (
                      <details>
                        <summary style={{ cursor: "pointer", color: "#1d4ed8" }}>View</summary>
                        <pre style={{ marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>
                          {JSON.stringify(ev.meta, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}

              {(loading || loadingMore) && (
                <tr>
                  <td colSpan={7} style={{ padding: "0.9rem", color: MUTED }}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {nextCursor && (
          <div style={{ padding: "0.75rem 0.9rem", borderTop: "1px solid #e5e7eb" }}>
            <button
              type="button"
              onClick={() => search({ append: true })}
              disabled={loadingMore}
              style={pillBtn({
                cursor: loadingMore ? "wait" : "pointer",
              })}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

const td = {
  padding: "0.45rem 0.7rem",
  borderBottom: "1px solid #f3f4f6",
  color: "#374151",
  verticalAlign: "top",
};
