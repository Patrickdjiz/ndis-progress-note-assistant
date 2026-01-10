import { useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "../lib/api";
import { fmtShiftDate, fmtDateTime, fmtHm } from "../lib/dateFormat";
import { downloadBlob } from "../lib/download";
import { useIsMobile } from "../lib/useIsMobile";


const PRIMARY = "#111827";

function NotesDashboardPage({ token, user }) {
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  const [filterParticipant, setFilterParticipant] = useState("");
  const [debouncedParticipant, setDebouncedParticipant] = useState("");
  const [filterIncident, setFilterIncident] = useState("all"); // all | true | false
  const [filterArchived, setFilterArchived] = useState("false"); // false | true | all

  const [archiving, setArchiving] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);

  const [finalNoteEditText, setFinalNoteEditText] = useState("");
  const [finalSaveMsg, setFinalSaveMsg] = useState("");

  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ✅ UI-only: responsive helper
  const isMobile = useIsMobile(760);


  // Debounce participant filter to avoid spamming requests while typing
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedParticipant(filterParticipant.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [filterParticipant]);

  const ymdOnly = (v) => {
    const s = String(v || "");
    const m = s.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "date";
  };

  // ---------- Load notes list ----------
  const fetchNotes = async ({ append = false, cursor = null } = {}) => {
  try {
    append ? setLoadingMore(true) : setNotesLoading(true);
    setNotesError("");
    setErrorMsg("");

    const limit = 50;

    const hasIncidentValue =
      filterIncident === "all" ? undefined : filterIncident === "true";

    const archivedValue =
      filterArchived === "all" ? "all" : filterArchived === "true";

    const data = await apiFetch("/api/notes/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        participant: debouncedParticipant || undefined,
        hasIncident: hasIncidentValue,
        archived: archivedValue,
        limit,
        cursor,
      }),
    });

    const incoming = Array.isArray(data.notes) ? data.notes : [];

    // Build new list
    setNotes((prev) => (append ? [...prev, ...incoming] : incoming));
    setNextCursor(data.nextCursor || null);

    // ✅ If we're NOT appending and the currently selected note is no longer in the list,
    // clear the selection (important when "Hide archived" is on and you just archived it).
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



  // Initial load
  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto refresh when filters change (participant is debounced)
  useEffect(() => {
    setNextCursor(null);
    setSelectedNote(null);
    setFinalNoteEditText("");
    setFinalSaveMsg("");
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedParticipant, filterIncident, filterArchived]);

  // ---------- Select a note ----------
  const handleSelectNote = async (id) => {
    try {
      setNotesError("");
      setErrorMsg("");
      setFinalSaveMsg("");

      const data = await apiFetch(`/api/notes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSelectedNote(data.note);
      setFinalNoteEditText(
        data.note.finalNoteText ? data.note.finalNoteText : data.note.noteText
      );
    } catch (err) {
      console.error("Error fetching note:", err);
      setNotesError(err?.message || "Failed to fetch note");
    }
  };

  // ---------- Save final note ----------
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          finalNoteText: finalNoteEditText,
        }),
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

  // ---------- Toggle reviewed flag ----------
  const handleToggleReviewed = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return setErrorMsg("No note selected.");

      const data = await apiFetch(`/api/notes/${selectedNote.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // ✅ Backend uses req.user.fullName — don’t send reviewerName
        body: JSON.stringify({
          reviewedFlag: !selectedNote.reviewedFlag,
        }),
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

  // ---------- Download PDF ----------
  const handleDownloadPdf = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return setErrorMsg("No note selected.");

      setDownloadingPdf(true);
      const blob = await apiFetchBlob(`/api/notes/${selectedNote.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const filename = `NDIS_Note_${selectedNote.id}_${ymdOnly(selectedNote.date)}.pdf`;

      downloadBlob(blob, filename);
    } catch (e) {
      setErrorMsg(e?.message || "Failed to download PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ---------- Toggle Archive ----------
  const handleToggleArchive = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) return;

      setArchiving(true);
      const next = !selectedNote.archivedFlag;

      const data = await apiFetch(`/api/notes/${selectedNote.id}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // ✅ Backend uses req.user.fullName — don’t send archivedBy
        body: JSON.stringify({
          archivedFlag: next,
        }),
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

  // ✅ Shared input sizing for mobile tap targets
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
    padding: "0.5rem 1.2rem",
    borderRadius: "999px",
    fontSize: "0.85rem",
    fontWeight: 500,
    ...(isMobile ? { width: "100%", minHeight: 44 } : {}),
    ...overrides,
  });

  const actingName = user?.fullName || "Unknown user";

  return (
    <section style={{ width: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", color: PRIMARY }}>
          Saved notes
        </h2>
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
        <div
          style={{
            minWidth: isMobile ? "0" : "210px",
            flex: isMobile ? "1 1 100%" : "0 0 auto",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 500,
              color: "#374151",
              marginBottom: "0.2rem",
            }}
          >
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
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 500,
              color: "#374151",
              marginBottom: "0.2rem",
            }}
          >
            Incident filter
          </label>
          <select
            value={filterIncident}
            onChange={(e) => setFilterIncident(e.target.value)}
            style={{
              ...selectBase,
              width: isMobile ? "100%" : undefined,
              boxSizing: "border-box",
            }}
          >
            <option value="all">All notes</option>
            <option value="true">Incident notes only</option>
            <option value="false">Notes without incidents</option>
          </select>
        </div>

        <div style={{ flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              fontWeight: 500,
              color: "#374151",
              marginBottom: "0.2rem",
            }}
          >
            Archived
          </label>
          <select
            value={filterArchived}
            onChange={(e) => setFilterArchived(e.target.value)}
            style={{
              ...selectBase,
              width: isMobile ? "100%" : undefined,
              boxSizing: "border-box",
            }}
          >
            <option value="false">Hide archived</option>
            <option value="true">Archived only</option>
            <option value="all">All</option>
          </select>
        </div>

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
        <p
          style={{
            color: "red",
            marginTop: "0.75rem",
            wordBreak: "break-word",
          }}
        >
          {notesError}
        </p>
      )}
      {errorMsg && (
        <p
          style={{
            color: "red",
            marginTop: "0.4rem",
            wordBreak: "break-word",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Main layout */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: isMobile
            ? "minmax(0, 1fr)"
            : "minmax(0, 1.05fr) minmax(0, 1.1fr)",
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
                minWidth: isMobile ? 820 : undefined,
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Date",
                    "Participant",
                    "Worker",
                    "Location",
                    "Incident",
                    "Status",
                  ].map((h) => (
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
                    <td
                      colSpan={6}
                      style={{
                        padding: "0.8rem",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      No notes found. Generate a note and click Refresh.
                    </td>
                  </tr>
                )}

                {notes.map((n) => {
                  const isSelected = selectedNote && selectedNote.id === n.id;
                  return (
                    <tr
                      key={n.id}
                      onClick={() => handleSelectNote(n.id)}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        touchAction: "manipulation",
                      }}
                    >
                      <td
                        style={{
                          padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtShiftDate(n.date)}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.participantName}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.workerName}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {n.location}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        {n.incidentFlag
                          ? badge("Incident", { bg: "#fef2f2", color: "#b91c1c" })
                          : badge("No incident", { bg: "#ecfdf3", color: "#166534" })}
                      </td>
                      <td
                        style={{
                          padding: isMobile ? "0.55rem 0.7rem" : "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge(
                          n.finalisedAt ? "Finalised" : "Draft",
                          n.finalisedAt
                            ? { bg: "#eff6ff", color: "#1d4ed8" }
                            : { bg: "#f3f4f6", color: "#4b5563" }
                        )}{" "}
                        {!!n.reviewedFlag && badge("Reviewed", { bg: "#fef3c7", color: "#92400e" })}{" "}
                        {!!n.archivedFlag && badge("Archived", { bg: "#f3f4f6", color: "#111827" })}
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
                  fontWeight: 600,
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
              </p>

              {/* ✅ Replaces typed reviewerName input (backend ignores it) */}
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
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#111827", marginBottom: "0.15rem" }}>
                  Audit identity (auto)
                </div>
                <div>
                  <strong>Reviewed by:</strong> {actingName}
                  <br />
                  <strong>Archived by:</strong> {actingName}
                </div>
              </div>

              <h4 style={{ marginTop: "0.2rem", marginBottom: "0.2rem", fontSize: "0.9rem", color: "#111827" }}>
                Final note for this shift (editable)
              </h4>

              <textarea
                maxLength={12000}
                rows={7}
                value={finalNoteEditText}
                onChange={(e) => setFinalNoteEditText(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  borderRadius: "0.6rem",
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                  background: "#f9fafb",
                  boxSizing: "border-box",
                }}
              />

              <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSaveFinalNoteForSelected}
                  style={pillBtn({
                    border: "none",
                    background: PRIMARY,
                    color: "#f9fafb",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: "pointer",
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
                    fontWeight: 600,
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
                    fontWeight: 600,
                    cursor: archiving ? "wait" : "pointer",
                  })}
                >
                  {archiving ? "Updating…" : selectedNote?.archivedFlag ? "Restore" : "Archive"}
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
    </section>
  );
}

export default NotesDashboardPage;
