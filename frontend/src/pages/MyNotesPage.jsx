// src/pages/MyNotesPage.jsx
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const PRIMARY = "#111827";

function MyNotesPage({ token, user }) {
  const [notes, setNotes] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedNote, setSelectedNote] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [finalNoteEditText, setFinalNoteEditText] = useState("");
  const [finalSaveMsg, setFinalSaveMsg] = useState("");
  const [savingFinal, setSavingFinal] = useState(false);

  // ---------- Load list of notes ----------
  const fetchNotes = async () => {
    try {
      setLoadingList(true);
      setErrorMsg("");
      setSelectedNote(null);
      setFinalNoteEditText("");
      setFinalSaveMsg("");
      setDetailError("");

      const res = await apiFetch("/api/notes", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load notes");
      }

      setNotes(Array.isArray(data.notes) ? data.notes : []);
    } catch (err) {
      console.error("Error loading my notes:", err);
      setErrorMsg(err?.message || "Failed to load notes");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Load full details for a single note ----------
  const handleSelect = async (noteSummary) => {
    try {
      setDetailError("");
      setFinalSaveMsg("");

      const res = await fetch(
        `http://localhost:5000/api/notes/${noteSummary.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch note");
      }

      const fullNote = data.note;
      setSelectedNote(fullNote);
      setFinalNoteEditText(
        fullNote.finalNoteText && fullNote.finalNoteText.trim().length > 0
          ? fullNote.finalNoteText
          : fullNote.noteText || ""
      );
    } catch (err) {
      console.error("Error fetching note details:", err);
      setDetailError(err?.message || "Failed to fetch note details");
    }
  };

  // ---------- Save / finalise note from worker view ----------
  const handleSaveFinalNote = async () => {
    try {
      setDetailError("");
      setFinalSaveMsg("");
      setSavingFinal(true);

      if (!selectedNote) {
        setDetailError("No note selected.");
        return;
      }
      if (!finalNoteEditText || !finalNoteEditText.toString().trim()) {
        setDetailError("Final note text cannot be empty.");
        return;
      }

      const res = await fetch(
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save final note");
      }

      // Update selected note with new final text + timestamps
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

      // Refresh list so the badge switches to "Finalised"
      fetchNotes();

      setFinalSaveMsg("Final note saved for this shift.");
    } catch (err) {
      console.error("Error saving final note:", err);
      setDetailError(err?.message || "Failed to save final note");
    } finally {
      setSavingFinal(false);
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

  return (
    <section>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", color: PRIMARY }}>
          My notes
        </h2>
        <p
          style={{
            fontSize: "0.9rem",
            color: "#4b5563",
            marginTop: "0.25rem",
          }}
        >
          These are notes you generated for your shifts. You can review them
          here, edit the final version, and copy them into your
          organisation&apos;s record system.
        </p>
      </div>

      {/* Top bar */}
      <div
        style={{
          marginTop: "0.25rem",
          padding: "0.6rem 0.8rem",
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          Logged in as <strong>{user.fullName}</strong> – worker view
        </span>
        <button
          type="button"
          onClick={fetchNotes}
          disabled={loadingList}
          style={{
            padding: "0.45rem 1.1rem",
            fontSize: "0.85rem",
            cursor: loadingList ? "wait" : "pointer",
            borderRadius: "999px",
            border: "none",
            background: PRIMARY,
            color: "#f9fafb",
            fontWeight: 500,
          }}
        >
          {loadingList ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.6rem" }}>{errorMsg}</p>
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
        {/* Notes list */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            padding: "0.6rem 0.75rem 0.7rem",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              marginBottom: "0.4rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: PRIMARY,
            }}
          >
            Your recent notes
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              maxHeight: "360px",
              overflowY: "auto",
            }}
          >
            {notes.length === 0 && !loadingList && (
              <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
                No notes yet. Generate a note from the home screen and it will
                appear here.
              </p>
            )}

            {notes.map((note) => {
              const isSelected = selectedNote && selectedNote.id === note.id;
              const isFinalised = !!note.finalisedAt;
              const hasIncident = !!note.incidentFlag;

              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => handleSelect(note)}
                  style={{
                    textAlign: "left",
                    borderRadius: "0.75rem",
                    border: isSelected
                      ? "2px solid #2563eb"
                      : "1px solid #e5e7eb",
                    padding: "0.55rem 0.65rem",
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: "0.2rem",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        color: "#111827",
                      }}
                    >
                      {note.participantName}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#6b7280",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {note.date}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#4b5563",
                      marginBottom: "0.3rem",
                    }}
                  >
                    {note.location}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      flexWrap: "wrap",
                      fontSize: "0.75rem",
                    }}
                  >
                    {badge(
                      isFinalised ? "Finalised" : "Draft",
                      isFinalised
                        ? { bg: "#ecfdf3", color: "#166534" }
                        : { bg: "#f3f4f6", color: "#374151" }
                    )}
                    {badge(
                      hasIncident ? "Incident" : "No incident",
                      hasIncident
                        ? { bg: "#fef2f2", color: "#b91c1c" }
                        : { bg: "#e0f2fe", color: "#0369a1" }
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Note details + finalise */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            padding: "0.8rem 0.9rem",
            minHeight: "220px",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.4rem",
              fontSize: "1rem",
              color: PRIMARY,
            }}
          >
            Note details
          </h3>

          {!selectedNote && (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Tap a note on the left to view and edit the final text.
            </p>
          )}

          {detailError && (
            <p style={{ color: "red", marginBottom: "0.4rem" }}>
              {detailError}
            </p>
          )}

          {selectedNote && (
            <>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#374151",
                  marginBottom: "0.5rem",
                  lineHeight: 1.45,
                }}
              >
                <strong>Participant:</strong> {selectedNote.participantName}
                <br />
                <strong>Date:</strong> {selectedNote.date}{" "}
                {selectedNote.startTime && selectedNote.endTime
                  ? `(${selectedNote.startTime}–${selectedNote.endTime})`
                  : ""}
                <br />
                <strong>Location:</strong> {selectedNote.location}
                <br />
                <strong>Status:</strong>{" "}
                {selectedNote.finalisedAt ? "Finalised" : "Draft"}
                {selectedNote.finalisedAt && (
                  <> (at {selectedNote.finalisedAt})</>
                )}
                <br />
                <strong>Incident:</strong>{" "}
                {selectedNote.incidentFlag ? "Yes" : "No"}
              </p>

              <h4
                style={{
                  fontSize: "0.9rem",
                  marginTop: "0.3rem",
                  marginBottom: "0.25rem",
                  color: "#111827",
                }}
              >
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
                  borderRadius: "0.75rem",
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
                  onClick={handleSaveFinalNote}
                  disabled={savingFinal}
                  style={{
                    padding: "0.45rem 0.9rem",
                    cursor: savingFinal ? "wait" : "pointer",
                    borderRadius: "999px",
                    border: "none",
                    background: PRIMARY,
                    color: "#f9fafb",
                    fontSize: "0.9rem",
                  }}
                >
                  {savingFinal ? "Saving…" : "Save final note"}
                </button>

                {finalSaveMsg && (
                  <span
                    style={{ fontSize: "0.8rem", color: "#047857" }}
                  >
                    {finalSaveMsg}
                  </span>
                )}
              </div>

              <h4
                style={{
                  fontSize: "0.9rem",
                  marginTop: "0.9rem",
                  marginBottom: "0.25rem",
                  color: "#111827",
                }}
              >
                AI draft (original)
              </h4>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  marginTop: "0.2rem",
                  color: "#374151",
                  background: "#f3f4f6",
                  padding: "0.6rem",
                  borderRadius: "0.75rem",
                  maxHeight: "200px",
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

export default MyNotesPage;
