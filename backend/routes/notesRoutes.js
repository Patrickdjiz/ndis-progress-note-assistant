// routes/notesRoutes.js
const express = require("express");
const { chatLLM } = require("../llmClient");

const applyComplianceFilter = require("../compliance");
const { timeToMinutes, parseYyyyMmDd, looksLikeJunk } = require("../utils");
const { requireAuth } = require("../authMiddleware");
const { generateNoteSchema, notesQuerySchema } = require("../validation");
const { query } = require("../dbAdapter");
const PDFDocument = require("pdfkit");


const router = express.Router();

function clip(s, max = 1500) {
  if (!s) return "";
  const str = String(s);
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function tidyModelText(s) {
  let t = String(s || "").trim();

  // Fix "The support worker, provided..." at start of note OR start of a paragraph
  // (avoid removing comma when followed by "who/which/that")
  t = t.replace(/(^|\n\s*\n)\s*The support worker,\s+(?!who\b|which\b|that\b)/gi, "$1The support worker ");

  // Fix lowercase "the support worker" at start, after blank lines, or after sentence endings
  t = t.replace(/(^|\n\s*\n|[.!?]\s+)\s*the support worker\b/gi, "$1The support worker");

  // Clean double spaces
  t = t.replace(/[ \t]{2,}/g, " ");

  return t.trim();
}

// ---------------- PDF helpers ----------------
const TZ = process.env.APP_TZ || "Australia/Sydney";

const ymdOnly = (v) => {
  if (!v) return "note";
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "note";
};


const fmtDateOnly = (v) => {
  const ymd = ymdOnly(v);
  if (ymd === "note") return "-";
  const [y, m, d] = ymd.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
};

const fmtDateTimeTz = (v) => {
  if (!v) return "-";
  const dt = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(dt.getTime())) return String(v);

  const main = dt.toLocaleString("en-AU", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Try append AEDT/AEST if available
  let abbr = "";
  try {
    abbr =
      new Intl.DateTimeFormat("en-AU", { timeZone: TZ, timeZoneName: "short" })
        .formatToParts(dt)
        .find((p) => p.type === "timeZoneName")?.value || "";
  } catch {}

  return abbr ? `${main} ${abbr}` : main;
};

const tzInfoForDate = (dateVal) => {
  const ymd = ymdOnly(dateVal);
  if (ymd === "note") return { abbr: "", offset: "" };

  const base = new Date(`${ymd}T12:00:00.000Z`);

  let abbr = "";
  let offset = "";

  try {
    abbr =
      new Intl.DateTimeFormat("en-AU", { timeZone: TZ, timeZoneName: "short" })
        .formatToParts(base)
        .find((p) => p.type === "timeZoneName")?.value || "";
  } catch {}

  try {
    // longOffset is more reliable than shortOffset across Node versions
    offset =
      new Intl.DateTimeFormat("en-AU", { timeZone: TZ, timeZoneName: "longOffset" })
        .formatToParts(base)
        .find((p) => p.type === "timeZoneName")?.value?.replace(/^GMT/, "UTC") || "";
  } catch {}

  return { abbr, offset };
};

const hm = (t) => (t ? String(t).slice(0, 5) : ""); // "16:09:00" -> "16:09"

// Prevent duplicated headers in the body (your note_text includes header lines)
const stripNoteHeader = (txt) => {
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

  if (sawHeader) {
    while (i < lines.length && lines[i].trim() === "") i++;
  }

  return lines.slice(i).join("\n").trim();
};

const safeFilePart = (s) =>
  String(s || "")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 60);


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
    archivedFlag: row.archived_flag,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
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
      archived: req.query.archived,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return res.status(400).json({ error: msg || "Invalid query parameters" });
    }

    const { participant, hasIncident } = parsed.data;
    const archived = parsed.data.archived ?? "false";

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

    if (archived === "true") {
      sql += " AND archived_flag = TRUE";
    } else if (archived === "false") {
      sql += " AND archived_flag = FALSE";
    }

    // add to your parsed query (see validation note below)
    const limit = parsed.data.limit ?? 50;
    const cursor = parsed.data.cursor; // base64 "createdAt|id"
    const take = limit + 1;

    // cursor filter
    if (cursor) {
      let decoded = "";
      try {
        decoded = Buffer.from(cursor, "base64").toString("utf8");
      } catch {
        return res.status(400).json({ error: "Invalid cursor" });
      }

      const [createdAtStr, idStr] = decoded.split("|");
      const cursorCreatedAt = new Date(createdAtStr);
      const cursorId = Number(idStr);

      if (!createdAtStr || !Number.isInteger(cursorId) || Number.isNaN(cursorCreatedAt.getTime())) {
        return res.status(400).json({ error: "Invalid cursor" });
      }

      sql += ` AND (created_at, id) < ($${idx++}, $${idx++})`;
      params.push(cursorCreatedAt, cursorId);
    }

    sql += ` ORDER BY created_at DESC, id DESC LIMIT $${idx++}`;
    params.push(take);


    const { rows } = await query(sql, params);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const notes = pageRows.map(normaliseNoteRow);

    let nextCursor = null;
    if (hasMore) {
      const last = pageRows[pageRows.length - 1];
      const lastCreatedAt = last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at);
      nextCursor = Buffer.from(`${lastCreatedAt}|${last.id}`, "utf8").toString("base64");
    }

    return res.json({ notes, nextCursor });
  } catch (err) {
    console.error("Error listing notes:", err.message);
    return res.status(500).json({ error: "Failed to list notes" });
  }
});

// GET /api/notes/:id (single note, org-scoped)
router.get("/notes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid note id" });

  if (req.user.role === "OWNER") {
    return res.status(403).json({ error: "Owners cannot access notes API" });
  }

  let sql = `
    SELECT *
    FROM progress_notes
    WHERE id = $1 AND organisation_id = $2
  `;
  const params = [id, req.user.organisationId];
  let idx = 3;

  // WORKER only sees their own
  if (req.user.role === "WORKER") {
    sql += ` AND worker_user_id = $${idx++}`;
    params.push(req.user.id);
  }

  const { rows } = await query(sql, params);
  if (!rows[0]) return res.status(404).json({ error: "Note not found" });

  return res.json({ note: normaliseNoteRow(rows[0]) });
});


// POST /api/notes/:id/review
router.post("/notes/:id/review", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can review notes" });
    }

    // boolean, default true unless explicitly false
    const reviewedFlag = req.body.reviewedFlag === false ? false : true;

    // optional: accept typed reviewerName, otherwise fallback to account name
    const reviewerName =
      (req.body.reviewerName && req.body.reviewerName.toString().trim()) ||
      (req.user.fullName || "");

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
      [
        reviewedFlag,
        reviewedFlag ? nowIso : null,
        reviewedFlag ? reviewerName : null,
        id,
      ]
    );

    return res.json({
      ok: true,
      reviewedFlag, // ✅ boolean now
      reviewedAt: reviewedFlag ? nowIso : null,
      reviewedBy: reviewedFlag ? reviewerName : null,
    });
  } catch (err) {
    console.error("Error updating review status:", err.message);
    return res.status(500).json({ error: "Failed to update review status" });
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


// POST /api/generate-note  (org-scoped)
router.post("/generate-note", async (req, res) => {
  req.setTimeout(260_000);
  res.setTimeout(260_000);

  try {
    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot generate notes" });
    }

    if (req.user.role !== "WORKER") {
      return res.status(403).json({ error: "Only workers can generate notes" });
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
      incidentOccurred,
    } = parsed.data;

    // Always take worker name from the logged-in user (prevents spoofing)
    const workerName = (req.user.fullName || "").trim() || "Support Worker";

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


    const systemPrompt = `
    You are assisting NDIS disability support workers to write professional, objective and compliant progress notes.

    You will receive structured information about ONE support shift. Your task is to write the BODY of an NDIS-style progress note ONLY (no headers).

    If the information is vague, gibberish, placeholder text (e.g., “asd”, “test”, “n/a”, or extremely short responses that do not describe what happened), then:
    - Do NOT generate a normal note.
    - Instead, return exactly:
      ERROR: Insufficient information. Please rewrite the following fields with real details.

    Otherwise, generate a high-quality progress note BODY ONLY.

    -----------------------------------------------------------
    STYLE, FORMAT & SAFETY RULES
    -----------------------------------------------------------

    1) Write STRICTLY in third-person.
      - Use “the support worker”, “the participant”, or their name.
      - NEVER use “I”, “we”, “my”, “our”.

    1a) The first sentence of the first paragraph MUST literally begin with:
        "The support worker..."

    2) Be FACTUAL and OBSERVABLE.
      - Describe what occurred and what was observed.
      - Do NOT infer thoughts, emotions, intentions, or internal states unless explicitly stated in the input.

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
    `.trim();

    const userPrompt = `
    DATA PROVIDED:
    Participant: ${clip(participantName, 120)}
    Date of Support: ${clip(date, 20)}
    Shift Time: ${clip(shiftTime, 20)}
    Location: ${clip(safeLocation, 120)}

    Raw input – Activities & Supports:
    ${clip(activitiesAndSupports, 2000)}

    Raw input – Participant Presentation:
    ${clip(participantPresentation, 2000)}

    Raw input – Goals Worked On:
    ${clip(goalsWorkedOn, 2000)}

    Raw input – Incidents, Risks, Changes:
    ${clip(incidentsOrRisks, 2000)}

    Raw input – Follow-up / Next Steps:
    ${clip(followUpActions, 2000)}

    Support worker: ${clip(workerName, 120)}
    `.trim();

    const { text: modelOut } = await chatLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
    });

    let modelText = tidyModelText(modelOut);

    if (modelText.startsWith("ERROR:")) {
      return res.status(400).json({ error: modelText });
    }

    const filteredBody = applyComplianceFilter(modelText, rawCombined, workerName);

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
    console.error("Error generating note:", error?.message || error);

    return res.status(500).json({
      error:
        "Failed to generate note. If this keeps happening, please contact the system administrator.",
    });
  }
});

// GET /api/notes/:id/pdf  (download note as PDF, org-scoped)
router.get("/notes/:id/pdf", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    // Keep your existing rule
    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    let sql = `
      SELECT
        pn.id,
        pn.organisation_id,
        o.name AS organisation_name,

        pn.worker_user_id,
        pn.participant_name,
        pn.worker_name,
        pn.date,
        pn.start_time,
        pn.end_time,
        pn.location,

        pn.activities_and_supports,
        pn.participant_presentation,
        pn.goals_worked_on,
        pn.incidents_or_risks,
        pn.follow_up_actions,

        pn.note_text,
        pn.final_note_text,
        pn.incident_flag,
        pn.created_at,

        pn.finalised_at,
        pn.finalised_by,

        pn.reviewed_flag,
        pn.reviewed_at,
        pn.reviewed_by
      FROM progress_notes pn
      JOIN organisations o ON o.id = pn.organisation_id
      WHERE pn.id = $1
        AND pn.organisation_id = $2
    `;
    const params = [id, req.user.organisationId];
    let idx = 3;

    // Same restriction you already have
    if (req.user.role === "WORKER") {
      sql += ` AND pn.worker_user_id = $${idx++}`;
      params.push(req.user.id);
    }

    sql += ` LIMIT 1`;

    const { rows } = await query(sql, params);
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: "Note not found" });
    }

    const fileDate = ymdOnly(row.date);
res.setHeader("Content-Type", "application/pdf");
res.setHeader(
  "Content-Disposition",
  `attachment; filename="NDIS_Note_${row.id}_${fileDate}_${safeFilePart(row.participant_name)}.pdf"`
);



    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `NDIS Progress Note #${row.id}`,
        Author: "NDIS AI Notes",
      },
    });

    doc.pipe(res);

    // Helpers
    const labelValue = (label, value) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value || "-");
    };

    const section = (title, body) => {
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(title);
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(11).fillColor("#111827").text(body || "-", {
        align: "left",
      });
    };

    const generated = fmtDateTimeTz(new Date());
const { abbr, offset } = tzInfoForDate(row.date);

// Header
doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("NDIS Progress Note");
doc.moveDown(0.2);
doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text(`Generated: ${generated}`);

// This is the “easy to understand for anyone” line:
doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text(
  `Times shown in Australian Eastern Time (AET)${abbr ? ` — ${abbr}` : ""}${offset ? ` (${offset})` : ""}`
);

doc.moveDown(0.8);
doc.fontSize(11).fillColor("#111827");


    labelValue("Organisation", row.organisation_name);
    labelValue("Participant", row.participant_name);
    labelValue("Worker", row.worker_name);

    const shiftTime =
  row.start_time && row.end_time ? `${hm(row.start_time)}–${hm(row.end_time)}` : "-";

labelValue("Date", fmtDateOnly(row.date));
labelValue("Shift time", shiftTime);
labelValue("Created", fmtDateTimeTz(row.created_at));

if (row.finalised_at) {
  labelValue("Finalised", `${fmtDateTimeTz(row.finalised_at)}${row.finalised_by ? ` (by ${row.finalised_by})` : ""}`);
} else {
  labelValue("Finalised", "No");
}

if (row.reviewed_flag) {
  const reviewedText =
    `${row.reviewed_at ? fmtDateTimeTz(row.reviewed_at) : ""}${row.reviewed_by ? ` (by ${row.reviewed_by})` : ""}`.trim();
  labelValue("Reviewed", reviewedText || "Yes");
} else {
  labelValue("Reviewed", "No");
}


    // Divider
    doc.moveDown(0.8);
    doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    
    // Final note (preferred)
    const finalBody = stripNoteHeader(row.final_note_text || row.note_text || "");
    section("Final note", finalBody || "-");


    doc.end();
  } catch (err) {
    console.error("Error generating PDF:", err.message);
    return res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// POST /api/notes/:id/archive
// Body: { archivedFlag: boolean, archivedBy?: string }
router.post("/notes/:id/archive", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid note id" });
    }

    if (req.user.role === "OWNER") {
      return res.status(403).json({ error: "Owners cannot access notes API" });
    }

    const archivedFlag = !!req.body.archivedFlag;

    const archivedBy =
      (req.body.archivedBy && req.body.archivedBy.toString().trim()) ||
      (req.user.fullName || "");

    // Must exist in org (+ if WORKER, must be their own note)
    let sqlCheck = `
      SELECT id
      FROM progress_notes
      WHERE id = $1
        AND organisation_id = $2
    `;
    const params = [id, req.user.organisationId];
    let idx = 3;

    if (req.user.role === "WORKER") {
      sqlCheck += ` AND worker_user_id = $${idx++}`;
      params.push(req.user.id);
    }

    const { rows: exists } = await query(sqlCheck, params);
    if (!exists[0]) {
      return res.status(404).json({ error: "Note not found" });
    }

    const nowIso = new Date().toISOString();

    const { rows } = await query(
      `
      UPDATE progress_notes
      SET
        archived_flag = $1,
        archived_at   = $2,
        archived_by   = $3
      WHERE id = $4
        AND organisation_id = $5
      RETURNING archived_flag, archived_at, archived_by
      `,
      [
        archivedFlag,
        archivedFlag ? nowIso : null,
        archivedFlag ? archivedBy : null,
        id,
        req.user.organisationId,
      ]
    );

    return res.json({
      ok: true,
      archivedFlag: rows[0].archived_flag,
      archivedAt: rows[0].archived_at,
      archivedBy: rows[0].archived_by,
    });
  } catch (err) {
    console.error("Error archiving note:", err.message);
    return res.status(500).json({ error: "Failed to update archive state" });
  }
});


module.exports = router;
