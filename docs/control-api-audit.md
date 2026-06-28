# Phase 0 — API Audit for Simple 2D Control Panel

Audit date: 2025-06-22. Goal: confirm reusable backend endpoints before building thin-client UI.

| Operation | Current implementation | Endpoint | Used by | Needs extraction? |
|---|---|---|---|---|
| Building create | (a) Shared endpoint: `POST /api/offices/[officeId]/objects` with `object_type: "room"` also inserts `entity_registry` building row (same id as `office_objects`) | `POST /api/offices/{officeId}/objects` | FloorScene (3D), BuildingPanel indirectly | **no** — reuse with default geometry from client |
| Building read | (a) Shared endpoint lists all office objects including rooms | `GET /api/offices/{officeId}/objects` | Floor page, BuildingPanel | **no** |
| Chamber create | (a) Shared endpoint creates `entity_registry` + `chambers` row | `POST /api/offices/{officeId}/buildings/{buildingId}/chambers` | BuildingPanel (3D) | **no** — optional geometry defaults added to shared route |
| Chamber read | (a) Per-building or global list | `GET .../chambers`, `GET /api/chambers` | BuildingPanel, FloorScene | **no** |
| Connection create | (a) Shared Sprint 4 endpoint | `POST /api/connections` | Floor cabling UI | **no** |
| Connection read/update | (a) Shared endpoints | `GET /api/connections`, `PATCH /api/connections/[id]` | Floor, tests | **no** |
| Assignment create | (a) Shared endpoint | `POST /api/chambers/{chamberId}/assignments` | ChamberPanel, FloorScene | **no** |
| Assignment delete | (a) Shared endpoint | `DELETE /api/chambers/{chamberId}/assignments/{assignmentId}` | ChamberPanel | **no** |
| Assignment read (batch) | (a) Shared batch endpoint | `GET /api/chambers/assignments` | FloorScene | **no** |
| Rules CRUD | (a) Shared endpoints | `GET/POST /api/rules`, `DELETE /api/rules/[id]` | BuildingPanel, ChamberPanel | **no** |
| Knowledge CRUD | (a) Shared endpoints | `GET/POST /api/knowledge`, `DELETE /api/knowledge/[id]` | BuildingPanel, ChamberPanel | **no** |
| Chat / Task execution | **(b)** Mission Control: `POST /api/workflows` (routing only for single mode) then client calls multiple `ask-*` routes. No unified text-in → answer-out endpoint. | `POST /api/workflows` + N× `POST /api/ask-*` | MissionControl.tsx | **yes** — thin `POST /api/chat` wrapper over `processTask` + `invokeAgentForWorkflow` |

## Chat gap (critical)

`POST /api/workflows` runs `processTask()` which either:
- **workflow mode**: executes workflow synchronously and returns steps (answer in `workflow.final_output`)
- **single mode**: returns `decision` + `agentIds` only — **does not invoke the model**

Mission Control then fans out to `/api/ask-claude`, `/api/ask-gpt`, etc. from the browser. There is no reusable server endpoint that accepts one question and returns one final answer.

**Resolution:** add `POST /api/chat` — thin orchestration only:
1. `processTask(taskText, sourceEntityId?)`
2. If workflow → return `final_output` + step summary
3. If single → `selectAgentForChamberEntity` + `invokeAgentForWorkflow` → return answer

No new business logic; same code path as workflow executor for agent invocation.

## Building ↔ office_objects sync

Creating a building via `POST /api/offices/{officeId}/objects` with `object_type: "room"` **already** creates matching `entity_registry` (entity_type `building`, id = office_object id). 2D UI must use this path — never insert `office_objects` from client-side Supabase.

## Notes

- No `/api/buildings` dedicated route; buildings are `office_objects` where `object_type = 'room'`.
- `routing_description` lives on `entity_registry`; chamber POST now accepts optional `routing_description` (shared route enhancement).
- City id (hardcoded): `f47ac10b-58cc-4372-a567-0e02b2c3d479`
