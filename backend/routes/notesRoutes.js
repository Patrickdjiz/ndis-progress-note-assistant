// routes/notesRoutes.js
const express = require("express");
const axios = require("axios");

const sqliteDb = require("../db"); // only used when not on Postgres
const applyComplianceFilter = require("../compliance");
const { timeToMinutes, parseYyyyMmDd, looksLikeJunk } = require("../utils");
const { requireAuth } = require("../authMiddleware");
const { generateNoteSchema, notesQuerySchema } = require("../validation");
const { AI_BASE_URL, AI_MODEL } = require("../config/env");
const { query, isPostgres } = require("../dbAdapter");

const router = express.Router();

// Helper: normalise a Postgres note row to the old camelCase shape
function normaliseNoteRow(row) {
  if (!row) return null;
  if (!isPostgres) return row;

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

    if (isPostgres) {
      // ---------- Postgres path ----------
      let sql = `
        SELECT *
        FROM progress_notes
        WHERE organisation_id = $1
      `;
      const params = [req.user.organisationId];
      let idx = 2;

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
    }

    // ---------- SQLite fallback ----------
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

    const stmt = sqliteDb.prepare(baseQuery);
    const rows = stmt.all(...params);

    return res.json({ notes: rows });
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

    if (isPostgres) {
      // ---------- Postgres path ----------
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
    }

    // ---------- SQLite fallback ----------
    let querySql = `
      SELECT *
      FROM progress_notes
      WHERE id = ?
        AND organisationId = ?
    `;
    const params = [id, req.user.organisationId];

    if (req.user.role === "WORKER") {
      querySql += " AND workerUserId = ?";
      params.push(req.user.id);
    }

    const stmt = sqliteDb.prepare(querySql);
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

    if (isPostgres) {
      // ---------- Postgres path ----------
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
    }

    // ---------- SQLite fallback ----------
    let querySql = `
      SELECT *
      FROM progress_notes
      WHERE id = ?
        AND organisationId = ?
    `;
    const params = [id, req.user.organisationId];

    if (req.user.role === "WORKER") {
      querySql += " AND workerUserId = ?";
      params.push(req.user.id);
    }

    const stmtCheck = sqliteDb.prepare(querySql);
    const existing = stmtCheck.get(...params);

    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    const stmtUpdate = sqliteDb.prepare(`
      UPDATE progress_notes
      SET finalNoteText = ?,
          finalisedAt   = ?,
          finalisedBy   = ?
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

    if (isPostgres) {
      // ---------- Postgres path ----------
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
    }

    // ---------- SQLite fallback ----------
    const stmtCheck = sqliteDb.prepare(`
      SELECT id
      FROM progress_notes
      WHERE id = ?
        AND organisationId = ?
    `);
    const existing = stmtCheck.get(id, req.user.organisationId);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }

    const stmtUpdate = sqliteDb.prepare(`
      UPDATE progress_notes
      SET reviewedFlag = ?,
          reviewedAt   = ?,
          reviewedBy   = ?
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

    // --- date/time / junk checks unchanged (keeping your logic) ---
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

    // --- LLM call (unchanged, just using env) ---
    const prompt = `...` + // keep your existing big prompt exactly as-is
`OUTPUT ONLY THE BODY TEXT.
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

    const createdAt = new Date().toISOString();

    let newId;

    if (isPostgres) {
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
        incidentFlag === true,
        createdAt,
      ]);

      newId = rows[0].id;
    } else {
      // ---------- SQLite insert ----------
      const insertStmt = sqliteDb.prepare(`
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
        incidentFlag ? 1 : 0,
        createdAt
      );

      newId = info.lastInsertRowid;
    }

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
