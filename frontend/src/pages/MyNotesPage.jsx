import { useEffect, useState, useMemo } from "react";
import { apiFetch, apiFetchBlob } from "../lib/api";
import { fmtShiftDate, fmtDateTime, fmtHm } from "../lib/dateFormat";
import { downloadBlob } from "../lib/download";
import { useIsMobile } from "../lib/useIsMobile";


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

  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ✅ UI-only: responsive helper
  const isMobile = useIsMobile(760);

    const authHeaders = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const jsonHeaders = useMemo(() => {
    return { "Content-Type": "application/json", ...authHeaders };
  }, [authHeaders]);


  const ymdOnly = (v) => {
    const s = String(v || "");
    const m = s.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "date";
  };

  // ---------- Load list of notes (cursor pagination) ----------
const fetchNotes = async ({ append = false, cursor = undefined } = {}) => {
  try {
    append ? setLoadingMore(true) : setLoadingList(true);
    setErrorMsg("");

    if (!append) {
      setDetailError("");
      setFinalSaveMsg("");
      setNextCursor(null);
      // keep selectedNote + finalNoteEditText intact
    }

    const payload = {
      archived: false,
      limit: 50,
      ...(typeof cursor === "string" && cursor.length > 0 ? { cursor } : {}),
    };

    const data = await apiFetch("/api/notes/search", {
      method: "POST",
      headers: jsonHeaders,
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
    console.error("Error loading my notes:", err);
    setErrorMsg(err?.message || "Failed to load notes");
  } finally {
    append ? setLoadingMore(false) : setLoadingList(false);
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

      const data = await apiFetch(`/api/notes/${noteSummary.id}`, { headers: authHeaders });

      const fullNote = data.note;
      setSelectedNote(fullNote);
      setFinalNoteEditText(
        fullNote.finalNoteText && fullNote.finalNoteText.trim().length > 0 ? fullNote.finalNoteText : fullNote.noteText || ""
      );
    } catch (err) {
      console.error("Error fetching note details:", err);
      setDetailError(err?.message || "Failed to fetch note details");
    }
  };

  // ---------- Save / finalise note ----------
  const handleSaveFinalNote = async () => {
    try {
      setDetailError("");
      setFinalSaveMsg("");
      setSavingFinal(true);

      if (!selectedNote) return setDetailError("No note selected.");
      if (!finalNoteEditText || !finalNoteEditText.toString().trim()) {
        return setDetailError("Final note text cannot be empty.");
      }

      const data = await apiFetch(`/api/notes/${selectedNote.id}/finalise`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ finalNoteText: finalNoteEditText }),
      });

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

      const blob = await apiFetchBlob(`/api/notes/${selectedNote.id}/pdf`, { headers: authHeaders });

      const filename = `NDIS_Note_${selectedNote.id}_${ymdOnly(selectedNote.date)}.pdf`;
      downloadBlob(blob, filename);
    } catch (e) {
      setErrorMsg(e?.message || "Failed to download PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ✅ UI-only shared styles
  const pillBtn = (overrides = {}) => ({
    padding: "0.45rem 1.1rem",
    fontSize: "0.85rem",
    borderRadius: "999px",
    ...(isMobile ? { width: "100%", minHeight: 44 } : {}),
    ...overrides,
  });

  const inputBox = (overrides = {}) => ({
    width: "100%",
    padding: "0.6rem",
    fontFamily: "inherit",
    borderRadius: "0.75rem",
    border: "1px solid #d1d5db",
    boxSizing: "border-box",
    ...(isMobile ? { minHeight: 44 } : {}),
    ...overrides,
  });

  return (
    <section style={{ width: "100%", boxSizing: "border-box" }}>
      <div style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem", color: PRIMARY }}>My notes</h2>
        <p style={{ fontSize: "0.9rem", color: "#4b5563", marginTop: "0.25rem", lineHeight: 1.45 }}>
          These are notes you generated for your shifts. You can review them here, edit the final version, and copy them
          into your organisation&apos;s record system.
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
        <span style={{ fontSize: "0.85rem", color: "#6b7280", wordBreak: "break-word", flex: "1 1 auto" }}>
          Logged in as <strong>{user?.fullName || "User"}</strong> – worker view
        </span>
        <button
          type="button"
          onClick={() => fetchNotes()}
          disabled={loadingList}
          style={pillBtn({
            cursor: loadingList ? "wait" : "pointer",
            border: "none",
            background: PRIMARY,
            color: "#f9fafb",
            fontWeight: 500,
            ...(isMobile ? { maxWidth: 260 } : {}),
          })}
        >
          {loadingList ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {errorMsg && <p style={{ color: "red", marginTop: "0.6rem", wordBreak: "break-word" }}>{errorMsg}</p>}

      {/* Main layout */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1.05fr) minmax(0, 1.1fr)",
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
            minWidth: 0,
          }}
        >
          <div style={{ marginBottom: "0.4rem", fontSize: "0.9rem", fontWeight: 600, color: PRIMARY }}>Your recent notes</div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
              maxHeight: isMobile ? "320px" : "360px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {notes.length === 0 && !loadingList && (
              <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
                No notes yet. Generate a note from the home screen and it will appear here.
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
                    border: isSelected ? "2px solid #2563eb" : "1px solid #e5e7eb",
                    padding: isMobile ? "0.7rem 0.75rem" : "0.55rem 0.65rem",
                    background: isSelected ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                    touchAction: "manipulation",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.2rem", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#111827", wordBreak: "break-word" }}>
                      {note.participantName}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#6b7280", whiteSpace: "nowrap" }}>{fmtShiftDate(note.date)}</span>
                  </div>

                  <div style={{ fontSize: "0.8rem", color: "#4b5563", marginBottom: "0.3rem", wordBreak: "break-word" }}>{note.location}</div>

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", fontSize: "0.75rem" }}>
                    {badge(isFinalised ? "Finalised" : "Draft", isFinalised ? { bg: "#ecfdf3", color: "#166534" } : { bg: "#f3f4f6", color: "#374151" })}
                    {badge(hasIncident ? "Incident" : "No incident", hasIncident ? { bg: "#fef2f2", color: "#b91c1c" } : { bg: "#e0f2fe", color: "#0369a1" })}
                  </div>
                </button>
              );
            })}
          </div>

          {nextCursor && (
            <div style={{ marginTop: "0.6rem" }}>
              <button
                type="button"
                onClick={() => fetchNotes({ append: true, cursor: nextCursor })}
                disabled={loadingMore}
                style={pillBtn({
                  padding: "0.45rem 0.95rem",
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

        {/* Note details */}
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            padding: "0.8rem 0.9rem",
            minHeight: "220px",
            minWidth: 0,
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "1rem", color: PRIMARY }}>Note details</h3>

          {!selectedNote && <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>Tap a note on the left to view and edit the final text.</p>}

          {detailError && <p style={{ color: "red", marginBottom: "0.4rem", wordBreak: "break-word" }}>{detailError}</p>}

          {selectedNote && (
            <>
              <p style={{ fontSize: "0.85rem", color: "#374151", marginBottom: "0.5rem", lineHeight: 1.45, wordBreak: "break-word" }}>
                <strong>Participant:</strong> {selectedNote.participantName}
                <br />
                <strong>Date:</strong> {fmtShiftDate(selectedNote.date)}{" "}
                {selectedNote.startTime && selectedNote.endTime ? ` (${fmtHm(selectedNote.startTime)}–${fmtHm(selectedNote.endTime)})` : ""}
                <br />
                <strong>Location:</strong> {selectedNote.location}
                <br />
                <strong>Status:</strong> {selectedNote.finalisedAt ? "Finalised" : "Draft"}
                {selectedNote.finalisedAt && <> (at {fmtDateTime(selectedNote.finalisedAt)})</>}
                <br />
                <strong>Incident:</strong> {selectedNote.incidentFlag ? "Yes" : "No"}
              </p>

              <h4 style={{ fontSize: "0.9rem", marginTop: "0.3rem", marginBottom: "0.25rem", color: "#111827" }}>
                Final note for this shift (editable)
              </h4>
              <textarea maxLength={12000} rows={8} value={finalNoteEditText} onChange={(e) => setFinalNoteEditText(e.target.value)} style={inputBox({ resize: "vertical" })} />

              <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSaveFinalNote}
                  disabled={savingFinal}
                  style={pillBtn({
                    padding: "0.45rem 0.9rem",
                    cursor: savingFinal ? "wait" : "pointer",
                    border: "none",
                    background: PRIMARY,
                    color: "#f9fafb",
                    fontSize: "0.9rem",
                  })}
                >
                  {savingFinal ? "Saving…" : "Save final note"}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf || !selectedNote || !!selectedNote.purgedAt}
                  style={pillBtn({
                    padding: "0.45rem 0.95rem",
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    color: PRIMARY,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: downloadingPdf ? "wait" : "pointer",
                  })}
                >
                  {selectedNote?.purgedAt ? "PDF unavailable (purged)" : downloadingPdf ? "Preparing PDF…" : "Download PDF"}
                </button>

                {finalSaveMsg && <span style={{ fontSize: "0.8rem", color: "#047857" }}>{finalSaveMsg}</span>}
              </div>

              <h4 style={{ fontSize: "0.9rem", marginTop: "0.9rem", marginBottom: "0.25rem", color: "#111827" }}>AI draft (original)</h4>
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
                  maxHeight: isMobile ? "260px" : "200px",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  boxSizing: "border-box",
                  wordBreak: "break-word",
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
