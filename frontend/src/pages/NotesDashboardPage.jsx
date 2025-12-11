// src/pages/NotesDashboardPage.jsx
import { useEffect, useState } from "react";

function NotesDashboardPage({ token, user }) {
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  const [filterParticipant, setFilterParticipant] = useState("");
  const [filterIncident, setFilterIncident] = useState("all"); // all | true | false

  const [selectedNote, setSelectedNote] = useState(null);

  // Editing final note from dashboard
  const [finalNoteEditText, setFinalNoteEditText] = useState("");
  const [finalSaveMsg, setFinalSaveMsg] = useState("");
  const [reviewerName, setReviewerName] = useState("");

  const [errorMsg, setErrorMsg] = useState("");

  // Load notes list
  const fetchNotes = async () => {
    try {
      setNotesLoading(true);
      setNotesError("");

      const params = new URLSearchParams();
      if (filterParticipant.trim()) {
        params.append("participant", filterParticipant.trim());
      }
      if (filterIncident !== "all") {
        params.append("hasIncident", filterIncident);
      }

      const url =
        "http://localhost:5000/api/notes" +
        (params.toString() ? `?${params.toString()}` : "");

      const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load notes");
      }

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

  // Fetch a single note by ID
  const handleSelectNote = async (id) => {
    try {
      setNotesError("");
      setSelectedNote(null);
      setFinalNoteEditText("");
      setFinalSaveMsg("");
      setErrorMsg("");

      const response = await fetch(
  `http://localhost:5000/api/notes/${id}`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch note");
      }

      setSelectedNote(data.note);
      setFinalNoteEditText(
        data.note.finalNoteText ? data.note.finalNoteText : data.note.noteText
      );
    } catch (err) {
      console.error("Error fetching note:", err);
      setNotesError(err?.message || "Failed to fetch note");
    }
  };

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

      const response = await fetch(
        `http://localhost:5000/api/notes/${selectedNote.id}/finalise`,
        {
          method: "POST",
          headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
},

          body: JSON.stringify({
            finalNoteText: finalNoteEditText,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save final note");
      }

      setFinalSaveMsg("Final note saved for this shift.");

      // Update selectedNote + list
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

  const handleToggleReviewed = async () => {
    try {
      setErrorMsg("");
      if (!selectedNote) {
        setErrorMsg("No note selected.");
        return;
      }

      const newFlag = !selectedNote.reviewedFlag;

      const response = await fetch(
        `http://localhost:5000/api/notes/${selectedNote.id}/review`,
        {
          method: "POST",
          headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
},

          body: JSON.stringify({
            reviewedFlag: newFlag,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update review status");
      }

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

  return (
    <section>
      <h2>Saved notes dashboard</h2>
      <p style={{ fontSize: "0.9rem", color: "#4b5563" }}>
        These notes are stored locally in your prototype database (SQLite). For
        production use with real NDIS data, you&apos;ll need secure,
        Australian-hosted infrastructure, authentication and formal policies in
        place.
      </p>

      {/* Filters + refresh */}
      <div
        style={{
          marginTop: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-end",
        }}
      >
        <div style={{ minWidth: "200px" }}>
          <label style={{ display: "block" }}>Filter by participant</label>
          <input
            type="text"
            value={filterParticipant}
            onChange={(e) => setFilterParticipant(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
            placeholder="e.g. Ali"
          />
        </div>

        <div>
          <label style={{ display: "block" }}>Incident filter</label>
          <select
            value={filterIncident}
            onChange={(e) => setFilterIncident(e.target.value)}
            style={{ padding: "0.4rem" }}
          >
            <option value="all">All notes</option>
            <option value="true">Incident notes only</option>
            <option value="false">Notes without incidents</option>
          </select>
        </div>

        <button
          type="button"
          onClick={fetchNotes}
          disabled={notesLoading}
          style={{
            padding: "0.6rem 1.2rem",
            cursor: notesLoading ? "wait" : "pointer",
          }}
        >
          {notesLoading ? "Loading notes..." : "Refresh"}
        </button>
      </div>

      {notesError && (
        <p style={{ color: "red", marginTop: "0.75rem" }}>{notesError}</p>
      )}
      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.4rem" }}>{errorMsg}</p>
      )}

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: "1rem",
        }}
      >
        {/* Notes table */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "0.6rem 0.8rem",
              borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontWeight: 600,
              color: "#000000ff",
            }}
          >
            Recent notes (max 50)
          </div>
          <div style={{ maxHeight: "350px", overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.6rem",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#111827",
                      fontWeight: 600,

                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.6rem",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#111827",
                      fontWeight: 600,
                    }}
                  >
                    Participant
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.6rem",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#111827",
                      fontWeight: 600,
                    }}
                  >
                    Worker
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.6rem",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#111827",
                      fontWeight: 600,
                    }}
                  >
                    Location
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.6rem",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#111827",
                      fontWeight: 600,
                    }}
                  >
                    Incident?
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.4rem 0.6rem",
                      borderBottom: "1px solid #e5e7eb",
                      color: "#111827",
                      fontWeight: 600,
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {notes.length === 0 && !notesLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "0.7rem",
                        textAlign: "center",
                        color: "#6b7280",
                      }}
                    >
                      No notes found. Generate a note and click Refresh.
                    </td>
                  </tr>
                )}
                {notes.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => handleSelectNote(n.id)}
                    style={{
                      cursor: "pointer",
                      color: "#000000ff",
                      background:
                        selectedNote && selectedNote.id === n.id
                          ? "#eff6ff"
                          : "white",
                    }}
                  >
                    <td
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {n.date}
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {n.participantName}
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {n.workerName}
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {n.location}
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #f3f4f6",
                        color: n.incidentFlag ? "#b91c1c" : "#047857",
                        fontWeight: 600,
                      }}
                    >
                      {n.incidentFlag ? "Yes" : "No"}
                    </td>
                    <td
                      style={{
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #f3f4f6",
                        color: n.finalisedAt ? "#047857" : "#6b7280",
                        fontWeight: 600,
                      }}
                    >
                      {n.finalisedAt ? "Finalised" : "Draft"}
                      {n.reviewedFlag ? " + Reviewed" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected note view */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.8rem",
            minHeight: "200px",
            background: "#f9fafb",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#000000ff" }}>Note details</h3>

          {!selectedNote && (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Click a row in the table to view and edit the note here.
            </p>
          )}

          {selectedNote && (
            <>
              <p
                style={{
                  fontSize: "0.9rem",
                  marginBottom: "0.4rem",
                  color: "#374151",
                }}
              >
                <strong>Participant:</strong> {selectedNote.participantName}
                <br />
                <strong>Worker:</strong> {selectedNote.workerName}
                <br />
                <strong>Date:</strong> {selectedNote.date}{" "}
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
                  <>
                    {" "}
                    (at {selectedNote.finalisedAt})
                  </>
                )}
                <br />
                <strong>Reviewed:</strong>{" "}
                {selectedNote.reviewedFlag ? "Yes" : "No"}
                {selectedNote.reviewedAt && (
                  <>
                    {" "}
                    (at {selectedNote.reviewedAt})
                  </>
                )}
              </p>

              <div
                style={{
                  marginBottom: "0.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                <label style={{ fontSize: "0.85rem", color: "#000000ff" }}>
                  Your name (for finalising / review)
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="e.g. Coordinator name"
                  style={{ padding: "0.3rem", fontSize: "0.85rem" }}
                />
              </div>

              <h4 style={{ marginTop: "0.5rem", marginBottom: "0.2rem", color: "#000000ff" }}>
                Final note for this shift (editable)
              </h4>
              <textarea
                rows={8}
                value={finalNoteEditText}
                onChange={(e) => setFinalNoteEditText(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  fontFamily: "inherit",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  resize: "vertical",
                }}
              />

              <div
                style={{
                  marginTop: "0.6rem",
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={handleSaveFinalNoteForSelected}
                  style={{
                    padding: "0.45rem 0.9rem",
                    cursor: "pointer",
                  }}
                >
                  Save final note for this shift
                </button>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    color: "#000000ff"
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
                    style={{ fontSize: "0.8rem", color: "#047857" }}
                  >
                    {finalSaveMsg}
                  </span>
                )}
              </div>

              <h4 style={{ marginTop: "0.7rem", marginBottom: "0.2rem", color: "#000000ff" }}>
                AI draft (original)
              </h4>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  marginTop: "0.2rem",
                  color: "#4b5563",
                  background: "#f3f4f6",
                  padding: "0.4rem",
                  borderRadius: "4px",
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
