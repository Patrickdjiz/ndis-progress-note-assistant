// db.js
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

// open or create local DB file
const db = new Database("notes.db");

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

// --- Seed one demo org + admin (dev only) ---
function seedDemoOrgAndAdmin() {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM organisations`).get();
  if (row.c > 0) return;

  const nowIso = new Date().toISOString();

  const orgStmt = db.prepare(`
    INSERT INTO organisations (name, status, createdAt)
    VALUES (?, 'ACTIVE', ?)
  `);
  const orgInfo = orgStmt.run("Demo Provider", nowIso);
  const orgId = orgInfo.lastInsertRowid;

  const hash = bcrypt.hashSync("demo1234", 10);
  const userStmt = db.prepare(`
    INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
    VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)
  `);
  userStmt.run(orgId, "admin@demo.local", hash, "Demo Admin", nowIso);

  console.log("Seeded demo org + admin:");
  console.log("  Email:    admin@demo.local");
  console.log("  Password: demo1234");

  // Also seed a platform OWNER if none exists yet
  const ownerRow = db
    .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'OWNER'`)
    .get();
  if (ownerRow.c === 0) {
    const ownerHash = bcrypt.hashSync("owner1234", 10);
    db.prepare(`
      INSERT INTO users (organisationId, email, passwordHash, role, fullName, isActive, createdAt)
      VALUES (?, ?, ?, 'OWNER', ?, 1, ?)
    `).run(
      orgId,                      // or make a separate org if you want
      "owner@demo.local",
      ownerHash,
      "Platform Owner",
      nowIso
    );

    console.log("Seeded platform OWNER:");
    console.log("  Email:    owner@demo.local");
    console.log("  Password: owner1234");
    }   
}

seedDemoOrgAndAdmin();

module.exports = db;
