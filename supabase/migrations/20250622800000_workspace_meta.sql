-- Workspace canvas: City Hall position + viewport (MVP W1)

ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS workspace_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
