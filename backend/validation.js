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
  .min(8, "Password must be at least 8 characters")
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
  workerName: nonEmptyString("workerName", 200),
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
  participant: z.string().trim().max(255).optional(),
  hasIncident: z.enum(["true", "false", "all"]).optional(),
  archived: z.enum(["all", "true", "false"]).optional(),
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
};
