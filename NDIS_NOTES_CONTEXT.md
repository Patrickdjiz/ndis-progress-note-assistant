# NDIS Notes — FILE MAP + ARCHITECTURE CONTEXT (Upload to GPT Knowledge)

Version: 1.0  
Purpose: Give the GPT a high-signal overview of the product, architecture, data lifecycle, security constraints, and file inventory **without any secrets**.

---

## 1) Product Summary (What this app does)

**NDIS Notes** is an Australian SaaS that helps **NDIS support workers** generate end-of-shift **shift/progress notes** using AI, while enabling **provider admins** to review, manage, and retain those notes in a privacy-first way.

**Core business rule:**  
- Providers/admins can **archive** notes, but **cannot delete** them manually.
- Notes may only be removed through a controlled **retention purge** workflow (soft-delete → tombstone/purge), and must respect **legal hold**.

---

## 2) Roles & Permissions Model

### Roles
- **OWNER**: Platform owner. Can manage provider organisations and high-level platform controls.
- **ADMIN**: Provider admin. Can see org-wide notes, manage workers, set retention policy (within rules), review/finalise/archive notes, export (if allowed).
- **WORKER**: Support worker. Can generate notes and view their own notes.

### Non-negotiable security expectations
- Enforce org tenancy boundaries (organisation_id scoping) everywhere.
- Role gating must be consistent and verified server-side (frontend gating is not enough).
- All sensitive actions must emit audit events.
- Archived notes remain retrievable (read-only), unless retention purge rules apply.

---

## 3) Hosting & Vendor Architecture (High level)

### Hosting / Data flow
- Frontend: React + Vite
- Backend: Node + Express
- Database: Postgres (Fly Postgres)
- Edge/DNS/WAF/TLS: Cloudflare
- LLM inference: RunPod serverless (AU worker), served via Ollama
- Email for password resets: Postmark
- Model source: Hugging Face (model/weights selection / references)

### Data locality intent
- Primary goal is AU-region hosting (Fly Sydney + RunPod AU worker).
- Cloudflare is global edge; treat this as a vendor that may process metadata and cached assets depending on configuration.

---

## 4) Data Classification & Privacy Posture

### Data types handled
- **Shift/progress notes** may include sensitive details: participant support needs, routines, incidents, health/disability-related information (treat as sensitive by default).
- **Account data**: emails, names, roles, org membership, activity status flags.
- **Audit data**: who did what, when, from where (IP/UA), requestId, action metadata.

### Privacy-by-design principles applied
- Data minimisation: only collect/store what’s necessary to deliver the service.
- Least privilege: DB roles and API role checks.
- Strong auditability: append-only audit logging.
- Safe AI boundary: redact PII before sending to LLM; constrain prompts/output; human review before saving final notes.

---

## 5) Note Lifecycle & State Model

### Typical lifecycle
1. **Draft generation (AI-assisted)**
   - Worker/admin enters structured shift details.
   - Consent/authorisation acknowledgement occurs in UI (and should be audited).
   - Input is sanitised and PII-redacted before LLM call.
   - LLM returns a draft note.

2. **Human review & editing**
   - User edits draft in UI before saving.
   - System stores the final version (not raw prompt history unless required).

3. **Finalise / Review (if used)**
   - Admin may mark as reviewed/finalised depending on workflow.

4. **Archive (provider rule)**
   - Notes can be archived, but not deleted manually.
   - Archived notes should be read-only (or strictly limited edits with audit if edits are allowed).

5. **Retention purge**
   - Retention job soft-deletes then purges/tombstones after grace period.
   - **Legal hold must override** and block purge/tombstone.

### Suggested state flags (conceptual)
- status: DRAFT | FINAL | REVIEWED | ARCHIVED | SOFT_DELETED | TOMBSTONED
- legal_hold: boolean
- archived_at, finalised_at, reviewed_at, deleted_at, tombstoned_at
- organisation_id is mandatory on tenant data (except some system-level events)

---

## 6) Audit Logging Model (Critical)

### Core requirements
- Audit events must be **append-only** at the DB level.
- Sensitive actions should emit audit events:
  - LOGIN_SUCCESS / LOGIN_FAILED / LOGIN_BLOCKED
  - PASSWORD_RESET_REQUESTED / PASSWORD_RESET_SENT / PASSWORD_RESET_COMPLETED / PASSWORD_RESET_BLOCKED
  - NOTE_GENERATION_REQUESTED / NOTE_GENERATION_BLOCKED / NOTE_GENERATION_SUCCEEDED
  - NOTE_CREATED / NOTE_UPDATED / NOTE_FINALISED / NOTE_REVIEWED / NOTE_ARCHIVED
  - NOTE_EXPORTED / NOTE_PDF_DOWNLOADED
  - RETENTION_SOFT_DELETE / RETENTION_PURGE / RETENTION_BLOCKED_LEGAL_HOLD
  - ORG_SETTINGS_UPDATED
  - USER_CREATED / USER_ACTIVATED / USER_DEACTIVATED
  - ORG_SUSPENDED / ORG_ACTIVATED

### Safety rules
- Do **not** log raw note content into audit events.
- Do **not** log secrets or tokens.
- Keep audit metadata small and safe (truncate fields, hash sensitive keys where needed).

### Known implemented posture (from prior work)
- `audit_events` is protected by:
  - DB triggers blocking UPDATE/DELETE/TRUNCATE (append-only enforcement)
  - Privileges restricted to SELECT/INSERT for the app role
  - Optional RLS enabled to force policies even for privileged roles

---

## 7) AI Boundary Rules (LLM / RunPod / Ollama)

### Pre-LLM
- Redact or avoid sending direct identifiers:
  - participant name, address, phone, email, Medicare/NDIS numbers, exact DOB, etc.
- Prefer structured fields and a safe template:
  - shift date/time, support type, activities, outcomes, risks/incidents (generalised), next steps
- Drop unnecessary free-text that could leak identifiers.

### LLM call constraints
- Timeouts + retries must be bounded.
- Avoid storing prompts/responses unless explicitly needed.
- If storing model outputs, store only final reviewed notes.

### Post-LLM
- Apply compliance filtering on generated text to:
  - remove disallowed phrasing,
  - catch accidental PII,
  - enforce clinical/neutral style constraints.
- Require human approval before saving as final.

---

## 8) Retention & Legal Hold

### Retention model intent
- Admins/providers configure retention settings (e.g., retentionDays, graceDays, autoPurgeEnabled).
- Retention job performs:
  1) soft-delete records eligible for deletion
  2) after grace period, purge/tombstone (minimal stub retained if needed)

### Legal hold
- If legal_hold = true:
  - block soft-delete and purge/tombstone
  - log RETENTION_BLOCKED_LEGAL_HOLD audit event

---

## 9) File Map (Inventory)

This repo is a full-stack app: React/Vite frontend + Node/Express backend + Postgres schema.

### Frontend (React + Vite)
- /src/lib
  - api.js: backend fetch wrapper (base URL, headers, JSON parsing, error handling)
  - dateFormat.js: display helpers
  - sessionStore.js: token/user persistence
  - useIsMobile.js: responsive hook
  - download.js: export/PDF download helper
  - jwt.js: client-side JWT decode for UI gating (UI-only)
- /src/pages
  - GenerateNotePage.jsx: note generator UI; consent tick; (admin) worker selector; calls generate endpoint; edit + save
  - NotesDashboardPage.jsx: admin dashboard; list/search/filter; note details; archive/review/finalise; export/download
  - MyNotesPage.jsx: worker-only view; own notes; read-only; PDF download
  - AccountPage.jsx:
