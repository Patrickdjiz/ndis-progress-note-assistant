// routes/notesRoutes.js
const express = require("express");
const axios = require("axios");

const applyComplianceFilter = require("../compliance");
const { timeToMinutes, parseYyyyMmDd, looksLikeJunk } = require("../utils");
const { requireAuth } = require("../authMiddleware");
const { generateNoteSchema, notesQuerySchema } = require("../validation");
const { AI_BASE_URL, AI_MODEL } = require("../config/env");
const { query } = require("../dbAdapter");

const router = express.Router();

// Helper: normalise a Postgres note row to the old camelCase shape
function normaliseNoteRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    organisationId: row.organisation_id,
    workerUserId: row.worker_user_id,
    participantName: row.participant_name,
    workerName: row.worker_name,
    date: row.date, // pg client will serialise DATE to ISO string in JSON
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    activitiesAndSupports: row.activities_and_supports,
    participantPresentation: row.participant_presentation,
    goalsWorkedOn: row.goals_worked_on,
    incidentsOrRisks: row.incidents_or_risks,
    followUpActions: row.follow_up_actions,
    noteText: row.note_text,
    incidentFlag: row.incident_flag,
    createdAt: row.created_at,
    finalNoteText: row.final_note_text,
    finalisedAt: row.finalised_at,
    finalisedBy: row.finalised_by,
    reviewedFlag: row.reviewed_flag,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  };
}

// All routes in this file require auth
router.use(requireAuth);

// GET /api/notes  (list recent notes with filters, org-scoped)
router.get("/notes", async (req, res) => {
  try {
    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    // ✅ Validate query
    const parsed = notesQuerySchema.safeParse({
      participant: req.query.participant,
      hasIncident: req.query.hasIncident,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid query parameters" });
    }

    const { participant, hasIncident } = parsed.data;

    let sql = `
      SELECT *
      FROM progress_notes
      WHERE organisation_id = $1
    `;
    const params = [req.user.organisationId];
    let idx = 2;

    // Worker: only their own notes
    if (req.user.role === "WORKER") {
      sql += ` AND worker_user_id = $${idx++}`;
      params.push(req.user.id);
    }

    if (participant && participant.trim()) {
      sql += ` AND participant_name ILIKE $${idx++}`;
      params.push(`%${participant.trim()}%`);
    }

    if (hasIncident === "true") {
      sql += " AND incident_flag = TRUE";
    } else if (hasIncident === "false") {
      sql += " AND incident_flag = FALSE";
    }

    sql += " ORDER BY created_at DESC LIMIT 50";

    const { rows } = await query(sql, params);
    const notes = rows.map(normaliseNoteRow);
    return res.json({ notes });
  } catch (err) {
    console.error("Error listing notes:", err.message);
    return res.status(500).json({ error: "Failed to list notes" });
  }
});

// GET /api/notes/:id  (single note, org-scoped)
router.get("/notes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    let sql = `
      SELECT *
      FROM progress_notes
      WHERE id = $1
        AND organisation_id = $2
    `;
    const params = [id, req.user.organisationId];
    let idx = 3;

    if (req.user.role === "WORKER") {
      sql += ` AND worker_user_id = $${idx++}`;
      params.push(req.user.id);
    }

    const { rows } = await query(sql, params);
    const note = normaliseNoteRow(rows[0]);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    return res.json({ note });
  } catch (err) {
    console.error("Error fetching note:", err.message);
    return res.status(500).json({ error: "Failed to fetch note" });
  }
});

// POST /api/notes/:id/finalise
router.post("/notes/:id/finalise", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

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

    const finalisedByName = req.user.fullName || "";
    const nowIso = new Date().toISOString();

    // Check note exists & belongs to org (and worker, if worker)
    let sql = `
      SELECT id
      FROM progress_notes
      WHERE id = $1
        AND organisation_id = $2
    `;
    const params = [id, req.user.organisationId];
    let idx = 3;

    if (req.user.role === "WORKER") {
      sql += ` AND worker_user_id = $${idx++}`;
      params.push(req.user.id);
    }

    const { rows } = await query(sql, params);
    if (!rows[0]) {
      return res.status(404).json({ error: "Note not found" });
    }

    await query(
      `
        UPDATE progress_notes
        SET final_note_text = $1,
            finalised_at   = $2,
            finalised_by   = $3
        WHERE id = $4
      `,
      [finalNoteText.toString().trim(), nowIso, finalisedByName, id]
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
router.post("/notes/:id/review", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    if (req.user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only admins can review notes" });
    }

    const { reviewedFlag } = req.body;
    const flag = reviewedFlag === false ? 0 : 1;
    const reviewerName = req.user.fullName || "";
    const nowIso = new Date().toISOString();

    const { rows } = await query(
      `
        SELECT id
        FROM progress_notes
        WHERE id = $1
          AND organisation_id = $2
      `,
      [id, req.user.organisationId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Note not found" });
    }

    await query(
      `
        UPDATE progress_notes
        SET reviewed_flag = $1,
            reviewed_at   = $2,
            reviewed_by   = $3
        WHERE id = $4
      `,
      [flag === 1, flag ? nowIso : null, flag ? reviewerName : null, id]
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

    // ✅ Validate body with Zod
    const parsed = generateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid note data" });
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
      incidentOccurred,
    } = parsed.data;

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
        error: "Date of support cannot be in the future.",
      });
    }

    // 3. Time sanity
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    if (process.env.NODE_ENV === "development") {
      console.log("DEBUG times:", { startTime, endTime, startMins, endMins });
    }

    if (startMins === null || endMins === null) {
      return res.status(400).json({
        error: "Invalid start or end time format.",
      });
    }

    if (endMins <= startMins) {
      return res.status(400).json({
        error: "End time must be after start time for the shift.",
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
          junkFields.join(", "),
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

    const baseUrl = AI_BASE_URL.replace(/\/+$/, "");

    const ollamaResponse = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model: AI_MODEL,
        prompt,
        stream: false,
      },
      {
        timeout: 30_000, // 30s timeout so requests don't hang forever
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
      `Participant: ${participantName}`,
    ].join("\n");

    const fullNote = `${header}\n\n${filteredBody}`;

    const incidentText = (incidentsOrRisks || "").toLowerCase();
    const looksLikeNoIncident =
      /^no incidents?|^no incident|^none\b|^no concerns?/i.test(incidentText);

    const incidentFlag =
      incidentOccurred === true &&
      incidentText.length > 0 &&
      !looksLikeNoIncident;

    const createdAt = new Date().toISOString();

    // ---------- Postgres insert ----------
    const insertSql = `
      INSERT INTO progress_notes (
        organisation_id,
        worker_user_id,
        participant_name,
        worker_name,
        date,
        start_time,
        end_time,
        location,
        activities_and_supports,
        participant_presentation,
        goals_worked_on,
        incidents_or_risks,
        follow_up_actions,
        note_text,
        incident_flag,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      )
      RETURNING id
    `;

    const { rows } = await query(insertSql, [
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
      incidentFlag === true,
      createdAt,
    ]);

    const newId = rows[0].id;

    return res.json({ note: fullNote, id: newId });
  } catch (error) {
    console.error("Error generating note:", {
      message: error.message,
      stack: error.stack,
      axios: error.response?.data,
    });

    return res.status(500).json({
      error:
        "Failed to generate note. If this keeps happening, please contact the system administrator.",
    });
  }
});

module.exports = router;
