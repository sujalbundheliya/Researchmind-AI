-- 004_m4_features.sql
-- Schema for the M4 feature batch: contact inbox, admin audit trail, review
-- evidence anchors (PDF highlighting), URL-sourced uploads, and user profile
-- fields. All additive and idempotent — safe to re-run.

-- ── Contact form ──────────────────────────────────────────────────
-- Messages from the public /contact page. The DB row is the source of truth:
-- email delivery is best-effort on top, so a submission is never lost when
-- SMTP is unconfigured or failing. user_id is nullable (logged-out senders)
-- and ON DELETE SET NULL so deleting an account keeps their message history.
CREATE TABLE IF NOT EXISTS contact_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',
  email_sent  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at  TIMESTAMPTZ,
  handled_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_status_check') THEN
    ALTER TABLE contact_messages ADD CONSTRAINT contact_messages_status_check
      CHECK (status IN ('new', 'read', 'replied', 'archived'));
  END IF;
END$$;

-- Inbox default view: unhandled first, newest first.
CREATE INDEX IF NOT EXISTS contact_messages_status_created_idx
  ON contact_messages (status, created_at DESC);

-- ── Admin audit trail ─────────────────────────────────────────────
-- Records every mutating super-admin action so plan/role changes and deletions
-- are attributable. actor_id is SET NULL (not CASCADE) so removing an admin
-- never erases the record of what they did.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log (created_at DESC);

-- ── Review evidence (PDF highlighting) ────────────────────────────
-- Verbatim quotes the screening decision rests on, verified against the source
-- chunk text before storage: [{ quote, page, chunk_id }]. The PDF viewer uses
-- these to jump to the right page and highlight the supporting text.
-- Rows screened before this migration stay NULL and fall back to parsing
-- sentences out of ai_reason.
ALTER TABLE review_screenings
  ADD COLUMN IF NOT EXISTS evidence JSONB;

-- ── URL-sourced uploads ───────────────────────────────────────────
-- Origin URL for documents fetched by link rather than uploaded from disk.
-- NULL for file uploads.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS source_url TEXT;

-- ── User profile ──────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS institution TEXT,
  ADD COLUMN IF NOT EXISTS bio         TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ;
