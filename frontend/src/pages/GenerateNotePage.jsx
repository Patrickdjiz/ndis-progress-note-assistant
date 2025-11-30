// src/pages/GenerateNotePage.jsx
import { useState } from "react";

function GenerateNotePage() {
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

  // Incident UI
  const [incidentOccurred, setIncidentOccurred] = useState(false);
  const [noteHasIncident, setNoteHasIncident] = useState(false);

  // AI + final note
  const [generatedNote, setGeneratedNote] = useState("");
  const [finalNoteText, setFinalNoteText] = useState("");
  const [latestNoteId, setLatestNoteId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [finalSaveMsg, setFinalSaveMsg] = useState("");

  const handleGenerate = async () => {
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
      .filter(([, v]) => !v || !v.toString().trim())
      .map(([k]) => k);

    if (missing.length > 0) {
      setErrorMsg("Please complete all fields before generating a note.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setGeneratedNote("");
    setFinalNoteText("");
    setFinalSaveMsg("");
    setCopied(false);
    setNoteHasIncident(false);
    setLatestNoteId(null);

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

      // AI draft text + note id from backend
      setGeneratedNote(data.note || "");
      setFinalNoteText(data.note || "");
      setLatestNoteId(data.id || null);

      // incident banner
      const incText = (incidentsOrRisks || "").trim();
      const looksLikeNoIncident =
        /^no incidents?|^no incident|^no concerns?/i.test(incText);

      setNoteHasIncident(
        incidentOccurred === true &&
          incText.length > 0 &&
          !looksLikeNoIncident
      );
    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Something went wrong");
      setLatestNoteId(null);
      setFinalNoteText("");
      setGeneratedNote("");
      setNoteHasIncident(false);
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
            finalisedBy: workerName, // simple stand-in for logged-in user
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save final note");
      }

      setFinalSaveMsg("Final note saved.");
    } catch (err) {
      console.error("Error saving final note:", err);
      setErrorMsg(err?.message || "Failed to save final note");
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
    setFinalNoteText("");
    setLatestNoteId(null);
    setErrorMsg("");
    setCopied(false);
    setFinalSaveMsg("");
  };

  return (
    <>
      <p>
        Fill in the key details from your shift and we&apos;ll generate a
        professional, NDIS-style progress note. Review and edit it before
        saving to your service records.
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
              <span style={{ fontSize: "0.85rem", color: "green" }}>
                Copied!
              </span>
            )}
          </div>

          {/* Editable final note */}
          <h3 style={{ marginTop: "1.2rem", marginBottom: "0.25rem" }}>
            Final note (edit before saving)
          </h3>
          <textarea
            rows={8}
            value={finalNoteText}
            onChange={(e) => setFinalNoteText(e.target.value)}
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
            {finalSaveMsg && (
              <span style={{ fontSize: "0.85rem", color: "#047857" }}>
                {finalSaveMsg}
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
    </>
  );
}

export default GenerateNotePage;
