-- DEBATE-ERROR-HANDLING-1: allow closed_reason = 'error' when invoke fails mid-debate.
-- Error text stays in server logs; partial progress remains in current_answer / rounds.

ALTER TABLE agent_debates
  DROP CONSTRAINT IF EXISTS agent_debates_closed_reason_check;

ALTER TABLE agent_debates
  ADD CONSTRAINT agent_debates_closed_reason_check
  CHECK (closed_reason IS NULL OR closed_reason IN ('confirmed', 'attempts_exhausted', 'error'));
