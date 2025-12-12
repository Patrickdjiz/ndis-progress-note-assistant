// db.js
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const { NODE_ENV } = require("./config/env"); // ⬅ NEW

// Decide which DB file to use (or use env override)
const dbFileFromEnv = process.env.SQLITE_DB_FILE;
let dbFile = dbFileFromEnv || "notes.dev.db";

if (NODE_ENV === "test") {
  dbFile = dbFileFromEnv || "notes.test.db";
}
if (NODE_ENV === "production") {
  dbFile = dbFileFromEnv || "notes.prod.db";
}

console.log(`[db] Using SQLite file: ${dbFile} (env: ${NODE_ENV})`);

// open or create local DB file
const db = new Database(dbFile);

// enable foreign keys
db.pragma("foreign_keys = ON");

// --- Organisations (providers) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS organisations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    createdAt TEXT NOT NULL
  );
`);

// --- Users (admins + workers) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisationId INTEGER NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','WORKER')),
    fullName TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (organisationId) REFERENCES organisations(id)
  );
`);

// --- Progress notes (multi-tenant) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS progress_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organisationId INTEGER NOT NULL,
    workerUserId INTEGER NOT NULL,

    participantName TEXT NOT NULL,
    workerName TEXT NOT NULL,
    date TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    location TEXT NOT NULL,
    activitiesAndSupports TEXT NOT NULL,
    participantPresentation TEXT NOT NULL,
    goalsWorkedOn TEXT NOT NULL,
    incidentsOrRisks TEXT NOT NULL,
    followUpActions TEXT NOT NULL,
    noteText TEXT NOT NULL,
    incidentFlag INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,

    -- final note fields
    finalNoteText TEXT,
    finalisedAt TEXT,
    finalisedBy TEXT,

    -- provider review fields
    reviewedFlag INTEGER NOT NULL DEFAULT 0,
    reviewedAt TEXT,
    reviewedBy TEXT,

    FOREIGN KEY (organisationId) REFERENCES organisations(id),
    FOREIGN KEY (workerUserId) REFERENCES users(id)
  );
`);

// --- Seed one platform owner + demo provider (dev only) ---
function seedDemoOrgAndAdmin() {
  const orgCount = db.prepare(`SELECT COUNT(*) AS c FROM organisations`).get();
  if (orgCount.c > 0) return;

  const nowIso = new Date().toISOString();

  // 1) Platform org for OWNER
  const platformOrgStmt = db.prepare(`
    INSERT INTO organisations (name, status, createdAt)
    VALUES (?, 'ACTIVE', ?)
  `);
  const platformOrgInfo = platformOrgStmt.run("Platform Root Org", nowIso);
  const platformOrgId = platformOrgInfo.lastInsertRowid;

  // 2) OWNER user in platform org
  const ownerHash = bcrypt.hashSync("owner1234", 10);
  db.prepare(`
    INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
    VALUES (?, ?, ?, 'OWNER', ?, 1, ?)
  `).run(
    platformOrgId,
    "owner@demo.local",
    ownerHash,
    "Platform Owner",
    nowIso
  );

  console.log("Seeded platform OWNER:");
  console.log("  Email:    owner@demo.local");
  console.log("  Password: owner1234");

  // 3) Separate demo provider org for the demo ADMIN
  const demoOrgStmt = db.prepare(`
    INSERT INTO organisations (name, status, createdAt)
    VALUES (?, 'ACTIVE', ?)
  `);
  const demoOrgInfo = demoOrgStmt.run("Demo Provider", nowIso);
  const demoOrgId = demoOrgInfo.lastInsertRowid;

  const adminHash = bcrypt.hashSync("demo1234", 10);
  db.prepare(`
    INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
    VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)
  `).run(
    demoOrgId,
    "admin@demo.local",
    adminHash,
    "Demo Admin",
    nowIso
  );

  console.log("Seeded demo org + admin:");
  console.log("  Email:    admin@demo.local");
  console.log("  Password: demo1234");
}

// ⬅️ IMPORTANT CHANGE: only seed in NON-production
if (NODE_ENV !== "production") {
  seedDemoOrgAndAdmin();
} else {
  console.log(
    "[db] Production mode – demo OWNER / ADMIN are NOT auto-seeded. " +
      "Create real organisations via the owner console."
  );
}

module.exports = db;
