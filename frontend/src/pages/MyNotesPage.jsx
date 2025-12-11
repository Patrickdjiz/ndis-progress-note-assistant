// src/pages/MyNotesPage.jsx
import { useEffect, useState } from "react";

function MyNotesPage({ token, user }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedNote, setSelectedNote] = useState(null);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      setSelectedNote(null);

      const res = await fetch("http://localhost:5000/api/notes", {
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (note) => {
    setSelectedNote(note);
  };

  const getNoteBody = (note) => {
    if (!note) return "";
    return note.finalNoteText && note.finalNoteText.trim().length > 0
      ? note.finalNoteText
      : note.noteText || "";
  };

  return (
    <section>
      <h2>My notes</h2>
      <p style={{ fontSize: "0.9rem", color: "#4b5563" }}>
        These are notes you generated for your shifts. You can read them here
        and copy them into your organisation&apos;s record system.
      </p>

      <div
        style={{
          marginTop: "0.75rem",
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
          disabled={loading}
          style={{
            padding: "0.45rem 1rem",
            fontSize: "0.85rem",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.6rem" }}>{errorMsg}</p>
      )}

      <div
        style={{
          marginTop: "0.9rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.3fr)",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.7rem",
            maxHeight: "420px",
            overflowY: "auto",
          }}
        >
          {notes.length === 0 && !loading && (
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
                  borderRadius: "8px",
                  border: isSelected
                    ? "2px solid #2563eb"
                    : "1px solid #e5e7eb",
                  padding: "0.6rem 0.7rem",
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
                    style={{ fontWeight: 600, fontSize: "0.95rem" }}
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
                    marginBottom: "0.25rem",
                  }}
                >
                  <span>{note.location}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.4rem",
                    flexWrap: "wrap",
                    fontSize: "0.75rem",
                  }}
                >
                  <span
                    style={{
                      padding: "0.1rem 0.45rem",
                      borderRadius: "999px",
                      border: "1px solid #e5e7eb",
                      background: isFinalised ? "#ecfdf3" : "#f3f4f6",
                      color: isFinalised ? "#166534" : "#374151",
                    }}
                  >
                    {isFinalised ? "Finalised" : "Draft"}
                  </span>
                  <span
                    style={{
                      padding: "0.1rem 0.45rem",
                      borderRadius: "999px",
                      border: "1px solid #e5e7eb",
                      background: hasIncident ? "#fef2f2" : "#f0f9ff",
                      color: hasIncident ? "#b91c1c" : "#0369a1",
                    }}
                  >
                    {hasIncident ? "Incident" : "No incident"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            padding: "0.8rem",
            background: "#f9fafb",
            minHeight: "200px",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.4rem",
              fontSize: "1rem",
              color: "#111827",
            }}
          >
            Note details
          </h3>

          {!selectedNote && (
            <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              Tap a note on the left to read the full text here.
            </p>
          )}

          {selectedNote && (
            <>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                <strong>Participant:</strong>{" "}
                {selectedNote.participantName}
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
                Note text
              </h4>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.85rem",
                  marginTop: "0.2rem",
                  color: "#374151",
                  background: "#f3f4f6",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  maxHeight: "260px",
                  overflowY: "auto",
                }}
              >
                {getNoteBody(selectedNote)}
              </pre>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default MyNotesPage;
