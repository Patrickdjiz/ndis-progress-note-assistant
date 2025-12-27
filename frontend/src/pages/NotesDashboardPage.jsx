// src/pages/NotesDashboardPage.jsx
import { useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "../lib/api";
import { fmtShiftDate, fmtDateTime } from "../lib/dateFormat";

const PRIMARY = "#111827";

function NotesDashboardPage({ token, user }) {
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  const [filterParticipant, setFilterParticipant] = useState("");
  const [filterIncident, setFilterIncident] = useState("all"); // all | true | false
  const [archiving, setArchiving] = useState(false);

  const [selectedNote, setSelectedNote] = useState(null);

  const [finalNoteEditText, setFinalNoteEditText] = useState("");
  const [finalSaveMsg, setFinalSaveMsg] = useState("");
  const [reviewerName, setReviewerName] = useState(user?.fullName || "");

  const [errorMsg, setErrorMsg] = useState("");

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const safeFile = (s) =>
  String(s || "")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 80);


  // ---------- Load notes list ----------
  const fetchNotes = async () => {
  try {
    setNotesLoading(true);
    setNotesError("");

    const params = new URLSearchParams();
    if (filterParticipant.trim()) params.append("participant", filterParticipant.trim());
    if (filterIncident !== "all") params.append("hasIncident", filterIncident);

    if (filterArchived !== "all") params.append("archived", filterArchived);
    else params.append("archived", "all");

    const path =
      "/api/notes" + (params.toString() ? `?${params.toString()}` : "");

    const data = await apiFetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setNotes(Array.isArray(data.notes) ? data.notes : []);
    setSelectedNote(null);
    setFinalNoteEditText("");
    setFinalSaveMsg("");
  } catch (err) {
    console.error("Error loading notes:", err);
    setNotesError(err?.message || "Failed to load notes");
  } finally {
    setNotesLoading(false);
  }
};


  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Select a note ----------
  const handleSelectNote = async (id) => {
  try {
    setNotesError("");
    setSelectedNote(null);
    setFinalNoteEditText("");
    setFinalSaveMsg("");
    setErrorMsg("");

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

      if (!selectedNote) {
        setErrorMsg("No note selected.");
        return;
      }
      if (!finalNoteEditText || !finalNoteEditText.toString().trim()) {
        setErrorMsg("Final note text cannot be empty.");
        return;
      }

      const data = await apiFetch(`/api/notes/${selectedNote.id}/finalise`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        finalNoteText: finalNoteEditText,
        reviewerName: reviewerName || undefined,
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
      if (!selectedNote) {
        setErrorMsg("No note selected.");
        return;
      }

      const data = await apiFetch(`/api/notes/${selectedNote.id}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reviewedFlag: !selectedNote.reviewedFlag,
        reviewerName: reviewerName || undefined,
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
      }}
    >
      {label}
    </span>
  );

  // ---------- savePDF ----------
  const handleDownloadPdf = async () => {
  try {
    setErrorMsg("");
    if (!selectedNote) {
      setErrorMsg("No note selected.");
      return;
    }

    setDownloadingPdf(true);

    const blob = await apiFetchBlob(`/api/notes/${selectedNote.id}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NDIS_Note_${safeFile(selectedNote.date)}_${safeFile(
      selectedNote.participantName
    )}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    setErrorMsg(e?.message || "Failed to download PDF.");
  } finally {
    setDownloadingPdf(false);
  }
};

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
      body: JSON.stringify({
        archivedFlag: next,
        archivedBy: reviewerName || undefined,
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


  return (
    <section>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", color: PRIMARY }}>
          Saved notes
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "#6b7280",
            marginTop: "0.25rem",
          }}
        >
          Review and finalise progress notes created by your team. This prototype
          stores data locally (SQLite) – for production use you&apos;ll need
          secure, Australian-hosted infrastructure and formal policies in place.
        </p>
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
          gap: "0.9rem",
          alignItems: "flex-end",
        }}
      >
        <div style={{ minWidth: "210px" }}>
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
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontSize: "0.85rem",
            }}
            placeholder="e.g. Ali"
          />
        </div>

        <div>
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
              padding: "0.45rem 0.6rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontSize: "0.85rem",
            }}
          >
            <option value="all">All notes</option>
            <option value="true">Incident notes only</option>
            <option value="false">Notes without incidents</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "#374151", marginBottom: "0.2rem" }}>
            Archived
          </label>
          <select
            value={filterArchived}
            onChange={(e) => setFilterArchived(e.target.value)}
            style={{ padding: "0.45rem 0.6rem", borderRadius: "0.5rem", border: "1px solid #d1d5db", fontSize: "0.85rem" }}
          >
            <option value="false">Hide archived</option>
            <option value="true">Archived only</option>
            <option value="all">All</option>
          </select>
        </div>


        <button
          type="button"
          onClick={fetchNotes}
          disabled={notesLoading}
          style={{
            padding: "0.5rem 1.2rem",
            borderRadius: "999px",
            border: "none",
            background: PRIMARY,
            color: "#f9fafb",
            fontSize: "0.85rem",
            fontWeight: 500,
            cursor: notesLoading ? "wait" : "pointer",
          }}
        >
          {notesLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {notesError && (
        <p style={{ color: "red", marginTop: "0.75rem" }}>{notesError}</p>
      )}
      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.4rem" }}>{errorMsg}</p>
      )}

      {/* Main layout */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1.1fr)",
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
            }}
          >
            <span style={{ fontWeight: 600, color: PRIMARY }}>
              Recent notes (max 50)
            </span>
            <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
              Click a row to review
            </span>
          </div>

          <div style={{ maxHeight: "360px", overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
              }}
            >
              <thead>
                <tr>
                  {["Date", "Participant", "Worker", "Location", "Incident", "Status"].map(
                    (h) => (
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
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
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
                      }}
                    >
                      <td
                        style={{
                          padding: "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtShiftDate(n.date)}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        {n.participantName}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        {n.workerName}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        {n.location}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        {n.incidentFlag
                          ? badge("Incident", {
                              bg: "#fef2f2",
                              color: "#b91c1c",
                            })
                          : badge("No incident", {
                              bg: "#ecfdf3",
                              color: "#166534",
                            })}
                      </td>
                      <td
                        style={{
                          padding: "0.4rem 0.7rem",
                          borderBottom: "1px solid #f3f4f6",
                        }}
                      >
                        {badge(
                          n.finalisedAt ? "Finalised" : "Draft",
                          n.finalisedAt
                            ? { bg: "#eff6ff", color: "#1d4ed8" }
                            : { bg: "#f3f4f6", color: "#4b5563" }
                        )}{" "}
                        {!!n.reviewedFlag &&
                          badge("Reviewed", {
                            bg: "#fef3c7",
                            color: "#92400e",
                          })}
                          {!!n.archivedFlag &&
                            badge("Archived", { bg: "#f3f4f6", color: "#111827" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.3rem",
              fontSize: "1rem",
              color: PRIMARY,
            }}
          >
            Note details
          </h3>

          {!selectedNote && (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Select a note on the left to review, edit the final wording and
              mark it as reviewed.
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
                }}
              >
                <strong>Participant:</strong> {selectedNote.participantName}
                <br />
                <strong>Worker:</strong> {selectedNote.workerName}
                <br />
                <strong>Date:</strong> {fmtShiftDate(selectedNote.date)}
                {selectedNote.startTime && selectedNote.endTime
                  ? `(${selectedNote.startTime}–${selectedNote.endTime})`
                  : ""}
                <br />
                <strong>Location:</strong> {selectedNote.location}
                <br />
                <strong>Incident:</strong>{" "}
                {selectedNote.incidentFlag ? "Yes" : "No"}
                <br />
                <strong>Status:</strong>{" "}
                {selectedNote.finalisedAt ? "Finalised" : "Draft"}
                {selectedNote.finalisedAt && (
                  <> (at {fmtDateTime(selectedNote.finalisedAt)})</>
                )}
                <br />
                <strong>Reviewed:</strong>{" "}
                {selectedNote.reviewedFlag ? "Yes" : "No"}
                {selectedNote.reviewedAt && (
                  <> (at {fmtDateTime(selectedNote.reviewedAt)})</>
                )}
              </p>

              {/* Reviewer name */}
              <div
                style={{
                  marginBottom: "0.55rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <label
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    color: "#374151",
                  }}
                >
                  Your name (for finalising / review)
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="e.g. Coordinator name"
                  style={{
                    padding: "0.4rem 0.5rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #d1d5db",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {/* Final note editor */}
              <h4
                style={{
                  marginTop: "0.2rem",
                  marginBottom: "0.2rem",
                  fontSize: "0.9rem",
                  color: "#111827",
                }}
              >
                Final note for this shift (editable)
              </h4>
              <textarea
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
                }}
              />

              <div
                style={{
                  marginTop: "0.6rem",
                  display: "flex",
                  gap: "0.65rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={handleSaveFinalNoteForSelected}
                  style={{
                    padding: "0.45rem 0.95rem",
                    borderRadius: "999px",
                    border: "none",
                    background: PRIMARY,
                    color: "#f9fafb",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Save final note for this shift
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf || !selectedNote}
                  style={{
                    padding: "0.45rem 0.95rem",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    color: PRIMARY,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: downloadingPdf ? "wait" : "pointer",
                  }}
                >
                  {downloadingPdf ? "Preparing PDF…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleToggleArchive}
                  disabled={archiving || !selectedNote}
                  style={{
                    padding: "0.45rem 0.95rem",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    background: selectedNote?.archivedFlag ? "#111827" : "#ffffff",
                    color: selectedNote?.archivedFlag ? "#ffffff" : PRIMARY,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: archiving ? "wait" : "pointer",
                  }}
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
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedNote.reviewedFlag}
                    onChange={handleToggleReviewed}
                  />
                  Mark note as reviewed by provider
                </label>

                {finalSaveMsg && (
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#047857",
                    }}
                  >
                    {finalSaveMsg}
                  </span>
                )}
              </div>

              {/* AI draft */}
              <h4
                style={{
                  marginTop: "0.9rem",
                  marginBottom: "0.25rem",
                  fontSize: "0.9rem",
                  color: "#111827",
                }}
              >
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
                  maxHeight: "190px",
                  overflowY: "auto",
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
