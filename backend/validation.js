// validation.js
const { z } = require("zod");

// Reusable pieces
const emailSchema = z
  .string()
  .min(3)
  .max(255)
  .email("Invalid email address");

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200);

const nonEmptyString = (fieldName, max = 1000) =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} is required`)
    .max(max, `${fieldName} is too long`);

const dateYyyyMmDd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

const timeHhMm = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format");

// ---- Schemas ----

// /login
const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// /generate-note
const generateNoteSchema = z.object({
  participantName: nonEmptyString("participantName", 200),
  date: dateYyyyMmDd,
  startTime: timeHhMm,
  endTime: timeHhMm,
  location: nonEmptyString("location", 200),
  activitiesAndSupports: nonEmptyString("activitiesAndSupports", 4000),
  participantPresentation: nonEmptyString("participantPresentation", 4000),
  goalsWorkedOn: nonEmptyString("goalsWorkedOn", 4000),
  incidentsOrRisks: nonEmptyString("incidentsOrRisks", 4000),
  followUpActions: nonEmptyString("followUpActions", 4000),
  incidentOccurred: z.boolean(),
});

// POST /api/users
const createWorkerSchema = z.object({
  email: emailSchema,
  fullName: nonEmptyString("fullName", 200),
  password: passwordSchema,
});

// POST /api/owner/providers
const createProviderSchema = z.object({
  organisationName: nonEmptyString("organisationName", 200),
  adminEmail: emailSchema,
  adminFullName: nonEmptyString("adminFullName", 200),
  adminPassword: passwordSchema,
});

// PATCH status flags
const booleanFlagSchema = z.object({
  isActive: z.boolean(),
});

const orgStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

// Minimal query validation for /api/notes
const notesQuerySchema = z.object({
  participant: z.string().optional(),
  hasIncident: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false", "all"]).optional(),
  limit: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(200)
  ).optional(),
  cursor: z.string().optional(),
});


const updateProfileSchema = z.object({
  fullName: nonEmptyString("fullName", 200).optional(),
  email: emailSchema.optional(),
});

const updatePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(20, "Invalid reset token"),
  newPassword: passwordSchema,
});

// Add near your other helpers
const boolish = z.preprocess((v) => {
  if (v === undefined) return undefined;
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return v;
}, z.boolean());

// NEW: POST body schema for /api/notes/search
const notesSearchSchema = z.object({
  participant: z.string().trim().max(200).optional(),
  hasIncident: boolish.optional(),
  archived: z.union([z.boolean(), z.literal("all")]).optional(),
  limit: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(200)
  ).optional(),
  cursor: z.string().optional(),
});

// NEW: GET query schema for /api/notes (no participant)
const notesListQuerySchema = z.object({
  hasIncident: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false", "all"]).optional(),
  limit: z.preprocess(
    (v) => (v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(200)
  ).optional(),
  cursor: z.string().optional(),
});



module.exports = {
  loginSchema,
  generateNoteSchema,
  createWorkerSchema,
  createProviderSchema,
  booleanFlagSchema,
  orgStatusSchema,
  notesQuerySchema,
  updateProfileSchema,
  updatePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  notesListQuerySchema,  
  notesSearchSchema, 
};
