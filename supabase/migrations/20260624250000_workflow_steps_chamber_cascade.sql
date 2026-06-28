-- Allow deleting a chamber entity even when old workflow steps still reference it.
ALTER TABLE workflow_steps
  DROP CONSTRAINT IF EXISTS workflow_steps_target_chamber_entity_id_fkey;

ALTER TABLE workflow_steps
  ADD CONSTRAINT workflow_steps_target_chamber_entity_id_fkey
  FOREIGN KEY (target_chamber_entity_id)
  REFERENCES entity_registry(id)
  ON DELETE CASCADE;
