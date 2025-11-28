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

      setGeneratedNote(data.note);

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
    } finally {
      setLoading(false);
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

    setGeneratedNote("");
    setErrorMsg("");
    setCopied(false);
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
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit" }}
            placeholder="Describe what you supported the participant with, where, and how. Include any prompts used and level of assistance."
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
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit" }}
            placeholder="How did the participant engage? Any changes from usual? Be factual and specific."
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
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit" }}
            placeholder="Which NDIS goals did this shift support, and how?"
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
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit" }}
            placeholder={
              incidentOccurred
                ? "Briefly describe what happened, impact on the participant, and any immediate response."
                : 'If none, write "No incidents or concerns".'
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
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit" }}
            placeholder='E.g. "Monitor mood over next 2 shifts and report any changes to coordinator."'
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
          <pre
            style={{
              whiteSpace: "pre-wrap",
              marginTop: "0.5rem",
              fontFamily: "inherit",
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
              Copy note to clipboard
            </button>
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
              <strong>Incident reminder:</strong> This note includes an
              incident. Make sure you also follow your organisation&apos;s
              incident management and reporting procedures (including any NDIS
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
                  </tr>
                </thead>
                <tbody>
                  {notes.length === 0 && !notesLoading && (
                    <tr>
                      <td
                        colSpan={5}
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
            <h3 style={{ marginTop: 0 }}>Note details</h3>
            {!selectedNote && (
              <p style={{ fontSize: "0.9rem", color: "#6b7280" }}>
                Click a row in the table to view the full note body here.
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
                </p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                    marginTop: "0.6rem",
                    color: "#111827",
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
