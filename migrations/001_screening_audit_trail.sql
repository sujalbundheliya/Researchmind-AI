-- Q6 — Screening audit trail.
-- Preserve the AI's original screening decision/reason separately from the
-- effective ("final") decision, and record who overrode it and when.
--
-- Semantics:
--   decision      = the effective / final decision (kept; what is displayed & counted)
--   ai_decision   = immutable original AI decision (never updated after first screen)
--   ai_reason     = immutable original AI justification
--   reviewed_by   = user id who manually overrode (NULL = never overridden)
--   reviewed_at   = timestamp of the manual override (NULL = never overridden)

ALTER TABLE review_screenings
  ADD COLUMN IF NOT EXISTS ai_decision TEXT,
  ADD COLUMN IF NOT EXISTS ai_reason   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Backfill: rows created before this migration have no separate AI record, so
-- treat their current decision/reason as the AI original (no known override).
UPDATE review_screenings
   SET ai_decision = decision,
       ai_reason   = reason
 WHERE ai_decision IS NULL;
