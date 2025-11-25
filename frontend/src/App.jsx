import { useState } from "react";

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

  const [generatedNote, setGeneratedNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate note");
      }

      setGeneratedNote(data.note);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "sans-serif",
      }}
    >
      <h1>NDIS AI Progress Notes Assistant</h1>
      <p>
        Fill in the key details from your shift and we&apos;ll generate a professional,
        NDIS-style progress note.
      </p>

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
        </div>

        {/* Incidents / Risks */}
        <div>
          <label>Incidents, risks, changes or concerns* </label>
          <textarea
            required
            rows={2}
            value={incidentsOrRisks}
            onChange={(e) => setIncidentsOrRisks(e.target.value)}
            style={{ width: "100%", padding: "0.4rem", fontFamily: "inherit" }}
            placeholder='If none, write "No incidents or concerns". Otherwise, describe what happened factually.'
          />
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
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          marginTop: "1.2rem",
          padding: "0.7rem 1.4rem",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "Generating note..." : "Generate note"}
      </button>

      {errorMsg && (
        <p style={{ color: "red", marginTop: "0.8rem", whiteSpace: "pre-wrap" }}>
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
            whiteSpace: "pre-wrap",
            background: "#f9f9f9",
          }}
        >
          <h2>Generated Progress Note</h2>
          <p>{generatedNote}</p>
        </div>
      )}
    </div>
  );
}

export default App;
