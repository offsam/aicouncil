# Workspace Stage 1 Closeout

Stage 1 of the `/workspace` visual-language pass is closed in code.

## Done

- Added the new workspace color tokens in `app/globals.css`.
- Kept the canvas dark, with a subtle grid background and no full-canvas glow.
- Tightened the node shell, status, avatar, and tooltip treatment for building / chamber / agent cards.
- Kept agent nodes on the 3-level `free / mid / premium` cost tier system.
- Kept route and connection highlighting on real routing state, with the cable visuals moved closer to the thin-line spec.

## Real data used

- Building count: `chambers` + `agent_assignments`
- Chamber count: `agent_assignments`
- Agent status: `agents.status`
- Agent tier: `agents.cost_tier`
- Main chamber marker: `chambers.routing_role`

## Blocked

- Building and chamber do not have a dedicated status field in the current schema, so there is no real status glow to attach there without a backend/schema change.
- Browser screenshot and FPS evidence were not captured in this pass because the current sandbox does not have the browser runtime available for this repo, and direct network access for local/browser verification is blocked in the shell.

## Future Improvements

- Stage 2: inspector / right-side panel polish.
- Stage 3: toolbar / top-level controls polish.
- If the schema later gains building/chamber status fields, wire those into the same status-glow system used by agents.

## Files changed

- `app/globals.css`
- `components/workspace/ConnectionEdge.tsx`

