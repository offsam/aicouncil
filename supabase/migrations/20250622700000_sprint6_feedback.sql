-- Sprint 6: Feedback & Evaluation Layer

ALTER TABLE routing_logs
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'unrated'
    CHECK (outcome IN ('good', 'bad', 'unrated'));

UPDATE routing_logs SET outcome = 'unrated' WHERE outcome IS NULL;

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'unrated'
    CHECK (outcome IN ('good', 'bad', 'unrated')),
  ADD COLUMN IF NOT EXISTS outcome_reason TEXT;

UPDATE workflows SET outcome = 'unrated' WHERE outcome IS NULL;

-- Diagnostic aggregation only — not a precise quality metric per department.
-- High bad% means "look closer", not "routing was wrong". Human interprets.
CREATE OR REPLACE VIEW routing_outcomes_summary AS
SELECT
  chosen_target_entity_registry_id,
  count(*) AS total,
  count(*) FILTER (WHERE outcome = 'good') AS good_count,
  count(*) FILTER (WHERE outcome = 'bad') AS bad_count,
  count(*) FILTER (WHERE outcome = 'unrated') AS unrated_count
FROM routing_logs
GROUP BY chosen_target_entity_registry_id;
