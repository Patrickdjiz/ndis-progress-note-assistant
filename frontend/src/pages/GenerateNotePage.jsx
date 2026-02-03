// src/pages/GenerateNotePage.jsx
// src/pages/GenerateNotePage.jsx
import { apiFetch } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";
import { useMemo, useState, useEffect } from "react";

function normRole(v) {
  return String(v || "").trim().toUpperCase();
}

// UI-only decode (no verification) to align UI with backend session role
function roleFromToken(token) {
  if (!token) return "";
  try {
    const payload = token.split(".")[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    const obj = JSON.parse(json);
    return normRole(obj.role);
  } catch {
    return "";
  }
}

function GenerateNotePage({ token, user }) {

  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

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


  const [incidentOccurred, setIncidentOccurred] = useState(false);
  const [noteHasIncident, setNoteHasIncident] = useState(false);

  const [generatedNote, setGeneratedNote] = useState("");
  const [finalNoteText, setFinalNoteText] = useState("");
  const [latestNoteId, setLatestNoteId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [finalSaveMsg, setFinalSaveMsg] = useState("");
  const [consentAck, setConsentAck] = useState(false);

  // ✅ UI-only: responsive helper (no business logic changes)
  const isMobile = useIsMobile(760);


 const effectiveRole = useMemo(() => normRole(user?.role) || roleFromToken(token), [user, token]);

const canSelectWorker = effectiveRole === "ADMIN"; 

const [workers, setWorkers] = useState([]);
const [selectedWorkerId, setSelectedWorkerId] = useState("");
const [workersLoading, setWorkersLoading] = useState(false);
const [workersError, setWorkersError] = useState("");

useEffect(() => {
  let cancelled = false;

  (async () => {
    if (!token || !canSelectWorker) return;

    setWorkersError("");
    setWorkersLoading(true);

    try {
      const data = await apiFetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (cancelled) return;

      const list = Array.isArray(data.users) ? data.users : [];
      const onlyWorkers = list
  .filter((u) => {
    const roleOk = String(u?.role || "").toUpperCase() === "WORKER";
    const active = u?.isActive ?? u?.is_active; // accept either
    const activeOk = active === undefined ? true : active === true; // if missing, treat as active
    return roleOk && activeOk;
  })
  .map((u) => ({
  id: u.id,
  fullName: u.fullName || u.full_name || "",
  email: u.email || "",
}));



      setWorkers(onlyWorkers);
      setSelectedWorkerId((prev) => prev || (onlyWorkers[0]?.id ? String(onlyWorkers[0].id) : ""));
    } catch (e) {
      if (cancelled) return;
      setWorkersError(e?.message || "Failed to load workers list.");
    } finally {
      if (!cancelled) setWorkersLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [token, canSelectWorker]);


  // --- shared styles to keep things consistent with login ---
  const cardStyle = {
    background: "#ffffff",
    borderRadius: "0.75rem",
    border: "1px solid #e5e7eb",
    padding: isMobile ? "1.05rem" : "1.5rem",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.04)",
    boxSizing: "border-box",
    minWidth: 0,
  };

  const sectionTitleStyle = {
    fontSize: "1.15rem",
    fontWeight: 600,
    margin: 0,
    marginBottom: "0.35rem",
    color: "#111827",
  };

  const sectionSubTextStyle = {
    fontSize: "0.9rem",
    color: "#4b5563",
    margin: 0,
    marginBottom: "1.1rem",
    lineHeight: 1.45,
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 500,
    marginBottom: "0.3rem",
    color: "#374151",
  };

  const inputBaseStyle = {
    width: "100%",
    padding: "0.55rem 0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid #d1d5db",
    fontSize: "0.9rem",
    fontFamily: "inherit",
    background: "#f9fafb",
    boxSizing: "border-box",
    // ✅ Mobile: better tap targets (no desktop change)
    minHeight: isMobile ? 44 : undefined,
  };

  const textareaStyle = {
    ...inputBaseStyle,
    minHeight: "140px", // fixes the “cut off” placeholder look
    resize: "vertical",
    lineHeight: 1.5,
  };

  const counterStyle = {
    textAlign: "right",
    fontSize: "0.75rem",
    color: "#6b7280",
    marginTop: "0.2rem",
  };

  const primaryButtonStyle = {
    padding: "0.7rem 1.4rem",
    borderRadius: "999px",
    border: "none",
    background: "#111827",
    color: "#f9fafb",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: loading ? "wait" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    // ✅ Mobile: larger, easier taps; keep same pill look
    minHeight: isMobile ? 44 : undefined,
    ...(isMobile ? { width: "100%" } : {}),
  };

  const secondaryButtonStyle = {
    ...primaryButtonStyle,
    background: "#f3f4f6",
    color: "#111827",
    border: "1px solid #d1d5db",
    cursor: loading ? "not-allowed" : "pointer",
  };

  const selectedWorker = useMemo(() => {
    if (!canSelectWorker) return null;
    return workers.find((w) => String(w.id) === String(selectedWorkerId)) || null;
  }, [canSelectWorker, workers, selectedWorkerId]);

  // ✅ change your workerName display logic:
  const displayWorkerName = canSelectWorker
  ? (selectedWorker?.fullName || "")
  : (user?.fullName || "");


  function stripNoteHeader(txt) {
  const s = String(txt || "");
  const lines = s.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;

  const headerRe = /^(Support Worker|Date of Support|Shift Time|Location|Participant):/i;
  let sawHeader = false;

  while (i < lines.length && headerRe.test(lines[i])) {
    sawHeader = true;
    i++;
  }
  if (sawHeader) while (i < lines.length && lines[i].trim() === "") i++;

  return lines.slice(i).join("\n").trim();
}

  // --- handlers (unchanged except for formatting) ---
  const handleGenerate = async () => {
  // Admin must pick worker BEFORE we set loading
  if (canSelectWorker && !selectedWorkerId) {
    setErrorMsg("Admins must select a worker before generating.");
    return;
  }

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
  };

  const missing = Object.entries(fields)
    .filter(([, v]) => !v || !v.toString().trim())
    .map(([k]) => k);

  if (missing.length > 0) {
    setErrorMsg("Please complete all fields before generating a note.");
    return;
  }

  if (startTime && endTime && endTime <= startTime) {
    setErrorMsg("End time must be after start time.");
    return;
  }

  if (!consentAck) {
    setErrorMsg("Please confirm you are authorised and participant consent has been obtained before generating.");
    return;
  }

  // ✅ If admin, require worker selection BEFORE setting loading
  if (canSelectWorker && !selectedWorkerId) {
    setErrorMsg("Admins must select a worker before generating.");
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
    const data = await apiFetch("/api/generate-note", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        incidentOccurred,
        consentAcknowledged: consentAck,
        ...(canSelectWorker ? { workerUserId: Number(selectedWorkerId) } : {}),
      }),
    });

    setGeneratedNote(data.note || "");
    setFinalNoteText(stripNoteHeader(data.note || ""));
    setLatestNoteId(data.id || null);

    const incText = (incidentsOrRisks || "").trim();
    const looksLikeNoIncident =
      /^no incidents?|^no incident|^no concerns?/i.test(incText);

    setNoteHasIncident(
      incidentOccurred === true && incText.length > 0 && !looksLikeNoIncident
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
        setErrorMsg("No generated note to save. Please generate a note first.");
        return;
      }

      if (!finalNoteText || !finalNoteText.toString().trim()) {
        setErrorMsg("Final note text cannot be empty.");
        return;
      }

      await apiFetch(`/api/notes/${latestNoteId}/finalise`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          finalNoteText,
        }),
      });

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

    setIncidentOccurred(false);
    setNoteHasIncident(false);

    setGeneratedNote("");
    setFinalNoteText("");
    setLatestNoteId(null);
    setErrorMsg("");
    setCopied(false);
    setFinalSaveMsg("");
    setConsentAck(false);

    if (canSelectWorker) {
      setSelectedWorkerId((prev) => prev || (workers[0]?.id ? String(workers[0].id) : ""));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {/* ====== GENERATOR FORM CARD ====== */}
      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Generate a progress note</h2>
        <p style={sectionSubTextStyle}>
          Fill in the key details from your shift and we&apos;ll generate a
          professional, NDIS-style progress note. Review and edit it before
          saving to your service records.
        </p>

        {/* Form fields */}
        <div style={{ display: "grid", gap: "1rem" }}>
          {/* Participant + date */}
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: isMobile
                ? "minmax(0, 1fr)"
                : "minmax(0, 2fr) minmax(0, 1fr)",
            }}
          >
            <div>
              <label style={labelStyle}>Participant name*</label>
              <input
                type="text"
                required
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                style={inputBaseStyle}
                placeholder="e.g. Ali Ahmed"
              />
            </div>
            <div>
              <label style={labelStyle}>Date of support*</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  ...inputBaseStyle,
                  maxWidth: isMobile ? "100%" : "210px",
                }}
              />
            </div>
          </div>

          {/* Times */}
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: isMobile
                ? "minmax(0, 1fr)"
                : "repeat(auto-fit, minmax(160px, min-content))",
            }}
          >
            <div>
              <label style={labelStyle}>Start time*</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={inputBaseStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End time*</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={inputBaseStyle}
              />
            </div>
          </div>

          {/* Location + worker */}
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div>
              <label style={labelStyle}>Location*</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={inputBaseStyle}
                placeholder="e.g. Home and local shops"
              />
            </div>
            <div>
              <label style={labelStyle}>Support worker name*</label>

              {canSelectWorker ? (
  <>
    <select
      value={selectedWorkerId}
      onChange={(e) => setSelectedWorkerId(e.target.value)}
      style={inputBaseStyle}
      disabled={workersLoading}
    >
      <option value="">
        {workersLoading ? "Loading workers..." : "Select a worker…"}
      </option>
      {workers.map((w) => (
        <option key={w.id} value={String(w.id)}>
          {w.fullName} ({w.email})
        </option>
      ))}
    </select>

    {workersError && (
      <div style={{ marginTop: 8, color: "red", fontSize: "0.85rem" }}>
        {workersError}
      </div>
    )}

    {!workersLoading && workers.length === 0 && (
      <div style={{ marginTop: 8, color: "#6b7280", fontSize: "0.85rem" }}>
        No active WORKER users found. Create/activate a worker account first.
      </div>
    )}
  </>
) : (
  <input
    type="text"
    required
    value={displayWorkerName}
    readOnly
    style={inputBaseStyle}
  />
)}
            </div>
          </div>

          {/* Activities */}
          <div>
            <label style={labelStyle}>
              Activities and supports provided* (what you did)
            </label>
            <textarea
              required
              value={activitiesAndSupports}
              onChange={(e) => setActivitiesAndSupports(e.target.value)}
              style={textareaStyle}
              placeholder={
                "Briefly describe what you did, where, and how.\n\n" +
                "Example:\n" +
                "At home, the support worker prompted [Name] to shower, dress and prepare breakfast, " +
                "providing verbal prompts and supervision. Later, they supported [Name] to walk to " +
                "the local park, practise safe road crossing and choose a bench for a short rest."
              }
            />
            <div style={counterStyle}>{activitiesAndSupports.length} characters</div>
          </div>

          {/* Presentation */}
          <div>
            <label style={labelStyle}>
              Participant presentation* (mood, behaviour, health, communication)
            </label>
            <textarea
              required
              value={participantPresentation}
              onChange={(e) => setParticipantPresentation(e.target.value)}
              style={textareaStyle}
              placeholder={
                "How did the participant present compared to usual? Focus on observable behaviour, " +
                "communication and engagement.\n\n" +
                "Example:\n" +
                "[Name] appeared more tired than usual after school, speaking in shorter sentences " +
                "and needing extra time to respond. After a snack and drawing break, [Name] became " +
                "more talkative and followed prompts with some repetition required."
              }
            />
            <div style={counterStyle}>{participantPresentation.length} characters</div>
          </div>

          {/* Goals */}
          <div>
            <label style={labelStyle}>Goals worked on* (link to NDIS goals)</label>
            <textarea
              required
              value={goalsWorkedOn}
              onChange={(e) => setGoalsWorkedOn(e.target.value)}
              style={textareaStyle}
              placeholder={
                "Link your activities to NDIS goals (community access, daily living, social skills, " +
                "communication, etc.).\n\n" +
                "Example:\n" +
                "This shift supported [Name]'s goals around increasing independence with personal " +
                "care and safe participation in community activities by practising showering, dressing " +
                "and road safety with graded prompts."
              }
            />
            <div style={counterStyle}>{goalsWorkedOn.length} characters</div>
          </div>

          {/* Incident section */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "0.75rem",
              padding: "0.75rem 0.9rem",
              background: "#f9fafb",
              boxSizing: "border-box",
            }}
          >
            <label
              style={{
                ...labelStyle,
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                marginBottom: "0.35rem",
                // ✅ Mobile: easier to tap label row
                padding: isMobile ? "0.25rem 0" : 0,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={incidentOccurred}
                onChange={(e) => setIncidentOccurred(e.target.checked)}
                style={isMobile ? { transform: "scale(1.05)" } : undefined}
              />
              <span style={{ fontWeight: 500 }}>
                Incident, risk, change or concern occurred this shift
              </span>
            </label>
            <p
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.8rem",
                color: "#555",
                lineHeight: 1.4,
              }}
            >
              If you tick this, you&apos;ll still write the incident summary
              below, and your organisation&apos;s usual incident report process
              still applies.
            </p>

            <textarea
              required
              value={incidentsOrRisks}
              onChange={(e) => setIncidentsOrRisks(e.target.value)}
              style={textareaStyle}
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
            <div style={counterStyle}>{incidentsOrRisks.length} characters</div>
          </div>

          {/* Follow up */}
          <div>
            <label style={labelStyle}>Follow-up actions / next steps*</label>
            <textarea
              required
              value={followUpActions}
              onChange={(e) => setFollowUpActions(e.target.value)}
              style={textareaStyle}
              placeholder={
                "What should staff monitor or continue next time? Include when to escalate.\n\n" +
                "Example:\n" +
                "For the next 2–3 shifts, monitor [Name]'s response to dogs in the park and note any " +
                "further incidents. If [Name] continues to show strong reactions, inform the coordinator " +
                "so behaviour support strategies can be reviewed with the family."
              }
            />
            <div style={counterStyle}>{followUpActions.length} characters</div>
          </div>
        </div>

        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 0.9rem",
            border: "1px solid #e5e7eb",
            borderRadius: "0.75rem",
            background: "#f9fafb",
            lineHeight: 1.45,
            fontSize: "0.9rem",
            color: "#374151",
          }}
        >
          <div style={{ fontWeight: 600, color: "#111827", marginBottom: "0.25rem" }}>
            Privacy & consent confirmation
          </div>
          <div style={{ fontSize: "0.85rem", color: "#4b5563" }}>
            This tool drafts notes that may include sensitive health information. Only enter information you are authorised to record,
            and ensure your organisation has obtained participant consent for collection and use.
          </div>

          <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.6rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={consentAck}
              onChange={(e) => setConsentAck(e.target.checked)}
              style={isMobile ? { transform: "scale(1.05)", marginTop: 3 } : { marginTop: 3 }}
            />
            <span>
              I confirm I am authorised to enter this information and participant consent has been obtained in line with our organisation’s policies.
            </span>
          </label>
        </div>


        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginTop: "1.2rem",
            flexWrap: "wrap",
          }}
        >
          <button onClick={handleGenerate} disabled={loading} style={primaryButtonStyle}>
            {loading ? "Wait a few minutes..." : "Generate note"}
          </button>
          <button
            type="button"
            onClick={handleClearForm}
            disabled={loading}
            style={secondaryButtonStyle}
          >
            New shift / Clear form
          </button>
        </div>

        {errorMsg && (
          <p
            style={{
              color: "red",
              marginTop: "0.9rem",
              fontSize: "0.9rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {errorMsg}
          </p>
        )}
      </section>

      {/* ====== GENERATED NOTE CARD ====== */}
      {generatedNote && (
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Generated progress note</h2>
          <p style={sectionSubTextStyle}>
            Review the AI draft, make any edits you need, then save the final
            version to your records.
          </p>

          {/* AI draft */}
          <div style={{ marginTop: "0.5rem" }}>
            <div
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "#4b5563",
                marginBottom: "0.35rem",
              }}
            >
              AI draft (read-only)
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                marginTop: "0.3rem",
                fontFamily: "inherit",
                background: "#f3f4f6",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #e5e7eb",
                boxSizing: "border-box",
                // ✅ Mobile: keep code blocks from causing horizontal overflow
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                wordBreak: "break-word",
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
              <button type="button" onClick={handleCopyNote} style={secondaryButtonStyle}>
                Copy AI draft to clipboard
              </button>
              {copied && (
                <span style={{ fontSize: "0.85rem", color: "#047857" }}>
                  Copied!
                </span>
              )}
            </div>
          </div>

          {/* Final note */}
          <div style={{ marginTop: "1.4rem" }}>
            <div
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "#4b5563",
                marginBottom: "0.35rem",
              }}
            >
              Final note (edit before saving)
            </div>
            <textarea
              rows={8}
              value={finalNoteText}
              onChange={(e) => setFinalNoteText(e.target.value)}
              style={{
                ...textareaStyle,
                minHeight: "180px",
                background: "#ffffff",
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
              <button type="button" onClick={handleSaveFinalNote} style={primaryButtonStyle}>
                Save final note
              </button>
              {finalSaveMsg && (
                <span style={{ fontSize: "0.85rem", color: "#047857" }}>
                  {finalSaveMsg}
                </span>
              )}
            </div>
          </div>

          {noteHasIncident && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem 0.9rem",
                borderLeft: "4px solid #d97706",
                background: "#fffbeb",
                fontSize: "0.9rem",
                color: "#78350f",
                borderRadius: "0.5rem",
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}
            >
              <strong>Incident reminder:</strong> This note includes an incident.
              Make sure you also follow your organisation&apos;s incident
              management and reporting procedures (including any NDIS reportable
              incident requirements that apply).
            </div>
          )}

          <p
            style={{
              marginTop: "1rem",
              fontSize: "0.75rem",
              color: "#6b7280",
              lineHeight: 1.45,
            }}
          >
            This AI tool supports progress note drafting. Final responsibility
            for accuracy, NDIS compliance and incident reporting remains with
            the provider.
          </p>
        </section>
      )}
    </div>
  );
}

export default GenerateNotePage;
