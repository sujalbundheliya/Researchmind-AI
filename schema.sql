-- ResearchMind AI — Milestone-4 consolidated Postgres schema
--
-- This is a from-scratch bootstrap file for a fresh database (e.g. a new Neon
-- project). It is NOT what runs in an already-provisioned environment: there
-- the base tables were created directly against Neon, and only incremental
-- changes since M3 are tracked in migrations/001-004 (run via
-- `BE/scripts/migrate.js`, bookkept in `_migrations`). This file consolidates
-- both the untracked base schema and all four migrations into one script,
-- reconstructed from ARCHITECTURE_SCHEMA_DEPLOYMENT.md's live introspection
-- (information_schema + pg_indexes against Neon, 2026-07-27) plus the SQL in
-- migrations/*.sql and AI/app/services/profiler.py.
--
-- Engine: Postgres with the pgvector extension. Safe to re-run (IF NOT EXISTS
-- throughout). After running this against a fresh database, mark all four
-- migrations as already applied so `npm run migrate` in BE/ doesn't try to
-- re-run the ALTERs this file already bakes in:
--
--   INSERT INTO _migrations (name) VALUES
--     ('001_screening_audit_trail.sql'),
--     ('002_plans_roles_billing.sql'),
--     ('003_draft_validation.sql'),
--     ('004_m4_features.sql')
--   ON CONFLICT DO NOTHING;

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Migration bookkeeping ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _migrations (
  name        TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT NOT NULL UNIQUE,
  password                 TEXT,                          -- NULL for Google-only accounts
  name                     TEXT NOT NULL,
  storage_used_bytes       BIGINT NOT NULL DEFAULT 0,
  storage_limit_bytes      BIGINT NOT NULL DEFAULT 524288000,   -- 500 MB
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  google_id                VARCHAR(255) UNIQUE,
  -- plans/roles/billing (migration 002)
  role                     TEXT NOT NULL DEFAULT 'user',
  plan                     TEXT NOT NULL DEFAULT 'free',
  plan_status              TEXT,
  stripe_customer_id       TEXT UNIQUE,
  stripe_subscription_id   TEXT,
  plan_renews_at           TIMESTAMPTZ,
  lifetime_uploads         INTEGER NOT NULL DEFAULT 0,     -- monotonic, never refunded
  extractions_used         INTEGER NOT NULL DEFAULT 0,
  reviews_used             INTEGER NOT NULL DEFAULT 0,
  drafts_used              INTEGER NOT NULL DEFAULT 0,
  -- profile (migration 004)
  avatar_url               TEXT,
  institution              TEXT,
  bio                      TEXT,
  updated_at               TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin', 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_plan_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_plan_check
      CHECK (plan IN ('free', 'individual', 'pro'));
  END IF;
END$$;

-- ── Workspaces ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_used_bytes    BIGINT NOT NULL DEFAULT 0,
  storage_limit_bytes   BIGINT NOT NULL DEFAULT 2147483648,  -- 2 GB
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'viewer',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user       ON workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace  ON workspace_members (workspace_id);

-- NOTE: the invitation table is named `workspace_invites`, not
-- `workspace_invitations` — confirmed by live introspection.
CREATE TABLE IF NOT EXISTS workspace_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_email  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'editor',
  token          TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Documents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,       -- the uploader
  workspace_id      UUID REFERENCES workspaces(id) ON DELETE CASCADE,          -- NULL = personal
  filename          TEXT NOT NULL,          -- sanitized name on disk
  original_name     TEXT NOT NULL,          -- as the user sees it
  file_size_bytes   BIGINT NOT NULL,
  file_path         TEXT NOT NULL,          -- path inside the uploads volume
  status            TEXT NOT NULL DEFAULT 'processing',  -- processing / ready / failed
  page_count        INTEGER,                -- set by the AI service after ingest
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url        TEXT                    -- migration 004: origin URL for link-fetched uploads
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id       ON documents (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_id  ON documents (workspace_id);

-- ── Chunks — the vector store ───────────────────────────────────────────
-- user_id / workspace_id are intentionally denormalized (no FK): the AI
-- service filters on (document_id, user_id) without a join. Cleanup happens
-- transitively via chunks.document_id -> documents.user_id.
CREATE TABLE IF NOT EXISTS chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  workspace_id  UUID,
  chunk_index   INTEGER NOT NULL,
  page_number   INTEGER,
  content       TEXT NOT NULL,
  embedding     VECTOR(768),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id   ON chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id       ON chunks (user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_workspace_id  ON chunks (workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── Document profiles & gap-analysis cache ──────────────────────────────
-- (created ad hoc by AI/app/services/profiler.py on first use; user_id has no
-- FK on either table, matching the live schema)
CREATE TABLE IF NOT EXISTS document_profiles (
  document_id  UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  profile      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gap_analyses (
  user_id     UUID NOT NULL,
  doc_key     TEXT NOT NULL,          -- hash of the document set
  gaps        TEXT NOT NULL,
  doc_count   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, doc_key)
);

-- ── Chat ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title         TEXT,
  mode          TEXT NOT NULL,
  document_ids  UUID[],
  is_private    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,          -- user / assistant
  content     TEXT NOT NULL,
  sources     JSONB,                  -- retrieved chunk provenance
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id);

-- ── Citations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  apa            TEXT,
  mla            TEXT,
  chicago        TEXT,
  ieee           TEXT,
  harvard        TEXT,
  raw_metadata   JSONB,               -- Crossref/arXiv payload
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Systematic reviews & screening ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS systematic_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id          UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  research_question     TEXT NOT NULL,
  inclusion_criteria    TEXT NOT NULL,
  exclusion_criteria    TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_screenings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       UUID NOT NULL REFERENCES systematic_reviews(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  decision        TEXT,                -- include / exclude / maybe — the effective decision
  reason          TEXT,
  extracted_data  JSONB,               -- { confidence }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- migration 001: screening audit trail
  ai_decision     TEXT,                -- immutable original AI decision
  ai_reason       TEXT,                -- immutable original AI justification
  reviewed_by     UUID,                -- no FK; user id who manually overrode
  reviewed_at     TIMESTAMPTZ,
  -- migration 004: verified verbatim evidence quotes [{quote, page, chunk_id}]
  evidence        JSONB
);

CREATE INDEX IF NOT EXISTS idx_review_screenings_review ON review_screenings (review_id);

-- ── Data extraction ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extraction_tables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  columns       JSONB NOT NULL,        -- column definitions
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extraction_rows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id     UUID NOT NULL REFERENCES extraction_tables(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  data         JSONB NOT NULL,         -- cell values with {page, chunk_id, source_text} provenance
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_rows_table ON extraction_rows (table_id);

-- ── AI drafts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  document_ids  UUID[],                -- source documents
  mode          TEXT NOT NULL,         -- literature review / intro / methods
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- migration 003: quote-grounding / trust metadata
  validation    JSONB
);

-- ── Zotero import ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zotero_imports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'processing',
  imported_count   INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Contact form (migration 004) ────────────────────────────────────────
-- user_id is nullable (logged-out senders allowed) and ON DELETE SET NULL so
-- deleting an account keeps the message history.
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

CREATE INDEX IF NOT EXISTS contact_messages_status_created_idx
  ON contact_messages (status, created_at DESC);

-- ── Admin audit trail (migration 004) ───────────────────────────────────
-- actor_id is SET NULL (not CASCADE) so removing an admin never erases the
-- record of what they did.
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

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
