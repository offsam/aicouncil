-- TD-03C: atomic Postgres RPC for destructive structure plan execution.

CREATE OR REPLACE FUNCTION execute_destructive_structure_plan(actions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action jsonb;
  action_type text;
  v_building_id uuid;
  v_chamber_registry_id uuid;
  v_connection_id uuid;
  v_agent_id uuid;
  v_chamber_ref uuid;
  v_chamber_row_id uuid;
  executed jsonb := '[]'::jsonb;
  idx int := 0;
  detail text;
BEGIN
  IF actions IS NULL OR jsonb_typeof(actions) <> 'array' THEN
    RAISE EXCEPTION 'actions must be a JSON array';
  END IF;

  IF jsonb_array_length(actions) = 0 THEN
    RAISE EXCEPTION 'actions must not be empty';
  END IF;

  FOR action IN SELECT value FROM jsonb_array_elements(actions) AS t(value)
  LOOP
    action_type := action->>'type';

    IF action_type IS NULL OR action_type = '' THEN
      RAISE EXCEPTION 'action type is required at index %', idx;
    END IF;

    IF action_type = 'delete_building' THEN
      IF action->>'building_id' IS NULL THEN
        RAISE EXCEPTION 'delete_building requires building_id at index %', idx;
      END IF;
      v_building_id := (action->>'building_id')::uuid;

      DELETE FROM entity_registry WHERE id = v_building_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'delete_building: entity_registry row not found: %', v_building_id;
      END IF;

      DELETE FROM office_objects WHERE id = v_building_id;
      detail := format('building id=%s', v_building_id);

    ELSIF action_type = 'delete_chamber' THEN
      IF action->>'chamber_registry_id' IS NULL THEN
        RAISE EXCEPTION 'delete_chamber requires chamber_registry_id at index %', idx;
      END IF;
      v_chamber_registry_id := (action->>'chamber_registry_id')::uuid;

      DELETE FROM entity_registry WHERE id = v_chamber_registry_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'delete_chamber: entity_registry row not found: %', v_chamber_registry_id;
      END IF;

      detail := format('chamber registry id=%s', v_chamber_registry_id);

    ELSIF action_type = 'delete_connection' THEN
      IF action->>'connection_id' IS NULL THEN
        RAISE EXCEPTION 'delete_connection requires connection_id at index %', idx;
      END IF;
      v_connection_id := (action->>'connection_id')::uuid;

      DELETE FROM connections WHERE id = v_connection_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'delete_connection: connection not found: %', v_connection_id;
      END IF;

      detail := format('connection id=%s', v_connection_id);

    ELSIF action_type = 'unassign_agent' THEN
      IF action->>'agent_id' IS NULL OR action->>'chamber_ref' IS NULL THEN
        RAISE EXCEPTION 'unassign_agent requires agent_id and chamber_ref at index %', idx;
      END IF;
      v_agent_id := (action->>'agent_id')::uuid;
      v_chamber_ref := (action->>'chamber_ref')::uuid;

      SELECT c.id
      INTO v_chamber_row_id
      FROM chambers c
      WHERE c.entity_registry_id = v_chamber_ref;

      IF v_chamber_row_id IS NULL THEN
        RAISE EXCEPTION 'unassign_agent: chamber not found for ref %', v_chamber_ref;
      END IF;

      DELETE FROM agent_assignments
      WHERE agent_id = v_agent_id
        AND chamber_id = v_chamber_row_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'unassign_agent: assignment not found for agent % in chamber %',
          v_agent_id, v_chamber_row_id;
      END IF;

      detail := format('unassigned agent=%s chamber=%s', v_agent_id, v_chamber_row_id);

    ELSE
      RAISE EXCEPTION 'unsupported destructive action type: %', action_type;
    END IF;

    executed := executed || jsonb_build_array(
      jsonb_build_object(
        'actionIndex', idx,
        'type', action_type,
        'ok', true,
        'detail', detail
      )
    );
    idx := idx + 1;
  END LOOP;

  RETURN jsonb_build_object('executed', executed);
END;
$$;

REVOKE ALL ON FUNCTION execute_destructive_structure_plan(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_destructive_structure_plan(jsonb) TO service_role;
