// routes/notesRoutes.js
const express = require("express");
const axios = require("axios");

const db = require("../db");
const applyComplianceFilter = require("../compliance");
const { timeToMinutes, parseYyyyMmDd, looksLikeJunk } = require("../utils");
const { requireAuth } = require("../authMiddleware");

const router = express.Router();

// All routes in this file require auth
router.use(requireAuth);

// GET /api/notes  (list recent notes with filters, org-scoped)
router.get("/notes", (req, res) => {
  try {
    const { participant, hasIncident } = req.query;

    // Block OWNER at API level just in case
    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    let baseQuery = `
      SELECT
        id,
        participantName,
        workerName,
        date,
        startTime,
        endTime,
        location,
        incidentFlag,
        createdAt,
        finalisedAt,
        reviewedFlag
      FROM progress_notes
      WHERE organisationId = ?
    `;

    const params = [req.user.organisationId];

    // Worker: only their own notes
    if (req.user.role === "WORKER") {
      baseQuery += " AND workerUserId = ?";
      params.push(req.user.id);
    }

    if (participant && participant.trim()) {
      baseQuery += " AND participantName LIKE ?";
      params.push(`%${participant.trim()}%`);
    }

    if (hasIncident === "true") {
      baseQuery += " AND incidentFlag = 1";
    } else if (hasIncident === "false") {
      baseQuery += " AND incidentFlag = 0";
    }

    baseQuery += " ORDER BY createdAt DESC LIMIT 50";

    const stmt = db.prepare(baseQuery);
    const rows = stmt.all(...params);

    return res.json({ notes: rows });
  } catch (err) {
    console.error("Error listing notes:", err.message);
    return res.status(500).json({ error: "Failed to list notes" });
  }
});


// GET /api/notes/:id  (single note, org-scoped)
router.get("/notes/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    let query = `
      SELECT *
      FROM progress_notes
      WHERE id = ?
        AND organisationId = ?
    `;
    const params = [id, req.user.organisationId];

    if (req.user.role === "WORKER") {
      query += " AND workerUserId = ?";
      params.push(req.user.id);
    }

    const stmt = db.prepare(query);
    const row = stmt.get(...params);

    if (!row) {
      return res.status(404).json({ error: "Note not found" });
    }

    return res.json({ note: row });
  } catch (err) {
    console.error("Error fetching note:", err.message);
    return res.status(500).json({ error: "Failed to fetch note" });
  }
});


// POST /api/notes/:id/finalise

router.post("/notes/:id/finalise", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    // Owners should not be involved in day-to-day note flows
    if (req.user.role === "OWNER") {
      return res
        .status(403)
        .json({ error: "Owners cannot finalise notes" });
    }

    const { finalNoteText } = req.body;

    if (!finalNoteText || !finalNoteText.toString().trim()) {
      return res
        .status(400)
        .json({ error: "Final note text is required" });
    }

    // Always trust server-side user name
    const finalisedByName = req.user.fullName || "";

    // Base query: same org + note id
    let query = `
      SELECT *
      FROM progress_notes
      WHERE id = ?
        AND organisationId = ?
    `;
    const params = [id, req.user.organisationId];

    // Workers can only finalise their own notes
    if (req.user.role === "WORKER") {
      query += " AND workerUserId = ?";
      params.push(req.user.id);
    }

    const stmtCheck = db.prepare(query);
    const existing = stmtCheck.get(...params);

    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    const nowIso = new Date().toISOString();

    const stmtUpdate = db.prepare(`
      UPDATE progress_notes
      SET finalNoteText = ?,
          finalisedAt = ?,
          finalisedBy = ?
      WHERE id = ?
    `);

    stmtUpdate.run(
      finalNoteText.toString().trim(),
      nowIso,
      finalisedByName,
      id
    );

    return res.json({
      ok: true,
      finalisedAt: nowIso,
      finalisedBy: finalisedByName,
      finalNoteText: finalNoteText.toString().trim(),
    });
  } catch (err) {
    console.error("Error finalising note:", err.message);
    return res.status(500).json({ error: "Failed to finalise note" });
  }
});


// POST /api/notes/:id/review
router.post("/notes/:id/review", (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    // Only admins can mark reviewed
    if (req.user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only admins can review notes" });
    }

    const { reviewedFlag } = req.body;
    const flag = reviewedFlag === false ? 0 : 1;

    // Server-controlled reviewer name
    const reviewerName = req.user.fullName || "";

    const stmtCheck = db.prepare(`
      SELECT id
      FROM progress_notes
      WHERE id = ?
        AND organisationId = ?
    `);
    const existing = stmtCheck.get(id, req.user.organisationId);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    const nowIso = new Date().toISOString();

    const stmtUpdate = db.prepare(`
      UPDATE progress_notes
      SET reviewedFlag = ?,
          reviewedAt = ?,
          reviewedBy = ?
      WHERE id = ?
    `);

    stmtUpdate.run(
      flag,
      flag ? nowIso : null,
      flag ? reviewerName : null,
      id
    );

    return res.json({
      ok: true,
      reviewedFlag: flag,
      reviewedAt: flag ? nowIso : null,
      reviewedBy: flag ? reviewerName : null,
    });
  } catch (err) {
    console.error("Error updating review status:", err.message);
    return res.status(500).json({ error: "Failed to update review status" });
  }
});


// POST /api/generate-note  (org-scoped)
router.post("/generate-note", async (req, res) => {
  try {

    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot generate notes" });
    }

    const {
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
      incidentOccurred
    } = req.body;

    // 1. Required fields
    const requiredFields = {
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
      workerName
    };

    const missing = Object.entries(requiredFields)
      .filter(([, value]) => !value || !value.toString().trim())
      .map(([key]) => key);

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`
      });
    }

    // 2. Date sanity
    const shiftDate = parseYyyyMmDd(date);
    if (!shiftDate) {
      return res.status(400).json({ error: "Invalid date format." });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    shiftDate.setHours(0, 0, 0, 0);

    if (shiftDate > today) {
      return res.status(400).json({
        error: "Date of support cannot be in the future."
      });
    }

    // 3. Time sanity
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    console.log("DEBUG times:", { startTime, endTime, startMins, endMins });

    if (startMins === null || endMins === null) {
      return res.status(400).json({
        error: "Invalid start or end time format."
      });
    }

    if (endMins <= startMins) {
      return res.status(400).json({
        error: "End time must be after start time for the shift."
      });
    }

    // 4. Junk detection
    const junkFields = [];
    if (looksLikeJunk(activitiesAndSupports))
      junkFields.push("activitiesAndSupports");
    if (looksLikeJunk(participantPresentation))
      junkFields.push("participantPresentation");
    if (looksLikeJunk(goalsWorkedOn)) junkFields.push("goalsWorkedOn");

    if (incidentOccurred === true && looksLikeJunk(incidentsOrRisks)) {
      junkFields.push("incidentsOrRisks");
    }

    if (junkFields.length > 0) {
      return res.status(400).json({
        error:
          "Some fields do not look like meaningful descriptions. Please rewrite: " +
          junkFields.join(", ")
      });
    }

    const safeLocation = location.trim();
    const shiftTime = `${startTime}–${endTime}`;

    const rawCombined =
      (activitiesAndSupports || "") +
      " " +
      (participantPresentation || "") +
      " " +
      (goalsWorkedOn || "") +
      " " +
      (incidentsOrRisks || "") +
      " " +
      (followUpActions || "");

    const prompt = `
You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

You will receive structured information about ONE support shift. Your task is to write the BODY of an NDIS-style progress note ONLY (no headers).

If the information is vague, gibberish, placeholder text (e.g., “asd”, “test”, “n/a”, or extremely short responses that do not describe what happened), then:
- Do NOT generate a normal note.
- Instead, return exactly:
  ERROR: Insufficient information. Please rewrite the following fields with real details.

Otherwise, generate a high-quality progress note BODY ONLY.

DATA PROVIDED:
Participant: ${participantName}
Date of Support: ${date}
Shift Time: ${shiftTime}
Location: ${safeLocation}

Raw input – Activities & Supports:
${activitiesAndSupports}

Raw input – Participant Presentation (mood/behaviour/health/communication):
${participantPresentation}

Raw input – Goals Worked On:
${goalsWorkedOn}

Raw input – Incidents, Risks, Changes:
${incidentsOrRisks}

Raw input – Follow-up / Next Steps:
${followUpActions}

Support worker: ${workerName}

-----------------------------------------------------------
STYLE, FORMAT & SAFETY RULES
-----------------------------------------------------------

1) Write STRICTLY in third-person.
   - Use “the support worker”, “the participant”, or their name.
   - NEVER use “I”, “we”, “my”, “our”.

1a) The first sentence of the first paragraph MUST literally begin with:
    "The support worker..."

2) Be FACTUAL and OBSERVABLE.
3) ONLY use mood/affect words that appear in the raw input.
4) NDIS goal linkage must be FUNCTIONAL.
5) Incident documentation must be clear and neutral.
6) ALWAYS include a follow-up / next-shift paragraph at the end.
7) Do NOT write any introductory phrases.
8) NEVER restate date, shift time, or full location references inside the body.

-----------------------------------------------------------
REQUIRED OUTPUT STRUCTURE
-----------------------------------------------------------

Write 2–4 paragraphs in this order:

1) Supports Provided.
2) Participant Presentation.
3) Goals.
4) Incidents + Follow-up.

OUTPUT ONLY THE BODY TEXT.
NO HEADERS.
NO TITLES.
NO INTRO LINES.
`;

    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "llama3",
        prompt,
        stream: false
      }
    );

    let modelText = (ollamaResponse.data.response || "").trim();

    if (modelText.startsWith("ERROR:")) {
      return res.status(400).json({ error: modelText });
    }

    const filteredBody = applyComplianceFilter(
      modelText,
      rawCombined,
      workerName
    );

    const header = [
      `Support Worker: ${workerName}`,
      `Date of Support: ${date}`,
      `Shift Time: ${shiftTime}`,
      `Location: ${safeLocation}`,
      `Participant: ${participantName}`
    ].join("\n");

    const fullNote = `${header}\n\n${filteredBody}`;

    const incidentText = (incidentsOrRisks || "").toLowerCase();
    const looksLikeNoIncident =
      /^no incidents?|^no incident|^none\b|^no concerns?/i.test(incText);

    const incidentFlag =
      incidentOccurred === true &&
      incidentText.length > 0 &&
      !looksLikeNoIncident;


    const insertStmt = db.prepare(`
    INSERT INTO progress_notes (
        organisationId,
        workerUserId,
        participantName,
        workerName,
        date,
        startTime,
        endTime,
        location,
        activitiesAndSupports,
        participantPresentation,
        goalsWorkedOn,
        incidentsOrRisks,
        followUpActions,
        noteText,
        incidentFlag,
        createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insertStmt.run(
    req.user.organisationId,
    req.user.id, // logged-in worker
    participantName,
    workerName,
    date,
    startTime,
    endTime,
    safeLocation,
    activitiesAndSupports,
    participantPresentation,
    goalsWorkedOn,
    incidentsOrRisks,
    followUpActions,
    fullNote,
    incidentFlag ? 1 : 0,
    new Date().toISOString()
    );

    return res.json({ note: fullNote, id: info.lastInsertRowid });
  } catch (error) {
    console.error("Error generating note:", error.message);
    return res.status(500).json({ error: "Failed to generate note" });
  }
});

module.exports = router;
