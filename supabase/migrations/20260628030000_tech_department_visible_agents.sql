-- Tech Department: full tier roster + canvas layout (visible like other buildings).

-- Standard roster: free / cheap / mid / premium (same agents as city-wide pool).
INSERT INTO agent_assignments (agent_id, chamber_id, role, layout_x, layout_y)
SELECT v.agent_id, 'a1000000-0000-4000-8000-000000000004', v.role, v.layout_x, v.layout_y
FROM (
  VALUES
    ('a1000005-0000-4000-8000-000000000005'::uuid, 'coder',  -0.8::double precision, -0.5::double precision),
    ('a1000006-0000-4000-8000-000000000006'::uuid, 'coder',   0.0::double precision, -0.5::double precision),
    ('a1000004-0000-4000-8000-000000000004'::uuid, 'coder',   0.8::double precision, -0.5::double precision),
    ('a100000b-0000-4000-8000-00000000000b'::uuid, 'coder',  -0.4::double precision,  0.5::double precision),
    ('a1000002-0000-4000-8000-000000000002'::uuid, 'coder',   0.4::double precision,  0.5::double precision)
) AS v(agent_id, role, layout_x, layout_y)
WHERE EXISTS (
  SELECT 1 FROM chambers c WHERE c.id = 'a1000000-0000-4000-8000-000000000004'
)
ON CONFLICT (agent_id, chamber_id) DO UPDATE
SET
  layout_x = EXCLUDED.layout_x,
  layout_y = EXCLUDED.layout_y,
  role = EXCLUDED.role;
