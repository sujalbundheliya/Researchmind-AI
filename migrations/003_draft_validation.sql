-- AI draft grounding/trust metadata.
-- The rebuilt draft pipeline returns a `validation` object describing which
-- selected documents were actually used, which were dropped (no matching
-- content), which citations were rejected as hallucinated, and how many points
-- could not be grounded. Persist it so the draft view can show provenance and
-- users can trust which papers a draft was built from.

ALTER TABLE ai_drafts
  ADD COLUMN IF NOT EXISTS validation JSONB;
