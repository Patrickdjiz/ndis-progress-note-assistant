import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchBlob } from "../lib/api";
import { fmtShiftDate, fmtDateTime, fmtHm } from "../lib/dateFormat";
import { downloadBlob } from "../lib/download";
import { useIsMobile } from "../lib/useIsMobile";

const PRIMARY = "#111827";

// -------------------- tiny UI helpers --------------------
function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          background: "#fff",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #e5e7eb",
            background: "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: "#111827" }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 14 }}>{children}</div>

        {footer ? (
          <div
            style={{
              padding: 14,
              borderTop: "1px solid #e5e7eb",
              background: "#f9fafb",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const badge = (label, { bg, color }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "0.1rem 0.45rem",
      borderRadius: "999px",
      fontSize: "0.7rem",
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

const ymdOnly = (v) => {
  const s = String(v || "");
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "date";
};

function NotesDashboardPage({ token, user }) {
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  const [filterParticipant, setFilterParticipant] = useState("");
  const [debouncedParticipant, setDebouncedParticipant] = useState("");
  const [filterIncident, setFilterIncident] = useState("all"); // all | true | false
  const [filterArchived, setFilterArchived] = useState("false"); // false | true | all

  // ✅ NEW: include deleted notes in list/search
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [archiving, setArchiving] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);

  const [finalNoteEditText, setFinalNoteEditText] = useState("");
  const [finalSaveMsg, setFinalSaveMsg] = useState("");

  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ✅ NEW: delete/restore/legal hold/metadata states
  const [acting, setActing] = useState(false);

  // ✅ NEW: Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportParticipant, setExportParticipant] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportIncludeArchived, setExportIncludeArchived] = useState("all"); // all|true|false
  const [exportIncludeDeleted, setExportIncludeDeleted] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv"); // csv|json
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  // ✅ NEW: Metadata modal
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaForm, setMetaForm] = useState({
    participantName: "",
    location: "",
    date: "",
    startTime: "",
    endTime: "",
    incidentFlag: false,
  });
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaMsg, setMetaMsg] = useState("");

  // ✅ NEW: Retention settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [orgSettings, setOrgSettings] = useState({
    retentionDays: 30,
    deleteGraceDays: 7,
    autoPurgeEnabled: false,
  });

  // ✅ UI-only: responsive helper
  const isMobile = useIsMobile(760);

  const actingName = user?.fullName || "Unknown user";
  const isAdmin = user?.role === "ADMIN";

  // Debounce participant filter to avoid spamming requests while typing
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedParticipant(filterParticipant.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [filterParticipant]);

  // ✅ shared styles
  const inputBase = {
    width: "100%",
    padding: "0.4rem 0.5rem",
    borderRadius: "0.5rem",
    border: "1px solid #d1d5db",
    fontSize: "0.85rem",
    boxSizing: "border-box",
    minHeight: isMobile ? 44 : undefined,
  };

  const selectBase = {
    padding: "0.45rem 0.6rem",
    borderRadius: "0.5rem",
    border: "1px solid #d1d5db",
    fontSize: "0.85rem",
    minHeight: isMobile ? 44 : undefined,
  };

  const pillBtn = (overrides = {}) => ({
    padding: isMobile ? "0.7rem 1rem" : "0.55rem 0.9rem",
    borderRadius: 12, // ✅ normal button instead of pill
    fontSize: "0.85rem",
    fontWeight: 700,
    lineHeight: 1.2,
    ...(isMobile ? { width: "100%", minHeight: 44 } : {}),
    ...overrides,
  });


  // -------------------- Fetch Notes --------------------
  const fetchNotes = async ({ append = false, cursor = undefined } = {}) => {
    try {
      append ? setLoadingMore(true) : setNotesLoading(true);
      setNotesError("");
      setErrorMsg("");

      const limit = 50;

      const hasIncidentValue =
        filterIncident === "all" ? undefined : filterIncident === "true";

      const archivedValue =
        filterArchived === "all" ? "all" : filterArchived === "true";

      const payload = {
        participant: debouncedParticipant || undefined,
        hasIncident: hasIncidentValue,
        archived: archivedValue,
        includeDeleted: includeDeleted || undefined, // ✅ include deleted notes
        limit,
        ...(typeof cursor === "string" && cursor.length > 0 ? { cursor } : {}),
      };

      const data = await apiFetch("/api/notes/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const incoming = Array.isArray(data.notes) ? data.notes : [];

      setNotes((prev) => (append ? [...prev, ...incoming] : incoming));
      setNextCursor(data.nextCursor || null);

      if (!append && selectedNote) {
        const stillVisible = incoming.some((n) => n.id === selectedNote.id);
        if (!stillVisible) {
          setSelectedNote(null);
          setFinalNoteEditText("");
          setFinalSaveMsg("");
        }
      }
    } catch (err) {
      setNotesError(err?.message || "Failed to load notes");
    } finally {
      append ? setLoadingMore(false) : setNotesLoading(false);
    }
  };

  // Auto refresh when filters change (participant is debounced)
  useEffect(() => {
    setNextCursor(null);
    setSelectedNote(null);
    setFinalNoteEditText("");
    setFinalSaveMsg("");
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedParticipant, filterIncident, filterArchived, includeDeleted]);

  // -------------------- Load single note --------------------
  const handleSelectNote = async (id) => {
    try {
      setNotesError("");
      setErrorMsg("");
      setFinalSaveMsg("");

      // ✅ if viewing deleted notes, request includeDeleted (backend may use this)
      const url = includeDeleted ? `/api/notes/${id}?includeDeleted=true` : `/api/notes/${id}`;
      const data = await apiFetch(url);

      setSelectedNote(data.note);
      setFinalNoteEditText(
        data.note.finalNoteText ? data.note.finalNoteText : data.note.noteText
      );
    } catch (err) {
      console.error("Error fetching note:", err);
      setNotesError(err?.message || "Failed to fetch note");
    }
  };

  // -------------------- Save/finalise --------------------
  const handleSaveFinalNoteForSelected = async () => {
    try {
      setFinalSaveMsg("");
      setErrorMsg("");

      if (!selectedNote) return setErrorMsg("No note selected.");
      if (!finalNoteEditText || !finalNoteEditText.toString().trim()) {
        return setErrorMsg("Final note text cannot be empty.");
      }

      const data = await apiFetch(`/api/notes/${selectedNote.id}/finalise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalNoteText: finalNoteEditText }),
      });

      setFinalSaveMsg("Final note saved for this shift.");
      setSelectedNote((prev) =>
        prev
          ? {
              ...prev,
              finalNoteText: data.finalNoteText,
              finalisedAt: data.finalisedAt,
              finalisedBy: data.finalisedBy,
            }
          : prev
      );
      fetchNotes();
    } catch (err) {
      console.error("Error saving final note:", err);
      setErrorMsg(err?.message || "Failed to save final note");
    }
  };

  // -------------------- Review toggle --------------------
  const handleToggleReviewed = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return setErrorMsg("No note selected.");

      const data = await apiFetch(`/api/notes/${selectedNote.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedFlag: !selectedNote.reviewedFlag }),
      });

      setSelectedNote((prev) =>
        prev
          ? {
              ...prev,
              reviewedFlag: data.reviewedFlag,
              reviewedAt: data.reviewedAt,
              reviewedBy: data.reviewedBy,
            }
          : prev
      );
      fetchNotes();
    } catch (err) {
      console.error("Error updating review status:", err);
      setErrorMsg(err?.message || "Failed to update review status");
    }
  };

  // -------------------- PDF --------------------
  const handleDownloadPdf = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return setErrorMsg("No note selected.");

      setDownloadingPdf(true);
      const blob = await apiFetchBlob(`/api/notes/${selectedNote.id}/pdf`);
      const filename = `NDIS_Note_${selectedNote.id}_${ymdOnly(selectedNote.date)}.pdf`;
      downloadBlob(blob, filename);
    } catch (e) {
      setErrorMsg(e?.message || "Failed to download PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // -------------------- Archive --------------------
  const handleToggleArchive = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return;

      setArchiving(true);
      const next = !selectedNote.archivedFlag;

      const data = await apiFetch(`/api/notes/${selectedNote.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivedFlag: next }),
      });

      setSelectedNote((prev) =>
        prev
          ? {
              ...prev,
              archivedFlag: data.archivedFlag,
              archivedAt: data.archivedAt,
              archivedBy: data.archivedBy,
            }
          : prev
      );

      fetchNotes();
    } catch (e) {
      setErrorMsg(e?.message || "Failed to update archive state.");
    } finally {
      setArchiving(false);
    }
  };

  // -------------------- DELETE / RESTORE / LEGAL HOLD --------------------
  const handleSoftDelete = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return;

      const reason = window.prompt("Delete reason (optional):", "manual_delete") || "";
      const ok = window.confirm("Soft delete this note? It can be restored until retention purge runs.");
      if (!ok) return;

      setActing(true);
      const data = await apiFetch(`/api/notes/${selectedNote.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      setSelectedNote((prev) => (prev ? { ...prev, ...data.note } : prev));
      fetchNotes();
    } catch (e) {
      setErrorMsg(e?.message || "Failed to delete note.");
    } finally {
      setActing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return;

      if (selectedNote.purgedAt) {
        return setErrorMsg("This note was purged and cannot be restored.");
      }

      const ok = window.confirm("Restore this note? (clears deleted state)");
      if (!ok) return;

      setActing(true);
      const data = await apiFetch(`/api/notes/${selectedNote.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      setSelectedNote((prev) => (prev ? { ...prev, ...data.note } : prev));
      fetchNotes();
    } catch (e) {
      setErrorMsg(e?.message || "Failed to restore note.");
    } finally {
      setActing(false);
    }
  };

  const handleToggleLegalHold = async () => {
  try {
    setErrorMsg("");
    if (!selectedNote) return;

    const next = !selectedNote.legalHold;

    const ok = window.confirm(
      next
        ? "Enable legal hold? This blocks retention purge for this note."
        : "Disable legal hold? This allows retention purge to run when due."
    );
    if (!ok) return;

    setActing(true);

    const resp = await apiFetch(`/api/notes/${selectedNote.id}/legal-hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legalHold: next }),
    });

    const out = resp?.note ?? resp; // ✅ supports both response shapes

    setSelectedNote((prev) =>
      prev
        ? {
            ...prev,
            legalHold: out.legalHold,
            legalHoldSetAt: out.legalHoldSetAt,
            legalHoldSetBy: out.legalHoldSetBy,
          }
        : prev
    );

    fetchNotes();
  } catch (e) {
    console.error("Legal hold error:", e);
    setErrorMsg(e?.message || String(e) || "Failed to set legal hold.");
  } finally {
    setActing(false);
  }
};


  // -------------------- METADATA EDIT --------------------
  const openMetadataModal = () => {
    if (!selectedNote) return;
    if (selectedNote.purgedAt) {
      setErrorMsg("This note was purged and cannot be edited.");
      return;
    }

    setMetaMsg("");
    setMetaForm({
      participantName: selectedNote.participantName || "",
      location: selectedNote.location || "",
      date: String(selectedNote.date || "").slice(0, 10),
      startTime: selectedNote.startTime ? String(selectedNote.startTime).slice(0, 5) : "",
      endTime: selectedNote.endTime ? String(selectedNote.endTime).slice(0, 5) : "",
      incidentFlag: !!selectedNote.incidentFlag,
    });
    setMetaOpen(true);
  };

  const saveMetadata = async () => {
    try {
      setMetaMsg("");
      setErrorMsg("");
      if (!selectedNote) return;

      // Minimal validation
      if (!metaForm.participantName.trim()) return setMetaMsg("Participant name is required.");
      if (!metaForm.location.trim()) return setMetaMsg("Location is required.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(metaForm.date)) return setMetaMsg("Date must be YYYY-MM-DD.");

      setMetaSaving(true);
      const data = await apiFetch(`/api/notes/${selectedNote.id}/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName: metaForm.participantName.trim(),
          location: metaForm.location.trim(),
          date: metaForm.date,
          startTime: metaForm.startTime || null,
          endTime: metaForm.endTime || null,
          incidentFlag: !!metaForm.incidentFlag,
        }),
      });

      // backend likely returns { note: {...} }
      const updated = data.note || data;
      setSelectedNote((prev) => (prev ? { ...prev, ...updated } : prev));
      setMetaMsg("Saved.");
      setMetaOpen(false);
      fetchNotes();
    } catch (e) {
      setMetaMsg(e?.message || "Failed to update metadata.");
    } finally {
      setMetaSaving(false);
    }
  };

  // -------------------- EXPORT --------------------
  // put these helpers inside NotesDashboardPage (above runExport) or outside component
const todayYmd = () => new Date().toISOString().slice(0, 10);
const daysAgoYmd = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const runExport = async () => {
  try {
    setExportMsg("");
    setErrorMsg("");
    setExporting(true);

    // default to last 30 days if blank
    const dateFrom = exportFrom || daysAgoYmd(30);
    const dateTo = exportTo || todayYmd();

    // backend currently expects includeArchived BOOLEAN.
    // We'll map your dropdown:
    // - "all" => include archived => true
    // - "false" => exclude archived => false
    // - "true" (archived only) is NOT supported by current backend (see backend patch below)
    const includeArchived =
      exportIncludeArchived === "false" ? false : true;

    const payload = {
      participant: exportParticipant.trim() || undefined,
      dateFrom,
      dateTo,
      includeArchived,
      includeDeleted: !!exportIncludeDeleted,
      format: exportFormat, // csv|json
    };

    if (exportFormat === "csv") {
      const blob = await apiFetchBlob("/api/notes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const fname = `notes_export_${payload.participant ? payload.participant.replace(/\s+/g, "_") + "_" : ""}${dateFrom}_${dateTo}.csv`;
      downloadBlob(blob, fname);
      setExportMsg("Export downloaded.");
      setExportOpen(false);
      return;
    }

    const data = await apiFetch("/api/notes/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const fname = `notes_export_${payload.participant ? payload.participant.replace(/\s+/g, "_") + "_" : ""}${dateFrom}_${dateTo}.json`;
    downloadBlob(jsonBlob, fname);
    setExportMsg("Export downloaded.");
    setExportOpen(false);
  } catch (e) {
    setExportMsg(e?.message || "Export failed.");
  } finally {
    setExporting(false);
  }
};

  // -------------------- RETENTION SETTINGS --------------------
  const loadSettings = async () => {
    try {
      setSettingsMsg("");
      setSettingsLoading(true);
      const data = await apiFetch("/api/org/settings");
      const s = data.settings || data;
      setOrgSettings({
        retentionDays: Number(s.retentionDays ?? 30),
        deleteGraceDays: Number(s.deleteGraceDays ?? 7),
        autoPurgeEnabled: !!s.autoPurgeEnabled,
      });
    } catch (e) {
      setSettingsMsg(e?.message || "Failed to load org settings.");
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
  try {
    setSettingsMsg("");
    setSettingsSaving(true);

    const retentionDays = Number(orgSettings.retentionDays);
    const deleteGraceDays = Number(orgSettings.deleteGraceDays);

    if (!Number.isFinite(retentionDays) || retentionDays < 30) {
      return setSettingsMsg("Retention must be at least 30 days.");
    }
    if (!Number.isFinite(deleteGraceDays) || deleteGraceDays < 0) {
      return setSettingsMsg("Delete grace days must be 0 or more.");
    }

    const payload = {
      retentionDays,
      deleteGraceDays,
      autoPurgeEnabled: !!orgSettings.autoPurgeEnabled,
    };

    await apiFetch("/api/org/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSettingsMsg("Saved.");
    setSettingsOpen(false);
  } catch (e) {
    // Optional “polish”: convert known backend message into a nicer one
    const raw = e?.message || "Failed to save settings.";
    const nice =
      raw.includes("Too small") && raw.includes(">=30")
        ? "Retention must be at least 30 days."
        : raw;

    setSettingsMsg(nice);
  } finally {
    setSettingsSaving(false);
  }
};

  // open settings modal and load
  const openSettings = async () => {
    setSettingsOpen(true);
    await loadSettings();
  };

  const statusBadges = useMemo(() => {
    if (!selectedNote) return null;
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        {selectedNote.finalisedAt
          ? badge("Finalised", { bg: "#eff6ff", color: "#1d4ed8" })
          : badge("Draft", { bg: "#f3f4f6", color: "#4b5563" })}

        {!!selectedNote.reviewedFlag && badge("Reviewed", { bg: "#fef3c7", color: "#92400e" })}
        {!!selectedNote.archivedFlag && badge("Archived", { bg: "#f3f4f6", color: "#111827" })}
        {!!selectedNote.deletedAt && badge("Deleted", { bg: "#fef2f2", color: "#b91c1c" })}
        {!!selectedNote.legalHold && badge("Legal hold", { bg: "#ede9fe", color: "#5b21b6" })}
        {!!selectedNote.purgedAt && badge("Purged", { bg: "#111827", color: "#ffffff" })}
      </div>
    );
  }, [selectedNote]);

  return (
    <section style={{ width: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.15rem", color: PRIMARY }}>Saved notes</h2>
          <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 4 }}>
            Provider admin dashboard
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                style={pillBtn({
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  color: PRIMARY,
                  fontWeight: 500,
                  cursor: "pointer",
                })}
              >
                Export
              </button>

              <button
                type="button"
                onClick={openSettings}
                style={pillBtn({
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  color: PRIMARY,
                  fontWeight: 500,
                  cursor: "pointer",
                })}
              >
                Retention settings
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div
        style={{
          marginTop: "0.5rem",
          padding: "0.75rem 0.9rem",
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          display: "flex",
          flexWrap: "wrap",
          gap: isMobile ? "0.6rem" : "0.9rem",
          alignItems: "flex-end",
        }}
      >
        <div style={{ minWidth: isMobile ? "0" : "210px", flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#374151", marginBottom: "0.2rem" }}>
            Filter by participant
          </label>
          <input
            type="text"
            value={filterParticipant}
            onChange={(e) => setFilterParticipant(e.target.value)}
            style={inputBase}
            placeholder="e.g. Ali"
          />
        </div>

        <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#374151", marginBottom: "0.2rem" }}>
            Incident filter
          </label>
          <select
            value={filterIncident}
            onChange={(e) => setFilterIncident(e.target.value)}
            style={{ ...selectBase, width: isMobile ? "100%" : undefined, boxSizing: "border-box" }}
          >
            <option value="all">All notes</option>
            <option value="true">Incident notes only</option>
            <option value="false">Notes without incidents</option>
          </select>
        </div>

        <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#374151", marginBottom: "0.2rem" }}>
            Archived
          </label>
          <select
            value={filterArchived}
            onChange={(e) => setFilterArchived(e.target.value)}
            style={{ ...selectBase, width: isMobile ? "100%" : undefined, boxSizing: "border-box" }}
          >
            <option value="false">Hide archived</option>
            <option value="true">Archived only</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* ✅ NEW includeDeleted toggle */}
        {isAdmin && (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: "0.85rem",
              color: "#374151",
              cursor: "pointer",
              ...(isMobile ? { width: "100%" } : {}),
              padding: isMobile ? "0.25rem 0" : 0,
            }}
          >
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            Show deleted notes
          </label>
        )}

        <button
          type="button"
          onClick={() => fetchNotes()}
          disabled={notesLoading}
          style={pillBtn({
            border: "none",
            background: PRIMARY,
            color: "#f9fafb",
            cursor: notesLoading ? "wait" : "pointer",
          })}
        >
          {notesLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {notesError && (
        <p style={{ color: "red", marginTop: "0.75rem", wordBreak: "break-word" }}>
          {notesError}
        </p>
      )}
      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.4rem", wordBreak: "break-word" }}>
          {errorMsg}
        </p>
      )}

      {/* Main layout */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.05fr) minmax(0, 1.1fr)",
          gap: "1rem",
        }}
      >
        {/* Notes table card */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <div
            style={{
              padding: "0.65rem 0.85rem",
              borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600, color: PRIMARY }}>
              Recent notes — showing {notes.length}
            </span>
            <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
              Click a row to review
            </span>
          </div>

          <div
            style={{
              maxHeight: isMobile ? "320px" : "360px",
              overflowY: "auto",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: isMobile ? 900 : undefined,
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <thead>
                <tr>
                  {["Date", "Participant", "Worker", "Location", "Incident", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "0.45rem 0.7rem",
                        borderBottom: "1px solid #e5e7eb",
                        color: "#4b5563",
                        fontWeight: 600,
                        background: "#f9fafb",
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notes.length === 0 && !notesLoading && (
                  <tr>
                    <td colSpan={6} style={{ padding: "0.8rem", textAlign: "center", color: "#6b7280" }}>
                      No notes found. Generate a note and click Refresh.
                    </td>
                  </tr>
                )}

                {notes.map((n) => {
                  const isSelected = selectedNote && selectedNote.id === n.id;
                  const rowFaded = !!n.deletedAt || !!n.purgedAt;

                  return (
                    <tr
                      key={n.id}
                      onClick={() => handleSelectNote(n.id)}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        touchAction: "manipulation",
                        opacity: rowFaded ? 0.75 : 1,
                      }}
                    >
                      <td style={{ padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                        {fmtShiftDate(n.date)}
                      </td>
                      <td style={{ padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                        {n.participantName}
                      </td>
                      <td style={{ padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                        {n.workerName}
                      </td>
                      <td style={{ padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                        {n.location}
                      </td>
                      <td style={{ padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem", borderBottom: "1px solid #f3f4f6" }}>
                        {n.incidentFlag
                          ? badge("Incident", { bg: "#fef2f2", color: "#b91c1c" })
                          : badge("No incident", { bg: "#ecfdf3", color: "#166534" })}
                      </td>
                      <td style={{ padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {badge(n.finalisedAt ? "Finalised" : "Draft", n.finalisedAt ? { bg: "#eff6ff", color: "#1d4ed8" } : { bg: "#f3f4f6", color: "#4b5563" })}
                          {!!n.reviewedFlag && badge("Reviewed", { bg: "#fef3c7", color: "#92400e" })}
                          {!!n.archivedFlag && badge("Archived", { bg: "#f3f4f6", color: "#111827" })}
                          {!!n.deletedAt && badge("Deleted", { bg: "#fef2f2", color: "#b91c1c" })}
                          {!!n.legalHold && badge("Legal hold", { bg: "#ede9fe", color: "#5b21b6" })}
                          {!!n.purgedAt && badge("Purged", { bg: "#111827", color: "#ffffff" })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div style={{ padding: "0.6rem 0.8rem", borderTop: "1px solid #e5e7eb" }}>
              <button
                type="button"
                onClick={() => fetchNotes({ append: true, cursor: nextCursor })}
                disabled={loadingMore}
                style={pillBtn({
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  color: PRIMARY,
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: loadingMore ? "wait" : "pointer",
                })}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>

        {/* Selected note details card */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            padding: "0.85rem 0.9rem 0.9rem",
            display: "flex",
            flexDirection: "column",
            minHeight: "260px",
            minWidth: 0,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.3rem", fontSize: "1rem", color: PRIMARY }}>
            Note details
          </h3>

          {!selectedNote && (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Select a note on the left to review, edit the final wording and mark it as reviewed.
            </p>
          )}

          {selectedNote && (
            <>
              <div style={{ marginBottom: 8 }}>
                {statusBadges}
              </div>

              <p
                style={{
                  fontSize: "0.85rem",
                  marginBottom: "0.5rem",
                  color: "#374151",
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                }}
              >
                <strong>Participant:</strong> {selectedNote.participantName}
                <br />
                <strong>Worker:</strong> {selectedNote.workerName}
                <br />
                <strong>Date:</strong> {fmtShiftDate(selectedNote.date)}
                {selectedNote.startTime && selectedNote.endTime
                  ? ` (${fmtHm(selectedNote.startTime)}–${fmtHm(selectedNote.endTime)})`
                  : ""}
                <br />
                <strong>Location:</strong> {selectedNote.location}
                <br />
                <strong>Incident:</strong> {selectedNote.incidentFlag ? "Yes" : "No"}
                <br />
                <strong>Status:</strong> {selectedNote.finalisedAt ? "Finalised" : "Draft"}
                {selectedNote.finalisedAt && <> (at {fmtDateTime(selectedNote.finalisedAt)})</>}
                <br />
                <strong>Reviewed:</strong> {selectedNote.reviewedFlag ? "Yes" : "No"}
                {selectedNote.reviewedAt && <> (at {fmtDateTime(selectedNote.reviewedAt)})</>}
                {!!selectedNote.deletedAt && (
                  <>
                    <br />
                    <strong>Deleted at:</strong> {fmtDateTime(selectedNote.deletedAt)}
                  </>
                )}
                {!!selectedNote.purgedAt && (
                  <>
                    <br />
                    <strong>Purged at:</strong> {fmtDateTime(selectedNote.purgedAt)}
                  </>
                )}
              </p>

              {/* Audit identity */}
              <div
                style={{
                  marginBottom: "0.6rem",
                  padding: "0.55rem 0.65rem",
                  borderRadius: "0.65rem",
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  fontSize: "0.85rem",
                  color: "#374151",
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", marginBottom: "0.15rem" }}>
                  Audit identity (auto)
                </div>
                <div>
                  <strong>Action by:</strong> {actingName}
                </div>
              </div>

              {/* Admin-only compliance actions */}
              {isAdmin && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={openMetadataModal}
                    disabled={acting || metaSaving || !!selectedNote.purgedAt}
                    style={pillBtn({
                      border: "1px solid #e5e7eb",
                      background: "#ffffff",
                      color: PRIMARY,
                      fontWeight: 500,
                      cursor: "pointer",
                    })}
                  >
                    Edit metadata
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleLegalHold}
                    disabled={acting || !!selectedNote.purgedAt}
                    style={pillBtn({
                      border: "1px solid #e5e7eb",
                      background: selectedNote.legalHold ? "#5b21b6" : "#ffffff",
                      color: selectedNote.legalHold ? "#ffffff" : PRIMARY,
                      fontWeight: 500,
                      cursor: "pointer",
                    })}
                  >
                    {selectedNote.legalHold ? "Disable legal hold" : "Enable legal hold"}
                  </button>

                  {!selectedNote.deletedAt ? (
                    <button
                      type="button"
                      onClick={handleSoftDelete}
                      disabled={acting || !!selectedNote.purgedAt}
                      style={pillBtn({
                        border: "1px solid #fecaca",
                        background: "#fef2f2",
                        color: "#b91c1c",
                        fontWeight: 500,
                        cursor: "pointer",
                      })}
                    >
                      Delete (soft)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRestore}
                      disabled={acting || !!selectedNote.purgedAt}
                      style={pillBtn({
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        color: PRIMARY,
                        fontWeight: 500,
                        cursor: "pointer",
                      })}
                    >
                      Restore
                    </button>
                  )}
                </div>
              )}

              <h4 style={{ marginTop: "0.2rem", marginBottom: "0.2rem", fontSize: "0.9rem", color: "#111827" }}>
                Final note for this shift (editable)
              </h4>

              <textarea
                maxLength={12000}
                rows={7}
                value={finalNoteEditText}
                onChange={(e) => setFinalNoteEditText(e.target.value)}
                disabled={!!selectedNote.purgedAt}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  borderRadius: "0.6rem",
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                  background: selectedNote.purgedAt ? "#f3f4f6" : "#f9fafb",
                  boxSizing: "border-box",
                }}
              />

              <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSaveFinalNoteForSelected}
                  disabled={!!selectedNote.purgedAt}
                  style={pillBtn({
                    border: "none",
                    background: PRIMARY,
                    color: "#f9fafb",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: selectedNote.purgedAt ? "not-allowed" : "pointer",
                    opacity: selectedNote.purgedAt ? 0.6 : 1,
                  })}
                >
                  Save final note for this shift
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf || !selectedNote}
                  style={pillBtn({
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    color: PRIMARY,
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: downloadingPdf ? "wait" : "pointer",
                  })}
                >
                  {downloadingPdf ? "Preparing PDF…" : "Download PDF"}
                </button>

                <button
                  type="button"
                  onClick={handleToggleArchive}
                  disabled={archiving || !selectedNote}
                  style={pillBtn({
                    border: "1px solid #e5e7eb",
                    background: selectedNote?.archivedFlag ? "#111827" : "#ffffff",
                    color: selectedNote?.archivedFlag ? "#ffffff" : PRIMARY,
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: archiving ? "wait" : "pointer",
                  })}
                >
                  {archiving ? "Updating…" : selectedNote?.archivedFlag ? "Unarchive" : "Archive"}
                </button>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8rem",
                    color: "#374151",
                    cursor: "pointer",
                    ...(isMobile ? { width: "100%" } : {}),
                    padding: isMobile ? "0.25rem 0" : 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedNote.reviewedFlag}
                    onChange={handleToggleReviewed}
                    style={isMobile ? { transform: "scale(1.05)" } : undefined}
                  />
                  Mark note as reviewed by provider
                </label>

                {finalSaveMsg && <span style={{ fontSize: "0.8rem", color: "#047857" }}>{finalSaveMsg}</span>}
              </div>

              <h4 style={{ marginTop: "0.9rem", marginBottom: "0.25rem", fontSize: "0.9rem", color: "#111827" }}>
                AI draft (original)
              </h4>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.83rem",
                  marginTop: "0.2rem",
                  color: "#4b5563",
                  background: "#f3f4f6",
                  padding: "0.5rem",
                  borderRadius: "0.6rem",
                  maxHeight: isMobile ? "240px" : "190px",
                  overflowY: "auto",
                  boxSizing: "border-box",
                }}
              >
                {selectedNote.noteText}
              </pre>
            </>
          )}
        </div>
      </div>

      {/* -------------------- Metadata Modal -------------------- */}
      <Modal
        open={metaOpen}
        title="Edit note metadata (audited)"
        onClose={() => setMetaOpen(false)}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setMetaOpen(false)}
              style={pillBtn({ border: "1px solid #e5e7eb", background: "#fff", color: PRIMARY, fontWeight: 500 })}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveMetadata}
              disabled={metaSaving}
              style={pillBtn({ border: "none", background: PRIMARY, color: "#fff", fontWeight: 500, cursor: metaSaving ? "wait" : "pointer" })}
            >
              {metaSaving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.45 }}>
          Use this for **corrections** (participant requests / provider fixes). All changes are recorded in the audit log.
        </p>

        {metaMsg && <p style={{ color: metaMsg === "Saved." ? "#047857" : "#b91c1c" }}>{metaMsg}</p>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Participant name
            </label>
            <input
              value={metaForm.participantName}
              onChange={(e) => setMetaForm((p) => ({ ...p, participantName: e.target.value }))}
              style={inputBase}
              placeholder="Participant name"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Location
            </label>
            <input
              value={metaForm.location}
              onChange={(e) => setMetaForm((p) => ({ ...p, location: e.target.value }))}
              style={inputBase}
              placeholder="Location"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Date
            </label>
            <input
              type="date"
              value={metaForm.date}
              onChange={(e) => setMetaForm((p) => ({ ...p, date: e.target.value }))}
              style={inputBase}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
                Start time
              </label>
              <input
                type="time"
                value={metaForm.startTime}
                onChange={(e) => setMetaForm((p) => ({ ...p, startTime: e.target.value }))}
                style={inputBase}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
                End time
              </label>
              <input
                type="time"
                value={metaForm.endTime}
                onChange={(e) => setMetaForm((p) => ({ ...p, endTime: e.target.value }))}
                style={inputBase}
              />
            </div>
          </div>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: "0.85rem", color: "#374151", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!metaForm.incidentFlag}
              onChange={(e) => setMetaForm((p) => ({ ...p, incidentFlag: e.target.checked }))}
            />
            Incident note
          </label>
        </div>
      </Modal>

      {/* -------------------- Export Modal -------------------- */}
      <Modal
        open={exportOpen}
        title="Export notes (audited)"
        onClose={() => setExportOpen(false)}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setExportOpen(false)}
              style={pillBtn({ border: "1px solid #e5e7eb", background: "#fff", color: PRIMARY, fontWeight: 500 })}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runExport}
              disabled={exporting}
              style={pillBtn({ border: "none", background: PRIMARY, color: "#fff", fontWeight: 500, cursor: exporting ? "wait" : "pointer" })}
            >
              {exporting ? "Exporting…" : "Download"}
            </button>
          </div>
        }
      >
        <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.45 }}>
          Use this for participant access requests and provider record exports.
        </p>

        {exportMsg && <p style={{ color: exportMsg.includes("failed") ? "#b91c1c" : "#047857" }}>{exportMsg}</p>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Participant (optional)
            </label>
            <input
              value={exportParticipant}
              onChange={(e) => setExportParticipant(e.target.value)}
              style={inputBase}
              placeholder="e.g. Ali"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Format
            </label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              style={{ ...selectBase, width: "100%", boxSizing: "border-box" }}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Date from (optional)
            </label>
            <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} style={inputBase} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Date to (optional)
            </label>
            <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} style={inputBase} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 600, marginBottom: 4 }}>
              Include archived
            </label>
            <select
              value={exportIncludeArchived}
              onChange={(e) => setExportIncludeArchived(e.target.value)}
              style={{ ...selectBase, width: "100%", boxSizing: "border-box" }}
            >
              <option value="all">All</option>
              <option value="true">Archived only</option>
              <option value="false">Exclude archived</option>
            </select>
          </div>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: "0.85rem", color: "#374151", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={exportIncludeDeleted}
              onChange={(e) => setExportIncludeDeleted(e.target.checked)}
            />
            Include deleted notes
          </label>
        </div>
      </Modal>

      {/* -------------------- Retention Settings Modal -------------------- */}
      <Modal
        open={settingsOpen}
        title="Retention settings (per provider)"
        onClose={() => setSettingsOpen(false)}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              style={pillBtn({ border: "1px solid #e5e7eb", background: "#fff", color: PRIMARY, fontWeight: 500 })}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsSaving}
              style={pillBtn({ border: "none", background: PRIMARY, color: "#fff", fontWeight: 500, cursor: settingsSaving ? "wait" : "pointer" })}
            >
              {settingsSaving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <p style={{ marginTop: 0, fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.45 }}>
          These settings control **retention + purge automation** for this provider organisation.
          Notes with **legal hold** are always excluded from purge.
        </p>

        {settingsMsg && <p style={{ color: settingsMsg === "Saved." ? "#047857" : "#b91c1c" }}>{settingsMsg}</p>}
        {settingsLoading ? (
          <p style={{ color: "#6b7280" }}>Loading…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 700, marginBottom: 4 }}>
                Retention days
              </label>
              <input
                type="number"
                min={30}
                value={orgSettings.retentionDays}
                onChange={(e) => setOrgSettings((p) => ({ ...p, retentionDays: e.target.value }))}
                style={inputBase}
              />
              <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#6b7280" }}>
                Minimum 30 days.
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#374151", fontWeight: 700, marginBottom: 4 }}>
                Delete grace days
              </label>
              <input
                type="number"
                min={0}
                value={orgSettings.deleteGraceDays}
                onChange={(e) => setOrgSettings((p) => ({ ...p, deleteGraceDays: e.target.value }))}
                style={inputBase}
              />
            </div>

            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: "0.9rem", color: "#111827", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!orgSettings.autoPurgeEnabled}
                onChange={(e) => setOrgSettings((p) => ({ ...p, autoPurgeEnabled: e.target.checked }))}
              />
              Enable automatic purge (recommended once configured)
            </label>
          </div>
        )}
      </Modal>
    </section>
  );
}

export default NotesDashboardPage;
