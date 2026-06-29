-- Allow explicit failed status after partial structure plan execution.

ALTER TABLE tech_structure_plans
  DROP CONSTRAINT IF EXISTS tech_structure_plans_status_check;

ALTER TABLE tech_structure_plans
  ADD CONSTRAINT tech_structure_plans_status_check
  CHECK (status IN ('pending', 'executed', 'cancelled', 'expired', 'failed'));
