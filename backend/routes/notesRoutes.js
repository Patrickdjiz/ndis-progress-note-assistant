// routes/notesRoutes.js
const express = require("express");
const axios = require("axios");

const applyComplianceFilter = require("../compliance");
const { timeToMinutes, parseYyyyMmDd, looksLikeJunk } = require("../utils");
const { requireAuth } = require("../authMiddleware");
const { generateNoteSchema, notesQuerySchema } = require("../validation");
const { AI_BASE_URL, AI_MODEL, NODE_ENV } = require("../config/env");
const { query } = require("../dbAdapter");

const router = express.Router();

// All routes in this file require auth
router.use(requireAuth);

// -----------------------------------------------------
// GET /api/notes  (list recent notes with filters, org-scoped)
// -----------------------------------------------------
router.get("/notes", async (req, res) => {
  try {
    // Block OWNER at API level just in case
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

    const conditions = ["organisation_id = $1"];
    const params = [req.user.organisationId];
    let idx = 2;

    // Worker: only their own notes
    if (req.user.role === "WORKER") {
      conditions.push(`worker_user_id = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    if (participant && participant.trim()) {
      conditions.push(`participant_name ILIKE $${idx}`);
      params.push(`%${participant.trim()}%`);
      idx++;
    }

    if (hasIncident === "true") {
      conditions.push("incident_flag = TRUE");
    } else if (hasIncident === "false") {
      conditions.push("incident_flag = FALSE");
    }

    const sql = `
      SELECT
        id,
        participant_name      AS "participantName",
        worker_name           AS "workerName",
        date,
        start_time            AS "startTime",
        end_time              AS "endTime",
        location,
        incident_flag         AS "incidentFlag",
        created_at            AS "createdAt",
        finalised_at          AS "finalisedAt",
        reviewed_flag         AS "reviewedFlag"
      FROM progress_notes
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const { rows } = await query(sql, params);

    return res.json({ notes: rows });
  } catch (err) {
    console.error("Error listing notes:", err.message);
    return res.status(500).json({ error: "Failed to list notes" });
  }
});

// -----------------------------------------------------
// GET /api/notes/:id  (single note, org-scoped)
// -----------------------------------------------------
router.get("/notes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    const conditions = ["id = $1", "organisation_id = $2"];
    const params = [id, req.user.organisationId];
    let idx = 3;

    if (req.user.role === "WORKER") {
      conditions.push(`worker_user_id = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    const sql = `
      SELECT
        id,
        organisation_id         AS "organisationId",
        worker_user_id          AS "workerUserId",
        participant_name        AS "participantName",
        worker_name             AS "workerName",
        date,
        start_time              AS "startTime",
        end_time                AS "endTime",
        location,
        activities_and_supports AS "activitiesAndSupports",
        participant_presentation AS "participantPresentation",
        goals_worked_on         AS "goalsWorkedOn",
        incidents_or_risks      AS "incidentsOrRisks",
        follow_up_actions       AS "followUpActions",
        note_text               AS "noteText",
        incident_flag           AS "incidentFlag",
        created_at              AS "createdAt",
        final_note_text         AS "finalNoteText",
        finalised_at            AS "finalisedAt",
        finalised_by            AS "finalisedBy",
        reviewed_flag           AS "reviewedFlag",
        reviewed_at             AS "reviewedAt",
        reviewed_by             AS "reviewedBy"
      FROM progress_notes
      WHERE ${conditions.join(" AND ")}
      LIMIT 1
    `;

    const { rows } = await query(sql, params);
    const row = rows[0];

    if (!row) {
      return res.status(404).json({ error: "Note not found" });
    }

    return res.json({ note: row });
  } catch (err) {
    console.error("Error fetching note:", err.message);
    return res.status(500).json({ error: "Failed to fetch note" });
  }
});

// -----------------------------------------------------
// POST /api/notes/:id/finalise
// -----------------------------------------------------
router.post("/notes/:id/finalise", async (req, res) => {
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

    const { finalNoteText } = req.body || {};
    if (!finalNoteText || !finalNoteText.toString().trim()) {
      return res
        .status(400)
        .json({ error: "Final note text is required" });
    }
    const trimmedText = finalNoteText.toString().trim();

    const finalisedByName = req.user.fullName || "";

    // Check note exists & is in same org (and for workers, belongs to them)
    const conditions = ["id = $1", "organisation_id = $2"];
    const params = [id, req.user.organisationId];
    let idx = 3;

    if (req.user.role === "WORKER") {
      conditions.push(`worker_user_id = $${idx}`);
      params.push(req.user.id);
      idx++;
    }

    const checkSql = `
      SELECT id
      FROM progress_notes
      WHERE ${conditions.join(" AND ")}
      LIMIT 1
    `;

    const { rows: existingRows } = await query(checkSql, params);
    if (!existingRows[0]) {
      return res.status(404).json({ error: "Note not found" });
    }

    const nowIso = new Date().toISOString();

    await query(
      `
        UPDATE progress_notes
        SET final_note_text = $1,
            finalised_at   = $2,
            finalised_by   = $3
        WHERE id = $4
      `,
      [trimmedText, nowIso, finalisedByName, id]
    );

    return res.json({
      ok: true,
      finalisedAt: nowIso,
      finalisedBy: finalisedByName,
      finalNoteText: trimmedText,
    });
  } catch (err) {
    console.error("Error finalising note:", err.message);
    return res.status(500).json({ error: "Failed to finalise note" });
  }
});

// -----------------------------------------------------
// POST /api/notes/:id/review
// -----------------------------------------------------
router.post("/notes/:id/review", async (req, res) => {
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

    const { reviewedFlag } = req.body || {};
    const flag = reviewedFlag === false ? false : true;

    const reviewerName = req.user.fullName || "";

    const { rows: existingRows } = await query(
      `
        SELECT id
        FROM progress_notes
        WHERE id = $1
          AND organisation_id = $2
        LIMIT 1
      `,
      [id, req.user.organisationId]
    );

    if (!existingRows[0]) {
      return res.status(404).json({ error: "Note not found" });
    }

    const nowIso = new Date().toISOString();

    await query(
      `
        UPDATE progress_notes
        SET reviewed_flag = $1,
            reviewed_at   = $2,
            reviewed_by   = $3
        WHERE id = $4
      `,
      [
        flag,
        flag ? nowIso : null,
        flag ? reviewerName : null,
        id,
      ]
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

// -----------------------------------------------------
// POST /api/generate-note  (org-scoped)
// -----------------------------------------------------
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

    if (NODE_ENV === "development") {
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
        timeout: 30_000,
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

    // Insert into Postgres
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
        incident_flag
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15
      )
      RETURNING id
    `;

    const { rows } = await query(insertSql, [
      req.user.organisationId,
      req.user.id,
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
      incidentFlag,
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
