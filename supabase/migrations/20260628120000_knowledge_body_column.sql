-- Separate search description (content) from full document text (body) for library catalog browsing.
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS body TEXT;

COMMENT ON COLUMN knowledge.content IS 'Short description for library catalog / search; not the full file text when body is set.';
COMMENT ON COLUMN knowledge.body IS 'Full extracted file text for agents; injected only when entry matches the user task.';
