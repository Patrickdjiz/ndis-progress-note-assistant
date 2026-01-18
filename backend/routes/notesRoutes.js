// routes/notesRoutes.js
const express = require("express");
const { chatLLM } = require("../llmClient");
const { rateLimit, makeStore, limiterHandler, ipKeyGenerator } = require("../rateLimit");

const applyComplianceFilter = require("../compliance");
const { timeToMinutes, parseYyyyMmDd, looksLikeJunk } = require("../utils");
const { requireAuth } = require("../authMiddleware");
const { generateNoteSchema, notesListQuerySchema, notesSearchSchema } = require("../validation");
const { query } = require("../dbAdapter");
const PDFDocument = require("pdfkit");
const { redactPII } = require("../pii");
const { audit } = require("../audit");
const { z } = require("zod");
const sendErr = (res, req, status, msg) =>
  res.status(status).json({ error: msg, requestId: req.id });

const router = express.Router();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAllCaseInsensitive(haystack, needle, replacement) {
  if (!needle) return haystack;
  const re = new RegExp(escapeRegExp(needle), "gi");
  return String(haystack || "").replace(re, replacement);
}

function deidentifyForLLM({ participantName, workerName, text }) {
  let out = String(text || "");
  if (participantName) out = replaceAllCaseInsensitive(out, participantName, "[PARTICIPANT]");
  if (workerName) out = replaceAllCaseInsensitive(out, workerName, "[WORKER]");
  return redactPII(out); // your existing generic PII redaction
}


function isTransientLLMError(err) {
  const code = err?.code;
  const status = err?.response?.status;

  // Common Node/axios transient network codes
  if (code && ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND"].includes(code)) {
    return true;
  }

  // Retryable HTTP statuses (rate limit / gateway / timeout)
  if (status && [408, 409, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("rate limit") || msg.includes("temporar")) {
    return true;
  }

  return false;
}

async function chatLLMWithRetry(opts) {
  try {
    return await chatLLM(opts);
  } catch (err) {
    if (!isTransientLLMError(err)) throw err;

    // retry once (small delay)
    await sleep(300);
    return await chatLLM(opts);
  }
}


// ---- Rate limiting for notes list/search ----
// Higher threshold than login because the UI legitimately loads lists/pagination.

const ipKey = (req, res) => ipKeyGenerator(req, res);
const userOrIpKey = (req, res) => (req.user?.id ? `u:${req.user.id}` : ipKey(req, res));

const notesIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:ip:"),   // ✅ add this
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many requests to notes. Please slow down." },
});

const notesUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:user:"), // ✅ add this
  keyGenerator: userOrIpKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many requests to notes. Please slow down." },
});

const notesReadIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:read:ip:"),
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many note reads. Please slow down." },
});

const notesReadUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:read:user:"),
  keyGenerator: userOrIpKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many note reads. Please slow down." },
});

const notesPdfIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:pdf:ip:"),
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many PDF downloads. Please slow down." },
});

const notesPdfUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:pdf:user:"),
  keyGenerator: userOrIpKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many PDF downloads. Please slow down." },
});

const notesWriteIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:write:ip:"),
  keyGenerator: ipKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many note updates. Please slow down." },
});

const notesWriteUserLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("rl:notes:write:user:"),
  keyGenerator: userOrIpKey,
  skip: (req) => req.method === "OPTIONS",
  handler: limiterHandler,
  message: { error: "Too many note updates. Please slow down." },
});


// ---- Body validation schemas ----
const reviewBodySchema = z.object({
  // allow omitted -> defaults to true, but if provided must be boolean
  reviewedFlag: z.boolean().optional().default(true),
});

const finaliseBodySchema = z.object({
  // choose a sensible max; adjust if your DB column is smaller/larger
  finalNoteText: z.string().trim().min(1).max(12000),
});

const archiveBodySchema = z.object({
  archivedFlag: z.boolean(),
});

const deleteBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const legalHoldBodySchema = z.object({
  legalHold: z.boolean(),
});

const metadataBodySchema = z.object({
  participantName: z.string().trim().min(1).max(200).optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  endTime: z.string().trim().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  incidentFlag: z.boolean().optional(),
}).refine((v) => {
  // if changing times, require both
  const touchingTimes = v.startTime !== undefined || v.endTime !== undefined;
  if (!touchingTimes) return true;
  return typeof v.startTime === "string" && typeof v.endTime === "string";
}, { message: "If updating shift times, provide both startTime and endTime." });

function diffChanges(before, after, keys) {
  const changes = {};
  for (const k of keys) {
    if (before[k] !== after[k] && after[k] !== undefined) {
      changes[k] = { from: before[k], to: after[k] };
    }
  }
  return changes;
}

const exportBodySchema = z.object({
  participant: z.string().trim().max(200).optional(),
  dateFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  includeArchived: z.boolean().optional().default(true),
  includeDeleted: z.boolean().optional().default(false),
  format: z.enum(["csv", "json"]).optional().default("csv"),
});


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

  try {
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
  } catch (e) {
    // If ICU/timezone data is missing on this Node build, fall back safely.
    try {
      return dt.toISOString().replace(".000Z", "Z");
    } catch {
      return String(v);
    }
  }
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
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,

    // ✅ ALWAYS return body-only (works for old + new records)
    noteText: stripNoteHeader(row.note_text),

    incidentFlag: row.incident_flag,
    createdAt: row.created_at,

    // ✅ ALSO body-only so final text never contains headers
    finalNoteText: row.final_note_text ? stripNoteHeader(row.final_note_text) : null,

    finalisedAt: row.finalised_at,
    finalisedBy: row.finalised_by,
    reviewedFlag: row.reviewed_flag,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    archivedFlag: row.archived_flag,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,

    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deletedReason: row.deleted_reason,

    legalHold: row.legal_hold,
    legalHoldSetAt: row.legal_hold_set_at,
    legalHoldSetBy: row.legal_hold_set_by,

    purgedAt: row.purged_at,
    deletedByUserId: row.deleted_by_user_id,
    legalHoldSetByUserId: row.legal_hold_set_by_user_id,
  };
}


// All routes in this file require auth
router.use(requireAuth);

router.use((req, res, next) => {
  if (req.user?.mustChangePassword) {
    return sendErr(res, req, 403, "You must change your password before continuing.");
  }
  next();
});


// GET /api/notes  (list recent notes with filters, org-scoped)
router.get("/notes", notesIpLimiter, notesUserLimiter, async (req, res) => {
    try {
    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot access notes API");
    }

    // ✅ prevent PII in URL
    if (req.query.participant) {
      return sendErr(res, req, 400, "Do not send participant in querystring. Use POST /api/notes/search.");
    }

    const parsed = notesListQuerySchema.safeParse({
      hasIncident: req.query.hasIncident,
      archived: req.query.archived,
      limit: req.query.limit,
      cursor: req.query.cursor,
      includeDeleted: req.query.includeDeleted,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid query parameters" );
    }

    const { hasIncident } = parsed.data;
    const archived = parsed.data.archived ?? "false";
    const limit = parsed.data.limit ?? 50;
    const cursor = parsed.data.cursor;
    const take = limit + 1;
    const includeDeleted =
    parsed.data.includeDeleted === "true" && req.user.role === "ADMIN";


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

    if (!includeDeleted) {
      sql += " AND deleted_at IS NULL";
    } 

    // cursor filter
    if (cursor) {
      let decoded = "";
      try {
        decoded = Buffer.from(cursor, "base64").toString("utf8");
      } catch {
        return sendErr(res, req, 400, "Invalid cursor" );
      }

      const [createdAtStr, idStr] = decoded.split("|");
      const cursorCreatedAt = new Date(createdAtStr);
      const cursorId = Number(idStr);

      if (!createdAtStr || !Number.isInteger(cursorId) || Number.isNaN(cursorCreatedAt.getTime())) {
        return sendErr(res, req, 400, "Invalid cursor" );
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
    console.error(`[${req.id}] Error listing notes:`, err);
    return sendErr(res, req, 500, "Failed to list notes");
     
  }
});

router.post("/notes/search", notesIpLimiter, notesUserLimiter, async (req, res) => {
  try {
    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot access notes API");
    }

    const parsed = notesSearchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid search body");
    }

    const participant = parsed.data.participant;
    const hasIncident = parsed.data.hasIncident; // boolean | undefined
    const archivedRaw = parsed.data.archived;    // boolean | "all" | undefined
    const archived =
      archivedRaw === "all"
        ? "all"
        : archivedRaw === undefined
          ? "false"
          : archivedRaw
            ? "true"
            : "false";
    const includeDeleted = parsed.data.includeDeleted === true && req.user.role === "ADMIN";

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

    if (hasIncident === true) sql += " AND incident_flag = TRUE";
    if (hasIncident === false) sql += " AND incident_flag = FALSE";

    if (archived === "true") sql += " AND archived_flag = TRUE";
    else if (archived === "false") sql += " AND archived_flag = FALSE";
    // if you want "all", skip filter

    if (!includeDeleted) {
      sql += " AND deleted_at IS NULL";
    }


    const limit = parsed.data.limit ?? 50;
    const cursor = parsed.data.cursor;
    const take = limit + 1;

    if (cursor) {
      let decoded = "";
      try {
        decoded = Buffer.from(cursor, "base64").toString("utf8");
      } catch {
        return sendErr(res, req, 400, "Invalid cursor");
      }

      const [createdAtStr, idStr] = decoded.split("|");
      const cursorCreatedAt = new Date(createdAtStr);
      const cursorId = Number(idStr);

      if (!createdAtStr || !Number.isInteger(cursorId) || Number.isNaN(cursorCreatedAt.getTime())) {
        return sendErr(res, req, 400, "Invalid cursor");
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
    console.error(`[${req.id}] Error searching notes:`, err);
    return sendErr(res, req, 500, "Failed to search notes");
  }
});


// GET /api/notes/:id (single note, org-scoped)
router.get("/notes/:id", notesReadIpLimiter, notesReadUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const includeDeleted = req.query.includeDeleted === "true" && req.user.role === "ADMIN";

    if (!Number.isInteger(id)) return sendErr(res, req, 400, "Invalid note id");

    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot access notes API");
    }

    let sql = `
      SELECT *
      FROM progress_notes
      WHERE id = $1 AND organisation_id = $2
    `;
    const params = [id, req.user.organisationId];
    let idx = 3;

    if (req.user.role === "WORKER") {
      sql += ` AND worker_user_id = $${idx++}`;
      params.push(req.user.id);
    }

    if (!includeDeleted) {
      sql += " AND deleted_at IS NULL";
    }

    const { rows } = await query(sql, params);
    if (!rows[0]) return sendErr(res, req, 404, "Note not found");

    return res.json({ note: normaliseNoteRow(rows[0]) });
  } catch (err) {
    console.error(`❌ [${req.id}] Error reading note:`, err);
    return sendErr(res, req, 500, "Failed to read note");
  }
});


// POST /api/notes/:id/review
router.post("/notes/:id/review",  notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid note id");
    }

    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can review notes");
    }

    // boolean, default true unless explicitly false
    const parsedBody = reviewBodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return sendErr(res, req, 400, "Invalid body");
    }

    const { reviewedFlag } = parsedBody.data;


    // optional: accept typed reviewerName, otherwise fallback to account name
    const reviewerName = (req.user.fullName || "").trim();


    const nowIso = new Date().toISOString();

        let updSql = `
      UPDATE progress_notes
      SET reviewed_flag = $1,
          reviewed_at   = $2,
          reviewed_by   = $3,
          updated_at    = now()
      WHERE id = $4
        AND organisation_id = $5
        AND deleted_at IS NULL
    `;

    const updParams = [
      reviewedFlag,
      reviewedFlag ? nowIso : null,
      reviewedFlag ? reviewerName : null,
      id,
      req.user.organisationId,
    ];

    const upd = await query(updSql, updParams);
    const changed = upd?.rowCount ?? upd?.changes ?? 0;
    if (!changed) return sendErr(res, req, 404, "Note not found");


    await audit(req, reviewedFlag ? "NOTE_REVIEWED" : "NOTE_UNREVIEWED", {
      targetType: "progress_note",
      targetId: String(id),
    });


    return res.json({
      ok: true,
      reviewedFlag, // ✅ boolean now
      reviewedAt: reviewedFlag ? nowIso : null,
      reviewedBy: reviewedFlag ? reviewerName : null,
    });
  } catch (err) {
    console.error(`[${req.id}] Error updating review status:`, err);
    return sendErr(res, req, 500, "Failed to update review status");
  }
});


// POST /api/notes/:id/finalise
router.post("/notes/:id/finalise", notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid note id");
    }

    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot finalise notes");
    }

    const parsedBody = finaliseBodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      const msg = parsedBody.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid body");
    }

    const { finalNoteText } = parsedBody.data; // already trimmed + validated

    // ✅ Enforce body-only storage (even if someone pasted a full header)
    const storedFinalBody = stripNoteHeader(finalNoteText).trim();  

    const finalisedByName = req.user.fullName || "";
    const nowIso = new Date().toISOString();

    // Check note exists & belongs to org (and worker, if worker)
    let updSql = `
      UPDATE progress_notes
      SET final_note_text = $1,
          finalised_at   = $2,
          finalised_by   = $3,
          updated_at    = now(),
          current_version_no = current_version_no + 1
      WHERE id = $4
        AND organisation_id = $5
        AND deleted_at IS NULL
      RETURNING id, current_version_no
    `;

    const updParams = [storedFinalBody, nowIso, finalisedByName, id, req.user.organisationId];

    if (req.user.role === "WORKER") {
      updSql = `
        UPDATE progress_notes
        SET final_note_text = $1,
            finalised_at   = $2,
            finalised_by   = $3,
            updated_at    = now(),
            current_version_no = current_version_no + 1
        WHERE id = $4
          AND organisation_id = $5
          AND worker_user_id = $6
          AND deleted_at IS NULL
        RETURNING id, current_version_no
      `;
      updParams.push(req.user.id);
    }

    const upd = await query(updSql, updParams);
    if (!upd.rows?.[0]) return sendErr(res, req, 404, "Note not found");

    const versionNo = upd.rows[0].current_version_no;

    // ✅ write version snapshot (body-only)
    await query(
      `
      INSERT INTO progress_note_versions
        (note_id, version_no, text, edited_at, edited_by_user_id, edited_by_name)
      VALUES ($1, $2, $3, now(), $4, $5)
      `,
      [id, versionNo, storedFinalBody, req.user.id, finalisedByName]
    );



    await audit(req, "NOTE_FINALISED", {
      targetType: "progress_note",
      targetId: String(id),
    });


    return res.json({
      ok: true,
      finalisedAt: nowIso,
      finalisedBy: finalisedByName,
      finalNoteText: storedFinalBody,
      versionNo,
    });
  } catch (err) {
    console.error(`[${req.id}] Error finalising note:`, err);
    return sendErr(res, req, 500, "Failed to finalise note");
  }
});


// POST /api/generate-note  (org-scoped)
router.post("/generate-note", async (req, res) => {
  req.setTimeout(260_000);
  res.setTimeout(260_000);

  try {
    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot generate notes");
    }

    if (!["WORKER", "ADMIN"].includes(req.user.role)) {
      return sendErr(res, req, 403, "Only workers or admins can generate notes");
    }

    // ✅ Validate body with Zod
    const parsed = generateNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid note data");
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
      consentAcknowledged,
    } = parsed.data;

    if (consentAcknowledged !== true) {
      return sendErr(res, req, 400, "Consent must be acknowledged before generating.");
    }

    // Always take worker name from the logged-in user (prevents spoofing)
    // --- worker attribution (provider-ready) ---
    let workerUserId = req.user.id;
    let workerName = (req.user.fullName || "").trim() || "Support Worker";

    // ADMIN can generate ONLY on behalf of an actual worker in the same org
    if (req.user.role === "ADMIN") {
      const selectedWorkerId = parsed.data.workerUserId;

      if (!selectedWorkerId) {
        return sendErr(res, req, 400, "Admins must select a worker before generating.");
      }

      const { rows: wRows } = await query(
        `
        SELECT id, full_name
        FROM users
        WHERE id = $1
          AND organisation_id = $2
          AND role = 'WORKER'
          AND is_active = TRUE
        LIMIT 1
        `,
        [selectedWorkerId, req.user.organisationId]
      );

      if (!wRows[0]) {
        return sendErr(res, req, 400, "Selected worker is invalid or not active.");
      }

      workerUserId = wRows[0].id;
      workerName = (wRows[0].full_name || "").trim() || "Support Worker";
    } else {
      // WORKER must NOT spoof workerUserId
      if (parsed.data.workerUserId) {
        return sendErr(res, req, 400, "Workers cannot set workerUserId.");
      }
    }


    // 2. Date sanity
    const shiftDate = parseYyyyMmDd(date);
    if (!shiftDate) {
      return sendErr(res, req, 400, "Invalid date format.");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    shiftDate.setHours(0, 0, 0, 0);

    if (shiftDate > today) {
      return sendErr(res, req, 400, "Date of support cannot be in the future.");
    }

    // 3. Time sanity
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);

    if (process.env.NODE_ENV === "development") {
      console.log("DEBUG times:", { startTime, endTime, startMins, endMins });
    }

    if (startMins === null || endMins === null) {
      return sendErr(res, req, 400, "Invalid start or end time format.");
    }

    if (endMins <= startMins) {
      return sendErr(res, req, 400, "End time must be after start time for the shift.");
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
      return sendErr(res, req, 400, "Some fields do not look like meaningful descriptions. Please rewrite: " + junkFields.join(", "));
    }

    const safeLocation = location.trim();
    const shiftTime = `${startTime}–${endTime}`;

    const activitiesLLM = deidentifyForLLM({ participantName, workerName, text: activitiesAndSupports });
    const presentationLLM = deidentifyForLLM({ participantName, workerName, text: participantPresentation });
    const goalsLLM = deidentifyForLLM({ participantName, workerName, text: goalsWorkedOn });
    const incidentsLLM = deidentifyForLLM({ participantName, workerName, text: incidentsOrRisks });
    const followUpLLM = deidentifyForLLM({ participantName, workerName, text: followUpActions });


    const rawCombinedRedacted =
      (activitiesLLM || "") +
      " " +
      (presentationLLM || "") +
      " " +
      (goalsLLM || "") +
      " " +
      (incidentsLLM || "") +
      " " +
      (followUpLLM || "");


    // Optional: do NOT send participantName/location to LLM at all (minimise PII)
    const participantLLM = "[participant]";
    const locationLLM = "[location]";


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
    Participant: ${participantLLM}
    Date of Support: ${clip(date, 20)}
    Shift Time: ${clip(shiftTime, 20)}
    Location: ${locationLLM}

    Raw input – Activities & Supports:
    ${clip(activitiesLLM, 2000)}

    Raw input – Participant Presentation:
    ${clip(presentationLLM, 2000)}

    Raw input – Goals Worked On:
    ${clip(goalsLLM, 2000)}

    Raw input – Incidents, Risks, Changes:
    ${clip(incidentsLLM, 2000)}

    Raw input – Follow-up / Next Steps:
    ${clip(followUpLLM, 2000)}
    `.trim();


    const { text: modelOut } = await chatLLMWithRetry({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 700,
    });

    let modelText = tidyModelText(modelOut);

    // ✅ If the model accidentally included headers, strip them
    modelText = stripNoteHeader(modelText);
    // Sometimes models repeat headers twice — strip again just in case
    modelText = stripNoteHeader(modelText);

    // ✅ If the model refused due to insufficient info, return that as-is
    if (modelText.startsWith("ERROR:")) {
      return sendErr(res, req, 400, modelText);
    }

    // ✅ Hard enforce opening phrase (only for real notes, not ERROR)
    if (!/^The support worker\b/i.test(modelText)) {
      modelText = `The support worker ${modelText.replace(/^\s*/, "")}`;
    }

    // ✅ If the model accidentally started with "The support worker," fix comma case again
    modelText = tidyModelText(modelText);

    // Optional: hard cap the body length (defense-in-depth)
    const MAX_BODY_CHARS = 9000;
    if (modelText.length > MAX_BODY_CHARS) {
      modelText = modelText.slice(0, MAX_BODY_CHARS).trim();
    }



    if (modelText.startsWith("ERROR:")) {
      return sendErr(res, req, 400, modelText);
    }

    const filteredBody = applyComplianceFilter(modelText, rawCombinedRedacted, workerName);

    // ✅ defense-in-depth: guarantee DB storage is body-only
    const storedBody = stripNoteHeader(String(filteredBody || "")).trim();


    // Optional: still build a display note for the immediate response (copy/paste convenience)
    const header = [
      `Support Worker: ${workerName}`,
      `Date of Support: ${date}`,
      `Shift Time: ${shiftTime}`,
      `Location: ${safeLocation}`,
      `Participant: ${participantName}`,
    ].join("\n");

    const fullNote = `${header}\n\n${storedBody}`;

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
        note_text,
        incident_flag,
        created_at,
        consent_acknowledged,
        consent_acknowledged_at,
        consent_acknowledged_by_user_id,
        current_version_no
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )
      RETURNING id
    `;


    
    const consentAckAt = new Date().toISOString();

    const { rows } = await query(insertSql, [
      req.user.organisationId,
      workerUserId,                 // ✅ attributed worker
      participantName,
      workerName,                   // ✅ name snapshot of that worker
      date,
      startTime,
      endTime,
      safeLocation,
      storedBody,
      incidentFlag === true,
      createdAt,
      consentAcknowledged,
      consentAckAt,
      req.user.id,                  // ✅ actor who acknowledged (admin/worker)
      1,
    ]);


    const newId = rows[0].id;

    // ✅ write version 1 snapshot (body-only)
    await query(
      `
      INSERT INTO progress_note_versions
        (note_id, version_no, text, edited_at, edited_by_user_id, edited_by_name)
      VALUES ($1, 1, $2, $3, $4, $5)
      `,
      [newId, storedBody, createdAt, req.user.id, (req.user.fullName || workerName)]
    );


    await audit(req, "NOTE_CONSENT_ACK", {
      targetType: "progress_note",
      targetId: String(newId),
      meta: { date, consentAckAt, consentByUserId: req.user.id },
    });


    await audit(req, "NOTE_GENERATED", {
      targetType: "progress_note",
      targetId: String(newId),
      meta: { date, incidentFlag: incidentFlag === true },
    });


    return res.json({ note: fullNote, id: newId });
  } catch (error) {
    console.error(`[${req.id}] Error generating note:`, error);
    return sendErr(res, req, 500, "Failed to generate note");
  }
});

// GET /api/notes/:id/pdf  (download note as PDF, org-scoped)
router.get("/notes/:id/pdf", notesPdfIpLimiter, notesPdfUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const includeDeleted = req.query.includeDeleted === "true" && req.user.role === "ADMIN";

    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid note id");
    }

    // Keep your existing rule
    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot access notes API");
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

    if (!includeDeleted) {
      sql += " AND pn.deleted_at IS NULL";
    }

    sql += ` LIMIT 1`;

    const { rows } = await query(sql, params);
    const row = rows[0];
    if (!row) {
      return sendErr(res, req, 404, "Note not found");
    }
    
    await audit(req, "NOTE_PDF_DOWNLOADED", {
      targetType: "progress_note",
      targetId: String(row.id),
    });

    const fileDate = ymdOnly(row.date);
res.setHeader("Content-Type", "application/pdf");
res.setHeader(
  "Content-Disposition",
  `attachment; filename="NDIS_Note_${row.id}_${fileDate}.pdf"`
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

    doc.on("error", (e) => {
      console.error(`[${req.id}] PDF stream error:`, e);
      try { res.destroy(e); } catch {}
    });
    res.on("close", () => {
      try { doc.end(); } catch {}
    });


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
    console.error(`[${req.id}] Error generating PDF:`);
    if (!res.headersSent) {
      return sendErr(res, req, 500, "Failed to generate PDF");
    }
    try { res.destroy(err); } catch {}
  }
});

// POST /api/notes/:id/archive
// Body: { archivedFlag: boolean }
router.post("/notes/:id/archive", notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return sendErr(res, req, 400, "Invalid note id");
    }

    if (req.user.role === "OWNER") {
      return sendErr(res, req, 403, "Owners cannot access notes API");
    }

    // ✅ Admin-only archive rule
    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can archive notes");
    }

    const parsedBody = archiveBodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return sendErr(res, req, 400, "Invalid body");
    }

    const { archivedFlag } = parsedBody.data;
    const archivedBy = (req.user.fullName || "").trim();
    const nowIso = new Date().toISOString();

    // Must exist in org (ADMIN scoped)
    const { rows: exists } = await query(
      `
      SELECT id
      FROM progress_notes
      WHERE id = $1
        AND organisation_id = $2
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id, req.user.organisationId]
    );

    if (!exists[0]) return sendErr(res, req, 404, "Note not found");

    const { rows } = await query(
      `
      UPDATE progress_notes
      SET archived_flag = $1,
          archived_at   = $2,
          archived_by   = $3,
          updated_at    = now()
      WHERE id = $4
        AND organisation_id = $5
        AND deleted_at IS NULL
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

    await audit(req, archivedFlag ? "NOTE_ARCHIVED" : "NOTE_UNARCHIVED", {
      targetType: "progress_note",
      targetId: String(id),
    });

    return res.json({
      ok: true,
      archivedFlag: rows[0].archived_flag,
      archivedAt: rows[0].archived_at,
      archivedBy: rows[0].archived_by,
    });
  } catch (err) {
    console.error(`[${req.id}] Error archiving note:`, err);
    return sendErr(res, req, 500, "Failed to update archive state");
  }
});


// POST /api/notes/:id/delete  (ADMIN only)
router.post("/notes/:id/delete", notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return sendErr(res, req, 400, "Invalid note id");

    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can delete notes");
    }

    const parsedBody = deleteBodySchema.safeParse(req.body || {});
    if (!parsedBody.success) return sendErr(res, req, 400, "Invalid body");

    const reason = parsedBody.data.reason || null;
    const deletedBy = (req.user.fullName || "").trim() || "Admin";
    const nowIso = new Date().toISOString();

    const { rows } = await query(
      `
      UPDATE progress_notes
      SET deleted_at = $1,
          deleted_by = $2,
          deleted_by_user_id = $3,
          deleted_reason = $4,
          updated_at = now()
      WHERE id = $5
        AND organisation_id = $6
        AND deleted_at IS NULL
      RETURNING deleted_at, deleted_by, deleted_reason
      `,
      [nowIso, deletedBy, req.user.id, reason, id, req.user.organisationId]
    );

    if (!rows[0]) return sendErr(res, req, 404, "Note not found (or already deleted)");

    await audit(req, "NOTE_DELETED", {
      targetType: "progress_note",
      targetId: String(id),
      meta: { reason: reason || undefined },
    });

    return res.json({
      ok: true,
      deletedAt: rows[0].deleted_at,
      deletedBy: rows[0].deleted_by,
      deletedReason: rows[0].deleted_reason,
    });
  } catch (err) {
    console.error(`[${req.id}] Error deleting note:`, err);
    return sendErr(res, req, 500, "Failed to delete note");
  }
});

// POST /api/notes/:id/restore  (ADMIN only)
router.post("/notes/:id/restore", notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return sendErr(res, req, 400, "Invalid note id");

    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can restore notes");
    }

    const { rows } = await query(
      `
      UPDATE progress_notes
      SET deleted_at = NULL,
          deleted_by = NULL,
          deleted_by_user_id = NULL,
          deleted_reason = NULL,
          updated_at = now()
      WHERE id = $1
        AND organisation_id = $2
        AND deleted_at IS NOT NULL
        AND purged_at IS NULL
      RETURNING id
      `,
      [id, req.user.organisationId]
    );

    if (!rows[0]) return sendErr(res, req, 404, "Note not found (or not deleted)");

    await audit(req, "NOTE_RESTORED", {
      targetType: "progress_note",
      targetId: String(id),
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(`[${req.id}] Error restoring note:`, err);
    return sendErr(res, req, 500, "Failed to restore note");
  }
});

// POST /api/notes/:id/legal-hold  (ADMIN only)
router.post("/notes/:id/legal-hold", notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return sendErr(res, req, 400, "Invalid note id");

    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can set legal hold");
    }

    const parsedBody = legalHoldBodySchema.safeParse(req.body || {});
    if (!parsedBody.success) return sendErr(res, req, 400, "Invalid body");

    const { legalHold } = parsedBody.data;
    const nowIso = new Date().toISOString();
    const byName = (req.user.fullName || "").trim() || "Admin";

    const { rows } = await query(
      `
      UPDATE progress_notes
      SET legal_hold = $1,
          legal_hold_set_at = CASE WHEN $1 THEN $2 ELSE NULL END,
          legal_hold_set_by = CASE WHEN $1 THEN $3 ELSE NULL END,
          legal_hold_set_by_user_id = CASE WHEN $1 THEN $4 ELSE NULL END,
          updated_at = now()
      WHERE id = $5
        AND organisation_id = $6
        AND purged_at IS NULL
      RETURNING legal_hold, legal_hold_set_at, legal_hold_set_by
      `,
      [legalHold, nowIso, byName, req.user.id, id, req.user.organisationId]
    );


    if (!rows[0]) return sendErr(res, req, 404, "Note not found");

    await audit(req, legalHold ? "NOTE_LEGAL_HOLD_SET" : "NOTE_LEGAL_HOLD_CLEARED", {
      targetType: "progress_note",
      targetId: String(id),
    });

    return res.json({
      ok: true,
      legalHold: rows[0].legal_hold,
      legalHoldSetAt: rows[0].legal_hold_set_at,
      legalHoldSetBy: rows[0].legal_hold_set_by,
    });
  } catch (err) {
    console.error(`[${req.id}] Error setting legal hold:`, err);
    return sendErr(res, req, 500, "Failed to set legal hold");
  }
});

// POST /api/notes/:id/metadata  (ADMIN only)
// Allows correction of participantName/date/times/location/incidentFlag (audited)
router.post("/notes/:id/metadata", notesWriteIpLimiter, notesWriteUserLimiter, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return sendErr(res, req, 400, "Invalid note id");

    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can update note metadata");
    }

    const parsedBody = metadataBodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      const msg = parsedBody.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid body");
    }

    const patch = parsedBody.data;

    // Require at least one field
    const keys = ["participantName", "date", "startTime", "endTime", "location", "incidentFlag"];
    const hasAny = keys.some((k) => patch[k] !== undefined);
    if (!hasAny) return sendErr(res, req, 400, "No changes provided");

    // Load existing
    const { rows: existingRows } = await query(
      `
      SELECT *
      FROM progress_notes
      WHERE id = $1
        AND organisation_id = $2
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id, req.user.organisationId]
    );
    const existing = existingRows[0];
    if (!existing) return sendErr(res, req, 404, "Note not found");

    const before = {
      participantName: existing.participant_name,
      date: existing.date,
      startTime: existing.start_time,
      endTime: existing.end_time,
      location: existing.location,
      incidentFlag: existing.incident_flag,
    };

    // Compose new values (use existing when not provided)
    const after = {
      participantName: patch.participantName ?? before.participantName,
      date: patch.date ?? before.date,
      startTime: patch.startTime ?? before.startTime,
      endTime: patch.endTime ?? before.endTime,
      location: patch.location ?? before.location,
      incidentFlag: patch.incidentFlag ?? before.incidentFlag,
    };

    // Date sanity: not future
    if (patch.date !== undefined) {
      const d = parseYyyyMmDd(after.date);
      if (!d) return sendErr(res, req, 400, "Invalid date format");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      if (d > today) return sendErr(res, req, 400, "Date of support cannot be in the future.");
    }

    // Time sanity if touched
    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const s = timeToMinutes(after.startTime);
      const e = timeToMinutes(after.endTime);
      if (s === null || e === null) return sendErr(res, req, 400, "Invalid start or end time format.");
      if (e <= s) return sendErr(res, req, 400, "End time must be after start time.");
    }

    // Build update (fixed set list so RETURNING gives us full row)
    const { rows } = await query(
      `
      UPDATE progress_notes
      SET participant_name = $1,
          date            = $2,
          start_time      = $3,
          end_time        = $4,
          location        = $5,
          incident_flag   = $6,
          updated_at      = now()
      WHERE id = $7
        AND organisation_id = $8
        AND deleted_at IS NULL
      RETURNING *
      `,
      [
        after.participantName,
        after.date,
        after.startTime,
        after.endTime,
        after.location,
        after.incidentFlag === true,
        id,
        req.user.organisationId,
      ]
    );

    const updated = rows[0];
    if (!updated) return sendErr(res, req, 404, "Note not found");

    const changes = diffChanges(before, patch, keys);
    await audit(req, "NOTE_METADATA_UPDATED", {
      targetType: "progress_note",
      targetId: String(id),
      meta: { changes },
    });

    return res.json({ ok: true, note: normaliseNoteRow(updated) });
  } catch (err) {
    console.error(`[${req.id}] Error updating note metadata:`, err);
    return sendErr(res, req, 500, "Failed to update note metadata");
  }
});

function csvEscape(v) {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

router.post("/notes/export", notesReadIpLimiter, notesReadUserLimiter, async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return sendErr(res, req, 403, "Only admins can export notes");
    }

    const parsed = exportBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return sendErr(res, req, 400, msg || "Invalid export body");
    }

    const { participant, dateFrom, dateTo, includeArchived, includeDeleted, format } = parsed.data;

    // Validate range sanity
    const df = parseYyyyMmDd(dateFrom);
    const dt = parseYyyyMmDd(dateTo);
    if (!df || !dt) return sendErr(res, req, 400, "Invalid dateFrom/dateTo");
    if (dt < df) return sendErr(res, req, 400, "dateTo must be after dateFrom");

    const canIncludeDeleted = includeDeleted === true; // ADMIN only already

    let sql = `
      SELECT
        id,
        participant_name AS "participantName",
        worker_name AS "workerName",
        date,
        start_time AS "startTime",
        end_time AS "endTime",
        location,
        incident_flag AS "incidentFlag",
        reviewed_flag AS "reviewedFlag",
        reviewed_at AS "reviewedAt",
        reviewed_by AS "reviewedBy",
        finalised_at AS "finalisedAt",
        finalised_by AS "finalisedBy",
        archived_flag AS "archivedFlag",
        archived_at AS "archivedAt",
        archived_by AS "archivedBy",
        deleted_at AS "deletedAt",
        deleted_by AS "deletedBy",
        deleted_reason AS "deletedReason",
        created_at AS "createdAt",
        purged_at AS "purgedAt",
        COALESCE(NULLIF(final_note_text,''), note_text) AS "noteBody"
      FROM progress_notes
      WHERE organisation_id = $1
        AND (date::date) BETWEEN $2::date AND $3::date
    `;
    const params = [req.user.organisationId, dateFrom, dateTo];
    let idx = 4;

    if (participant && participant.trim()) {
      sql += ` AND participant_name ILIKE $${idx++}`;
      params.push(`%${participant.trim()}%`);
    }

    if (!includeArchived) {
      sql += ` AND archived_flag = FALSE`;
    }

    if (!canIncludeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }

    sql += ` ORDER BY date DESC, created_at DESC, id DESC LIMIT 5000`;

    const { rows } = await query(sql, params);

    await audit(req, "NOTES_EXPORTED", {
      targetType: "progress_note",
      targetId: null,
      meta: {
        filters: { participant: participant || null, dateFrom, dateTo, includeArchived, includeDeleted: canIncludeDeleted },
        count: rows.length,
        format,
      },
    });

    if (format === "json") {
      return res.json({ ok: true, count: rows.length, notes: rows.map((r) => ({ ...r, noteBody: stripNoteHeader(r.noteBody) })) });
    }

    // CSV
    const cols = [
      "id","participantName","workerName","date","startTime","endTime","location",
      "incidentFlag",
      "reviewedFlag","reviewedAt","reviewedBy",
      "finalisedAt","finalisedBy",
      "archivedFlag","archivedAt","archivedBy",
      "deletedAt","deletedBy","deletedReason",
      "createdAt",
      "noteBody",
      "purgedAt",
    ];

    const csvRows = rows.map((r) => ({
      ...r,
      noteBody: stripNoteHeader(r.noteBody || ""),
    }));

    const csv = toCsv(csvRows, cols);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ndis_notes_export_${dateFrom}_to_${dateTo}.csv"`);

    return res.send(csv);
  } catch (err) {
    console.error(`[${req.id}] Error exporting notes:`, err);
    return sendErr(res, req, 500, "Failed to export notes");
  }
});


module.exports = router;
