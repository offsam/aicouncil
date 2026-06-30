# CODEX Session Plan — historical handoff

> **Status: historical.** This document records a **2026-06-25** session (Sprints 3–5) about building creation and `routing_description`. It is **not** the current architecture or backlog.
>
> For operational truth after Phase 1, see **`README.md`** (Project Status) and **`docs/migration/`**.

---

## Current architecture (post–Phase 1 summary)

| Topic | Then (this file) | Now |
|-------|------------------|-----|
| Mayor routing | `resolveRoutingDecision()` semantic matching over building list | **Mayor agent routing (MR-2)** — deterministic gates + configured Mayor LLM; `resolveRoutingDecision()` is **@deprecated** (deterministic subset only) |
| Structure changes | Not covered | **Tech Department Mutation Engine** (planner → impact → confirm → execute) |
| Office / City Hall / Tech identity | Label/name heuristics, hardcoded UUIDs | **Graph resolvers** (`graph-identity.ts`) + **require-*** invariants; `resolve-production-office.ts` **removed** |
| Building descriptions | Mandatory `routing_description` on create (Sprint 5) | Still required; feeds Mayor agent context |

### ✅ Phase 1 completed

Routing, observability, Mayor memory, Mutation Engine (planner, impact, snapshot, confirmation, atomic execute), compound detection, anaphora resolver, managed LLM roles, workspace graph identity (1A–1C), and legacy orphan cleanup.

### 🚧 Phase 2 planned

**Knowledge Connectors** — next chapter; not started. See `README.md` → Project Status.

---

## Historical record: 2026-06-25 session

Date: 2026-06-25

Handoff artifact from the session: what was checked, what was done, and follow-ups **as of that date**.

### 1. What was checked at session start

- building / chamber / agent / routing model
- UI paths that create and edit entities
- reliance on `routing_description` for routing quality
- gaps between backend and frontend

Confirmed at the time:

- `resolveRoutingDecision()` used only `id`, `name`, `routing_description` of buildings (**since superseded by MR-2**)
- empty or test `routing_description` values hurt semantic matching
- clarifying messages did not retain building context without explicit mention
- test buildings polluted the routing prompt

### 2. Work done before this file

**Sprint 3** — route animation dimming/highlight cycle; type fixes; clean `tsc`.

**Sprint 4** — main department vs `manager_agent_id`; UI to switch building main chamber.

**Routing description** — filled descriptions for main buildings; removed test buildings from routing targets.

### 3. Sprint 5 (this session): mandatory building description

**Backend** — `object_type = "room"` requires `label` + `routing_description`; 400 if missing.

**Workspace UI** — `BuildingCreateDialog` blocks until both fields filled.

**Legacy floor/editor** — same contract in `FloorScene.tsx`.

**Scripts** — test fixtures updated to pass `routing_description`.

### 4. Verification (2026-06-25)

- `npx tsc --noEmit` — pass
- Live API: 400 without label/description; success with both

### 5. Team notes (historical)

- Routing quality still depends on good `routing_description` (feeds Mayor agent context today)
- Test buildings should stay out of production routing targets
- Session memory for clarifying questions was an open risk (**partially addressed later** by Mayor memory + anaphora work in Phase 1)

### 6. Follow-ups from that session (may be done or obsolete)

1. Smoke-test building create in workspace and `/structure`
2. Improve remaining `routing_description` values
3. Design last-target / session memory for Mayor clarifications → **see Phase 1 Mayor memory**

### 7. Key files (Sprint 5 scope)

- `app/api/offices/[officeId]/objects/route.ts`
- `lib/entity-registry-ensure.ts`
- `components/workspace/BuildingCreateDialog.tsx`
- `components/workspace/WorkspaceToolbar.tsx`
- `components/workspace/WorkspaceCanvas.tsx`
- `components/floor/FloorScene.tsx`
- `app/structure/page.tsx`
- `lib/workspace/i18n/messages.ts`

### 8. Session outcome (2026-06-25)

Building creation requires meaningful `routing_description` on backend and main UI paths; legacy editor path aligned. Project was in a better state for routing data quality — **before** the Phase 1 Mayor agent and Mutation Engine work that followed.
