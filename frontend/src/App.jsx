import { useState, useEffect } from "react";

function App() {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [participantName, setParticipantName] = useState("");
  const [date, setDate] = useState(todayIso);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [activitiesAndSupports, setActivitiesAndSupports] = useState("");
  const [participantPresentation, setParticipantPresentation] = useState("");
  const [goalsWorkedOn, setGoalsWorkedOn] = useState("");
  const [incidentsOrRisks, setIncidentsOrRisks] = useState("");
  const [followUpActions, setFollowUpActions] = useState("");
  const [workerName, setWorkerName] = useState("");

  // Incident UI flags
  const [incidentOccurred, setIncidentOccurred] = useState(false); // checkbox
  const [noteHasIncident, setNoteHasIncident] = useState(false); // what the note actually says

  // Output + UI state
  const [generatedNote, setGeneratedNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  // Dashboard state
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [selectedNote, setSelectedNote] = useState(null);
  const [filterParticipant, setFilterParticipant] = useState("");
  const [filterIncident, setFilterIncident] = useState("all"); // "all" | "true" | "false"

  const [latestNoteId, setLatestNoteId] = useState(null);
  const [finalNoteText, setFinalNoteText] = useState("");
  const [finalSaveMsg, setFinalSaveMsg] = useState("");

  const [dashboardEditText, setDashboardEditText] = useState("");
  const [dashboardSaveMsg, setDashboardSaveMsg] = useState("");
  const [reviewToggleMsg, setReviewToggleMsg] = useState("");


  // Fetch notes from backend with current filters
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

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load notes");
      }

      setNotes(Array.isArray(data.notes) ? data.notes : []);
      // If filters change, clear selected note so we don't show stale data
      setSelectedNote(null);
    } catch (err) {
      console.error("Error loading notes:", err);
      setNotesError(err?.message || "Failed to load notes");
    } finally {
      setNotesLoading(false);
    }
  };

  // Fetch a single note by ID
  const handleSelectNote = async (id) => {
    try {
      setNotesError("");
      setSelectedNote(null);

      const response = await fetch(`http://localhost:5000/api/notes/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch note");
      }

      setSelectedNote(data.note);
      setDashboardEditText(
      data.note.finalNoteText || data.note.noteText || ""
      );
      setDashboardSaveMsg("");
      setReviewToggleMsg("");
    } catch (err) {
      console.error("Error fetching note:", err);
      setNotesError(err?.message || "Failed to fetch note");
    }
  };

  // Initial load of recent notes on page load
  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    // quick front-end validation
    const fields = {
      participantName,
      date,
      startTime,
      endTime,
      location,
      activitiesAndSupports,
      participantPresentation,
      goalsWorkedOn,
      incidentsOrRisks,
      followUpActions,
      workerName,
    };

    const missing = Object.entries(fields)
      .filter(([, value]) => !value || !value.toString().trim())
      .map(([key]) => key);

    if (missing.length > 0) {
      setErrorMsg("Please complete all fields before generating a note.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setGeneratedNote("");
    setCopied(false);
    setNoteHasIncident(false);

    try {
      const response = await fetch("http://localhost:5000/api/generate-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantName,
          date,
          startTime,
          endTime,
          location,
          activitiesAndSupports,
          participantPresentation,
          goalsWorkedOn,
          incidentsOrRisks,
          followUpActions,
          workerName,
          incidentOccurred,
        }),
      });

    const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate note");
      }

      // AI draft
      setGeneratedNote(data.note);

      // Set up final note editable copy
      setFinalNoteText(data.note || "");
      setLatestNoteId(data.id || null);
      setFinalSaveMsg("");

      // Check if this shift includes an incident for the banner
      const incText = (incidentsOrRisks || "").trim();
      const looksLikeNoIncident =
        /^no incidents?|^no incident|^no concerns?/i.test(incText);

      setNoteHasIncident(
        incidentOccurred === true &&
          incText.length > 0 &&
          !looksLikeNoIncident
      );

    // Refresh notes list after a successful save
    fetchNotes();

    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Something went wrong");
      setNoteHasIncident(false);
      setLatestNoteId(null);
      setFinalNoteText("");
      setFinalSaveMsg("");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFinalNote = async () => {
  try {
    setFinalSaveMsg("");
    setErrorMsg("");

    if (!latestNoteId) {
      setErrorMsg(
        "No generated note to save. Please generate a note first."
      );
      return;
    }

    if (!finalNoteText || !finalNoteText.toString().trim()) {
      setErrorMsg("Final note text cannot be empty.");
      return;
    }

    const response = await fetch(
      `http://localhost:5000/api/notes/${latestNoteId}/finalise`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalNoteText,
          // In a real system this would be the logged-in user,
          // for now we use the workerName as a simple stand-in.
          finalisedBy: workerName,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to save final note");
    }

    setFinalSaveMsg("Final note saved.");
    // Refresh dashboard so status updates
    fetchNotes();
  } catch (err) {
    console.error("Error saving final note:", err);
    setErrorMsg(err?.message || "Failed to save final note");
  }
};

// Save the selected note's text as the final note (from the dashboard)
const handleDashboardSaveFinal = async () => {
  if (!selectedNote) return;

  if (!dashboardEditText || !dashboardEditText.toString().trim()) {
    setErrorMsg("Final note text cannot be empty.");
    return;
  }

  try {
    setErrorMsg("");
    setDashboardSaveMsg("");

    const response = await fetch(
      `http://localhost:5000/api/notes/${selectedNote.id}/finalise`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalNoteText: dashboardEditText,
          // In a real system this would be the logged-in user.
          finalisedBy: workerName || "Dashboard editor",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to save final note");
    }

    setDashboardSaveMsg("Final note saved from dashboard.");

    // Update the selected note in state
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

    // Refresh table so status column updates
    fetchNotes();
  } catch (err) {
    console.error("Error saving final note from dashboard:", err);
    setErrorMsg(err?.message || "Failed to save final note");
  }
};

// Toggle reviewed flag for selected note
const handleToggleReviewed = async () => {
  if (!selectedNote) return;

  try {
    setErrorMsg("");
    setReviewToggleMsg("");

    const newFlag = selectedNote.reviewedFlag ? false : true;

    const response = await fetch(
      `http://localhost:5000/api/notes/${selectedNote.id}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewedFlag: newFlag,
          reviewedBy: workerName || "Reviewer",
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

    setReviewToggleMsg(
      data.reviewedFlag ? "Marked as reviewed." : "Review mark removed."
    );

    fetchNotes();
  } catch (err) {
    console.error("Error updating review status:", err);
    setErrorMsg(err?.message || "Failed to update review status");
  }
};



  const handleCopyNote = async () => {
    if (!generatedNote) return;
    try {
      await navigator.clipboard.writeText(generatedNote);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard error:", e);
      setErrorMsg("Could not copy to clipboard. You can copy manually.");
    }
  };

  const handleCopyFinalNote = async () => {
  if (!finalNoteText) return;
  try {
    await navigator.clipboard.writeText(finalNoteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch (e) {
    console.error("Clipboard error (final note):", e);
    setErrorMsg("Could not copy final note. You can copy manually.");
  }
};

  const handleClearForm = () => {
  setParticipantName("");
  setDate(todayIso);
  setStartTime("");
  setEndTime("");
  setLocation("");
  setActivitiesAndSupports("");
  setParticipantPresentation("");
  setGoalsWorkedOn("");
  setIncidentsOrRisks("");
  setFollowUpActions("");
  setWorkerName("");

  setIncidentOccurred(false);
  setNoteHasIncident(false);

  // Clear generated + error state
  setGeneratedNote("");
  setErrorMsg("");
  setCopied(false);

  // 🔹 Clear final-note state as well
  setLatestNoteId(null);
  setFinalNoteText("");
  setFinalSaveMsg("");
};


  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      <h1>NDIS AI Progress Notes Assistant</h1>
      <p>
        Fill in the key details from your shift and we&apos;ll generate a
        professional, NDIS-style progress note. Review it before saving to your
        service records.
      </p>

      {/* ====== GENERATOR FORM ====== */}
      <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
        {/* Row 1: Participant + date */}
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label>Participant name*</label>
            <input
              type="text"
              required
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              style={{ width: "100%", padding: "0.4rem" }}
              placeholder="e.g. Ali Ahmed"
            />
          </div>
          <div>
            <label>Date of support*</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ padding: "0.4rem" }}
            />
          </div>
        </div>

        {/* Row 2: Times */}
        <div style={{ display: "flex", gap: "1rem" }}>
          <div>
            <label>Start time*</label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{ padding: "0.4rem" }}
            />
          </div>
          <div>
            <label>End time*</label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={{ padding: "0.4rem" }}
            />
          </div>
        </div>

        {/* Row 3: Location + worker */}
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label>Location*</label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{ width: "100%", padding: "0.4rem" }}
              placeholder="e.g. Home and local shops"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Support worker name*</label>
            <input
              type="text"
              required
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              style={{ width: "100%", padding: "0.4rem" }}
              placeholder="e.g. Fatima Khan"
            />
          </div>
        </div>

        {/* Activities */}
        <div>
          <label>Activities and supports provided* (what you did)</label>
          <textarea
            required
            rows={4}
            value={activitiesAndSupports}
            onChange={(e) => setActivitiesAndSupports(e.target.value)}
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit", minHeight: "80px" }}
            placeholder={
              "Briefly describe what you did, where, and how.\n\n" +
              "Example:\n" +
              "At home, the support worker prompted [Name] to shower, dress and prepare breakfast, " +
              "providing verbal prompts and supervision. Later, they supported [Name] to walk to " +
              "the local park, practise safe road crossing and choose a bench for a short rest."
            }
          />
          <div
            style={{
              textAlign: "right",
              fontSize: "0.75rem",
              color: "#666",
              marginTop: "0.15rem",
            }}
          >
            {activitiesAndSupports.length} characters
          </div>
        </div>

        {/* Presentation */}
        <div>
          <label>
            Participant presentation* (mood, behaviour, health, communication)
          </label>
          <textarea
            required
            rows={3}
            value={participantPresentation}
            onChange={(e) => setParticipantPresentation(e.target.value)}
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit", minHeight: "80px" }}
            placeholder={
              "How did the participant present compared to usual? Focus on observable behaviour, " +
              "communication and engagement.\n\n" +
              "Example:\n" +
              "[Name] appeared more tired than usual after school, speaking in shorter sentences " +
              "and needing extra time to respond. After a snack and drawing break, [Name] became " +
              "more talkative and followed prompts with some repetition required."
            }
          />
          <div
            style={{
              textAlign: "right",
              fontSize: "0.75rem",
              color: "#666",
              marginTop: "0.15rem",
            }}
          >
            {participantPresentation.length} characters
          </div>
        </div>

        {/* Goals */}
        <div>
          <label>Goals worked on* (link to NDIS goals)</label>
          <textarea
            required
            rows={2}
            value={goalsWorkedOn}
            onChange={(e) => setGoalsWorkedOn(e.target.value)}
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit", minHeight: "80px" }}
            placeholder={
              "Link your activities to NDIS goals (community access, daily living, social skills, " +
              "communication, etc.).\n\n" +
              "Example:\n" +
              "This shift supported [Name]'s goals around increasing independence with personal " +
              "care and safe participation in community activities by practising showering, dressing " +
              "and road safety with graded prompts."
            }
          />
          <div
            style={{
              textAlign: "right",
              fontSize: "0.75rem",
              color: "#666",
              marginTop: "0.15rem",
            }}
          >
            {goalsWorkedOn.length} characters
          </div>
        </div>

        {/* Incident toggle + text */}
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "6px",
            padding: "0.6rem",
          }}
        >
          <label
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <input
              type="checkbox"
              checked={incidentOccurred}
              onChange={(e) => setIncidentOccurred(e.target.checked)}
            />
            <span>Incident, risk, change or concern occurred this shift</span>
          </label>
          <p
            style={{
              margin: "0.4rem 0 0.3rem",
              fontSize: "0.8rem",
              color: "#555",
            }}
          >
            If you tick this, you&apos;ll still write the incident summary
            below, and your organisation&apos;s usual incident report process
            still applies.
          </p>

          <textarea
            required
            rows={2}
            value={incidentsOrRisks}
            onChange={(e) => setIncidentsOrRisks(e.target.value)}
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit", minHeight: "80px" }}
            placeholder={
              incidentOccurred
                ? "Describe what happened, the immediate impact, and your response.\n\nExample:\n" +
                  "While walking through the park, an off-leash dog ran towards [Name]. " +
                  "[Name] raised their voice and moved quickly towards the edge of the path. " +
                  "The support worker stepped between [Name] and the road, prompted them to step " +
                  "back to the bench and used calm reassurance. No physical contact occurred."
                : 'If none, write "No incidents or concerns."'
            }
          />
          <div
            style={{
              textAlign: "right",
              fontSize: "0.75rem",
              color: "#666",
              marginTop: "0.15rem",
            }}
          >
            {incidentsOrRisks.length} characters
          </div>
        </div>

        {/* Follow up */}
        <div>
          <label>Follow-up actions / next steps* </label>
          <textarea
            required
            rows={2}
            value={followUpActions}
            onChange={(e) => setFollowUpActions(e.target.value)}
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit", minHeight: "80px" }}
            placeholder={
              "What should staff monitor or continue next time? Include when to escalate.\n\n" +
              "Example:\n" +
              "For the next 2–3 shifts, monitor [Name]'s response to dogs in the park and note any " +
              "further incidents. If [Name] continues to show strong reactions, inform the coordinator " +
              "so behaviour support strategies can be reviewed with the family."
            }
          />
          <div
            style={{
              textAlign: "right",
              fontSize: "0.75rem",
              color: "#666",
              marginTop: "0.15rem",
            }}
          >
            {followUpActions.length} characters
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.2rem" }}>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            padding: "0.7rem 1.4rem",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Generating note..." : "Generate note"}
        </button>
        <button
          type="button"
          onClick={handleClearForm}
          disabled={loading}
          style={{
            padding: "0.7rem 1.4rem",
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            cursor: loading ? "not-allowed" : "pointer",
            color: "#000000ff",
          }}
        >
          New shift / Clear form
        </button>
      </div>

      {errorMsg && (
        <p
          style={{
            color: "red",
            marginTop: "0.8rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {errorMsg}
        </p>
      )}

      {generatedNote && (
    <div
      style={{
        marginTop: "2rem",
        padding: "1rem",
        border: "1px solid #ccc",
        borderRadius: "8px",
        background: "#f9f9f9",
        color: "#000000ff",
      }}
    >
      <h2>Generated Progress Note</h2>

      {/* AI draft (read-only) */}
      <h3 style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
        AI draft (read-only)
      </h3>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          marginTop: "0.3rem",
          fontFamily: "inherit",
          background: "#f3f4f6",
          padding: "0.6rem",
          borderRadius: "4px",
        }}
      >
        {generatedNote}
      </pre>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginTop: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={handleCopyNote}
          style={{
            padding: "0.5rem 1.1rem",
            cursor: "pointer",
          }}
        >
          Copy AI draft to clipboard
        </button>
        {copied && (
          <span style={{ fontSize: "0.85rem", color: "green" }}>Copied!</span>
        )}
      </div>

      {/* Editable final note */}
      <h3 style={{ marginTop: "1.2rem", marginBottom: "0.25rem" }}>
        Final note (edit before saving)
      </h3>
        <textarea
          rows={14}               // more lines by default
          value={finalNoteText}
          onChange={(e) => setFinalNoteText(e.target.value)}
          style={{
            width: "100%",
            padding: "0.6rem",
            fontFamily: "inherit",
            borderRadius: "4px",
            border: "1px solid #d1d5db",
            resize: "vertical",
            minHeight: "260px",   // ensures a decent starting height
          }}
        />
      <div
  style={{
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.75rem",
    alignItems: "center",
    flexWrap: "wrap",
  }}
>
  <button
    type="button"
    onClick={handleSaveFinalNote}
    style={{
      padding: "0.5rem 1.1rem",
      cursor: "pointer",
    }}
  >
    Save final note
  </button>

  <button
    type="button"
    onClick={handleCopyFinalNote}
    style={{
      padding: "0.5rem 1.1rem",
      cursor: "pointer",
    }}
  >
    Copy final note to clipboard
  </button>

  {finalSaveMsg && (
    <span style={{ fontSize: "0.85rem", color: "#047857" }}>
      {finalSaveMsg}
    </span>
  )}
  {copied && (
    <span style={{ fontSize: "0.85rem", color: "green" }}>
      Copied!
    </span>
  )}
</div>


      {noteHasIncident && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            borderLeft: "4px solid #d97706",
            background: "#fff7ed",
            fontSize: "0.9rem",
            color: "#000000ff",
          }}
        >
          <strong>Incident reminder:</strong> This note includes an incident.
          Make sure you also follow your organisation&apos;s incident
          management and reporting procedures (including any NDIS
          reportable incident requirements that apply).
        </div>
      )}

    <p
      style={{
        marginTop: "1rem",
        fontSize: "0.75rem",
        color: "#6b7280",
      }}
    >
      This AI tool supports progress note drafting. Final responsibility
      for accuracy, NDIS compliance and incident reporting remains with
      the provider.
    </p>
  </div>
)}


      {/* ====== SAVED NOTES / DASHBOARD ====== */}
      <hr style={{ margin: "2rem 0" }} />

      <section>
        <h2>Saved notes dashboard</h2>
        <p style={{ fontSize: "0.9rem", color: "#4b5563" }}>
          These notes are stored locally in your prototype database
          (SQLite). For production use with real NDIS data, you&apos;ll need
          secure, Australian-hosted infrastructure, authentication and
          formal policies in place.
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
                        color: "#ffffffff",
                      }}
                    >
                      Date
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #e5e7eb",
                        color: "#ffffffff",
                      }}
                    >
                      Participant
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #e5e7eb",
                        color: "#ffffffff",
                      }}
                    >
                      Worker
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #e5e7eb",
                        color: "#ffffffff",
                      }}
                    >
                      Location
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #e5e7eb",
                        color: "#ffffffff",
                      }}
                    >
                      Incident?
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.4rem 0.6rem",
                        borderBottom: "1px solid #e5e7eb",
                        color: "#ffffffff",
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
                          color: n.reviewedFlag
                            ? "#065f46" // darker green if reviewed
                            : n.finalisedAt
                            ? "#047857" // green if finalised
                            : "#6b7280", // grey if draft
                          fontWeight: 600,
                        }}
                      >
                        {n.reviewedFlag
                          ? "Finalised + Reviewed"
                          : n.finalisedAt
                          ? "Finalised"
                          : "Draft"}
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
                  {selectedNote.reviewedFlag
                    ? "Finalised + Reviewed"
                    : selectedNote.finalisedAt
                    ? "Finalised"
                    : "Draft"}
                  {selectedNote.finalisedAt && (
                    <>
                      {" "}
                      (finalised at {selectedNote.finalisedAt})
                    </>
                  )}
                </p>

                {/* Provider review toggle */}
                <div
                  style={{
                    marginTop: "0.4rem",
                    marginBottom: "0.6rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      checked={!!selectedNote.reviewedFlag}
                      onChange={handleToggleReviewed}
                    />
                    <span style={{ fontSize: "0.85rem", color: "#000000ff" }}>
                      Mark note as reviewed by provider
                    </span>
                  </label>
                </div>
                {reviewToggleMsg && (
                  <p style={{ fontSize: "0.8rem", color: "#047857" }}>
                    {reviewToggleMsg}
                  </p>
                )}

                {/* Editable final note text */}
                <h4 style={{ marginTop: "0.8rem", marginBottom: "0.2rem", color: "#000000ff" }}>
                  Final note for this shift (editable)
                </h4>
                <textarea
                  rows={14}
                  value={dashboardEditText}
                  onChange={(e) => setDashboardEditText(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    fontFamily: "inherit",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    resize: "vertical",
                    minHeight: "300px",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    marginTop: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleDashboardSaveFinal}
                    style={{
                      padding: "0.5rem 1.1rem",
                      cursor: "pointer",
                    }}
                  >
                    Save final note for this shift
                  </button>
                  {dashboardSaveMsg && (
                    <span style={{ fontSize: "0.85rem", color: "#047857" }}>
                      {dashboardSaveMsg}
                    </span>
                  )}
                </div>

                {/* Show AI draft underneath for reference */}
                <h4 style={{ marginTop: "1rem", marginBottom: "0.2rem", color: "#000000ff" }}>
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
    </div>
  );
}

export default App;
